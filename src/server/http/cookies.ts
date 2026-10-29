import { getAppEnv, isProduction } from "../env.ts";

/**
 * Cookie de sessão: HttpOnly (JavaScript não lê), SameSite=Lax, Path=/ e, em produção, Secure.
 * Em produção usa o prefixo `__Host-`, que o navegador só aceita com Secure, Path=/ e sem Domain.
 */
export const sessionCookieName = () => (isProduction() ? "__Host-session" : "session");

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const name = sessionCookieName();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

function serialize(value: string, extra: string[]) {
  const attrs = [`${sessionCookieName()}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", ...extra];
  if (isProduction()) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildSessionCookie(token: string, expiraEm: Date) {
  const maxAge = Math.max(0, Math.floor((expiraEm.getTime() - Date.now()) / 1000));
  const ttl = getAppEnv().SESSION_TTL_HOURS * 3600;
  return serialize(token, [`Max-Age=${Math.min(maxAge, ttl)}`, `Expires=${expiraEm.toUTCString()}`]);
}

export const buildClearedCookie = () => serialize("", ["Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
