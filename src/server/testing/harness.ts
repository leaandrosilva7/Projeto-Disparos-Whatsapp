import { apiHandler } from "../api/router.ts";
import { loginHandler } from "../api/auth.ts";
import { setDb, type Db } from "../db/client.ts";
import type { AuthUser } from "../data/types.ts";
import { createFirstAdmin } from "../services/bootstrap.ts";
import { sectorsService } from "../services/sectors.ts";
import { usersService } from "../services/users.ts";
import { createTestDb, resetTestDb } from "./pglite-db.ts";

export const ORIGIN = "http://localhost:3000";
export const SENHA = "senha-bem-segura-123";

export async function openTestDb(): Promise<Db> {
  process.env["BCRYPT_COST"] = "4"; // rápido nos testes; produção usa o padrão (12)
  return createTestDb();
}

export type Seed = {
  admin: AuthUser;
  setores: { ti: string; vendas: string; suporte: string };
  operadores: { vendas: AuthUser; suporte: AuthUser };
};

/** Esvazia o banco e cria: ADMIN (setor TI), setores Vendas e Suporte e um OPERADOR em cada. Tudo pelos serviços reais. */
export async function seed(db: Db): Promise<Seed> {
  await resetTestDb(db);
  setDb(db);
  const { user, conta } = await createFirstAdmin(db, { nome: "Ana Admin", email: "admin@exemplo.com", senha: SENHA });
  const admin: AuthUser = { id: user.id, accountId: conta.id, accountNome: conta.nome, nome: user.nome, email: user.email, role: "ADMIN" };
  const vendas = await sectorsService.create(db, admin, "Vendas");
  const suporte = await sectorsService.create(db, admin, "Suporte");
  const op = async (nome: string, email: string, setor: { id: string; nome: string }): Promise<AuthUser> => {
    const u = await usersService.create(db, admin, { nome, email, senha: SENHA, setorId: setor.id });
    return { id: u.id, accountId: setor.id, accountNome: setor.nome, nome: u.nome, email: u.email, role: "OPERADOR" };
  };
  return {
    admin,
    setores: { ti: conta.id, vendas: vendas.id, suporte: suporte.id },
    operadores: { vendas: await op("Vera Vendas", "vera@exemplo.com", vendas), suporte: await op("Sidnei Suporte", "sidnei@exemplo.com", suporte) },
  };
}

/** Faz login de verdade (pelo handler) e devolve o cookie de sessão. */
export async function loginCookie(email: string, senha = SENHA): Promise<string> {
  const res = await loginHandler(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, senha }),
    }),
  );
  if (res.status !== 200) throw new Error(`login falhou para ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

export type ApiResult = { status: number; body: any; raw: Response };

/** Chama o despachante da API como o navegador faria (mesma origem, JSON, cookie). */
export async function api(cookie: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult> {
  const init: RequestInit = {
    method,
    headers: {
      origin: ORIGIN,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const raw = await apiHandler(new Request(`${ORIGIN}/api${path}`, init));
  const text = await raw.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: raw.status, body: parsed, raw };
}

export const amanha = () => new Date(Date.now() + 24 * 3600_000).toISOString();

/** Telefones de celular válidos, distintos entre si. */
export const fone = (n: number) => `(21) 98891-${String(1000 + n)}`;
