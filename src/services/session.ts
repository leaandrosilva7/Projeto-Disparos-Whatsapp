import { createServerFn } from "@tanstack/react-start";

/**
 * Usuário da sessão atual (ou null). Roda no servidor — no SSR direto, e via chamada interna a partir do
 * navegador — e lê o cookie HttpOnly, que o JavaScript do navegador não enxerga. Usado pelos guards de rota.
 */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const [{ getRequest }, { currentUserFromRequest }, { getDb }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/server/api/auth"),
    import("@/server/db/client"),
  ]);
  return currentUserFromRequest(getRequest(), getDb());
});
