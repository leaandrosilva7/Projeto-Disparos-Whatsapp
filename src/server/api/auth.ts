import { z } from "zod";
import type { AuthUser } from "../data/types.ts";
import type { Db } from "../db/client.ts";
import { buildClearedCookie, buildSessionCookie, readSessionToken } from "../http/cookies.ts";
import { authenticate, login, logout } from "../services/auth.ts";
import { clientIp, json, readJson, requireAuth, route } from "../http/api.ts";

const loginSchema = z.object({
  email: z.string({ required_error: "Informe o e-mail." }).trim().min(1, "Informe o e-mail.").max(254, "E-mail inválido."),
  senha: z.string({ required_error: "Informe a senha." }).min(1, "Informe a senha.").max(200, "Senha inválida."),
});

/** O que o frontend pode saber sobre o usuário. Nunca inclui hash, bloqueios ou dados internos. */
export const toPublicUser = (u: AuthUser) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  role: u.role,
  conta: { id: u.accountId, nome: u.accountNome },
});
export type PublicUser = ReturnType<typeof toPublicUser>;

export const loginHandler = route(async (request, db) => {
  const body = await readJson(request, loginSchema);
  const { token, expiraEm, user } = await login(db, {
    email: body.email,
    senha: body.senha,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  return json({ user: toPublicUser(user) }, { headers: { "set-cookie": buildSessionCookie(token, expiraEm) } });
});

export const logoutHandler = route(async (request, db) => {
  await logout(db, readSessionToken(request));
  return json({ ok: true }, { headers: { "set-cookie": buildClearedCookie() } });
});

export const meHandler = route(async (request, db) => {
  const { user } = await requireAuth(request, db);
  return json({ user: toPublicUser(user) });
});

/** Usado pelo guard das páginas (SSR): usuário público da sessão ou `null`, sem lançar erro. */
export async function currentUserFromRequest(request: Request, db: Db): Promise<PublicUser | null> {
  const user = await authenticate(db, readSessionToken(request));
  return user ? toPublicUser(user) : null;
}
