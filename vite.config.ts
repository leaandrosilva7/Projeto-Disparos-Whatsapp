// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

/**
 * Proxy de DESENVOLVIMENTO para o HubSpot (resolve o bloqueio de CORS).
 * O navegador chama /hubspot-api/... no próprio localhost; o servidor do Vite repassa para o HubSpot
 * e injeta o token aqui, no lado do servidor — o token não vai para o JavaScript do navegador.
 * Funciona somente com `npm run dev`; no app publicado é preciso uma rota de servidor equivalente.
 * Token lido de HUBSPOT_TOKEN (sem VITE_) no .env.local; VITE_HUBSPOT_TOKEN é aceito só por compatibilidade.
 */
const env = loadEnv("development", process.cwd(), "");
const hubspotToken = env["HUBSPOT_TOKEN"] || env["VITE_HUBSPOT_TOKEN"];
const hubspotTarget = env["HUBSPOT_API_TARGET"] || "https://api.hubapi.com";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Flag (não secreta) avisando o front-end que o proxy de desenvolvimento está disponível.
    define: { "import.meta.env.VITE_HUBSPOT_PROXY": JSON.stringify(hubspotToken ? "1" : "") },
    server: {
      proxy: hubspotToken
        ? {
            "/hubspot-api": {
              target: hubspotTarget,
              changeOrigin: true,
              rewrite: (path: string) => path.replace(/^\/hubspot-api/, ""),
              headers: { Authorization: `Bearer ${hubspotToken}` },
            },
          }
        : {},
    },
  },
});
