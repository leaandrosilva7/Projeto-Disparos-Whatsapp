import type { z } from "zod";
import type { AuthUser, Role } from "../data/types.ts";
import { getDb, type Db } from "../db/client.ts";
import { getAppEnv } from "../env.ts";
import { AppError, badRequest, forbidden, unauthorized } from "../errors.ts";
import { authenticate } from "../services/auth.ts";
import { readSessionToken } from "./cookies.ts";

const MAX_BODY_BYTES = 16 * 1024;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Resposta JSON sem cache (dados de sessão/usuário nunca devem ser guardados por proxies ou pelo navegador). */
export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

/** Converte qualquer erro em resposta. Erros inesperados são registrados no servidor e viram uma mensagem genérica. */
export function errorResponse(e: unknown) {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message } }, { status: e.status });
  console.error("[api] erro interno:", e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e));
  return json({ error: { code: "erro_interno", message: "Erro interno. Tente novamente em instantes." } }, { status: 500 });
}

/**
 * Proteção contra CSRF para requisições que alteram dados (a autenticação é por cookie).
 * Navegadores sempre enviam `Origin` em POST/PUT/PATCH/DELETE entre sites; se vier, tem de ser a nossa origem.
 */
export function assertSameOrigin(request: Request) {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = new Set([new URL(request.url).origin]);
    for (const o of (getAppEnv().ALLOWED_ORIGINS ?? "").split(",")) if (o.trim()) allowed.add(o.trim());
    if (!allowed.has(origin)) throw new AppError(403, "origem_invalida", "Requisição não permitida.");
    return;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AppError(403, "origem_invalida", "Requisição não permitida.");
}

/** Lê e valida o corpo JSON. Mensagens vêm dos schemas (em português) e são seguras para o usuário. */
export async function readJson<S extends z.ZodTypeAny>(request: Request, schema: S, opts: { maxBytes?: number } = {}): Promise<z.infer<S>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) throw badRequest("Envie o corpo como JSON.");
  const text = await request.text();
  if (text.length > (opts.maxBytes ?? MAX_BODY_BYTES)) throw new AppError(413, "corpo_grande", "Requisição grande demais.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest("JSON inválido.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  return parsed.data;
}

export type AuthContext = { user: AuthUser; token: string };

/** Exige sessão válida. O usuário e o papel vêm SEMPRE do banco, a partir do cookie — nunca do corpo ou de headers. */
export async function requireAuth(request: Request, db: Db): Promise<AuthContext> {
  const token = readSessionToken(request);
  const user = await authenticate(db, token);
  if (!user || !token) throw unauthorized();
  return { user, token };
}

/** Exige um dos papéis informados. Use depois de `requireAuth`. */
export function requireRole(ctx: AuthContext, ...roles: Role[]) {
  if (!roles.includes(ctx.user.role)) throw forbidden();
}

export const clientIp = (request: Request) =>
  (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) || null;

/** Envolve um handler: verifica a origem, injeta o banco e traduz erros. Todo handler da API passa por aqui. */
export function route(handler: (request: Request, db: Db) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      assertSameOrigin(request);
      return await handler(request, getDb());
    } catch (e) {
      return errorResponse(e);
    }
  };
}
