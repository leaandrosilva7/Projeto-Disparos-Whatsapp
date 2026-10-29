import { notFound } from "../errors.ts";
import { json, requireAuth, requireRole, route } from "../http/api.ts";
import { adminRoutes } from "./admin.ts";
import { campaignRoutes } from "./campanhas.ts";
import { groupRoutes } from "./grupos.ts";
import type { Def } from "./kit.ts";
import { templateRoutes } from "./templates.ts";

export const API_ROUTES: Def[] = [...templateRoutes, ...groupRoutes, ...campaignRoutes, ...adminRoutes];

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(s[i]!);
    else if (seg !== s[i]) return null;
  }
  return params;
}

/**
 * Entrada única da API de negócio (`/api/*`, exceto /api/auth/*). Ordem fixa e "negado por padrão":
 *  1) origem (CSRF)  2) sessão válida — qualquer rota, até as inexistentes  3) papel exigido pela rota  4) handler.
 * Rotas novas só existem se estiverem em API_ROUTES; sem `roles`, exigem apenas sessão.
 */
export const apiHandler = route(async (request, db) => {
  const auth = await requireAuth(request, db);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");

  let pathMatched = false;
  for (const def of API_ROUTES) {
    let params: Record<string, string> | null;
    try {
      params = match(def.path, path);
    } catch {
      throw notFound(); // percent-encoding malformado
    }
    if (!params) continue;
    pathMatched = true;
    if (def.method !== request.method) continue;
    if (def.roles) requireRole(auth, ...def.roles);
    return def.handler({ request, db, auth, params, query: url.searchParams });
  }
  if (pathMatched) return json({ error: { code: "metodo_nao_permitido", message: "Método não permitido." } }, { status: 405 });
  throw notFound("Recurso não encontrado.");
});

