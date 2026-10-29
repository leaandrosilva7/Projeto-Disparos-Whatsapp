// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDb, type Db } from "../db/client";
import { createTestDb, resetTestDb } from "../testing/pglite-db";
import { createFirstAdmin } from "../services/bootstrap";
import { hashPassword } from "../services/password";
import { MAX_FAILED_LOGINS } from "../services/auth";
import { requireRole, type AuthContext } from "../http/api";
import { loginHandler, logoutHandler, meHandler } from "./auth";

const ORIGIN = "http://localhost:3000";
const SENHA = "senha-bem-segura-123";

let db: Db;

beforeAll(async () => {
  process.env["BCRYPT_COST"] = "4"; // rápido nos testes; produção usa o padrão (12)
  db = await createTestDb(); // um único Postgres em memória para o arquivo todo
}, 60_000);

beforeEach(async () => {
  await resetTestDb(db);
  setDb(db);
  await createFirstAdmin(db, { nome: "Ana Admin", email: "admin@exemplo.com", senha: SENHA });
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const meWith = (cookie: string) => meHandler(new Request(`${ORIGIN}/api/auth/me`, { headers: { cookie } }));
const doLogin = (email = "admin@exemplo.com", senha = SENHA) => loginHandler(post("/api/auth/login", { email, senha }));

async function createOperator(email = "op@exemplo.com", ativo = true) {
  const conta = await db.query<{ id: string }>("select id from accounts limit 1");
  await db.query("insert into users (account_id, nome, email, password_hash, role, ativo) values ($1,'Op','" + email + "',$2,'OPERADOR',$3)", [
    conta.rows[0]!.id,
    await hashPassword(SENHA),
    ativo,
  ]);
}

describe("login", () => {
  it("autentica e entrega o cookie de sessão HttpOnly sem expor segredos", async () => {
    const res = await doLogin();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.json();
    expect(body.user).toMatchObject({ nome: "Ana Admin", email: "admin@exemplo.com", role: "ADMIN", conta: { nome: "TI" } });
    expect(JSON.stringify(body)).not.toMatch(/hash|senha|password/i);
  });

  it("grava senha com bcrypt e a sessão só como hash do token", async () => {
    const res = await doLogin();
    const token = cookieOf(res).split("=")[1]!;
    const u = await db.query<{ password_hash: string }>("select password_hash from users");
    expect(u.rows[0]!.password_hash).toMatch(/^\$2[aby]\$/);
    const s = await db.query<{ token_hash: string }>("select token_hash from sessions");
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]!.token_hash).not.toBe(token);
    expect(s.rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("aceita e-mail em outra caixa e com espaços", async () => {
    expect((await doLogin("  ADMIN@Exemplo.com ")).status).toBe(200);
  });

  it("devolve a mesma resposta para senha errada e e-mail inexistente", async () => {
    const errada = await doLogin("admin@exemplo.com", "senha-errada-xx");
    const inexistente = await doLogin("ninguem@exemplo.com", SENHA);
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(await errada.json()).toEqual(await inexistente.json());
    expect(errada.headers.get("set-cookie")).toBeNull();
  });

  it("recusa usuário desativado com a mesma resposta genérica", async () => {
    await createOperator("off@exemplo.com", false);
    const res = await doLogin("off@exemplo.com");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("credenciais_invalidas");
  });

  it("bloqueia o login após várias falhas, mesmo com a senha correta, sem revelar o bloqueio", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await doLogin("admin@exemplo.com", "errada-errada-1");
    const res = await doLogin();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("credenciais_invalidas");
    await db.query("update users set bloqueado_ate = now() - interval '1 minute'");
    expect((await doLogin()).status).toBe(200);
  });

  it("valida a entrada sem vazar detalhes internos", async () => {
    const semSenha = await loginHandler(post("/api/auth/login", { email: "a@b.com" }));
    expect(semSenha.status).toBe(400);
    const naoJson = await loginHandler(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { "content-type": "text/plain", origin: ORIGIN }, body: "x" }),
    );
    expect(naoJson.status).toBe(400);
    const quebrado = await loginHandler(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{oops" }),
    );
    expect(quebrado.status).toBe(400);
  });

  it("recusa POST vindo de outra origem (CSRF)", async () => {
    const res = await loginHandler(post("/api/auth/login", { email: "admin@exemplo.com", senha: SENHA }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    const cross = await loginHandler(post("/api/auth/login", { email: "admin@exemplo.com", senha: SENHA }, { origin: "", "sec-fetch-site": "cross-site" }));
    expect(cross.status).toBe(403);
  });

  it("não vaza erro interno quando o banco falha", async () => {
    const quebrado: Db = { ...db, query: () => Promise.reject(new Error("connection to postgres://user:segredo@host failed")) };
    setDb(quebrado);
    const res = await doLogin();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/segredo|postgres:|host/);
    expect(JSON.parse(text).error.code).toBe("erro_interno");
  });
});

describe("sessão", () => {
  it("/me devolve o usuário da sessão e 401 sem cookie ou com token inventado", async () => {
    const cookie = cookieOf(await doLogin());
    const ok = await meWith(cookie);
    expect(ok.status).toBe(200);
    expect((await ok.json()).user.email).toBe("admin@exemplo.com");

    expect((await meHandler(new Request(`${ORIGIN}/api/auth/me`))).status).toBe(401);
    expect((await meWith("session=" + "a".repeat(43))).status).toBe(401);
    expect((await meWith("session=lixo")).status).toBe(401);
  });

  it("logout invalida a sessão no servidor e limpa o cookie", async () => {
    const cookie = cookieOf(await doLogin());
    const res = await logoutHandler(post("/api/auth/logout", {}, { cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await meWith(cookie)).status).toBe(401); // o cookie antigo não vale mais
    expect((await db.query("select 1 from sessions")).rowCount).toBe(0);
  });

  it("recusa sessão expirada", async () => {
    const cookie = cookieOf(await doLogin());
    await db.query("update sessions set expira_em = now() - interval '1 second'");
    expect((await meWith(cookie)).status).toBe(401);
  });

  it("desativar o usuário derruba a sessão imediatamente", async () => {
    const cookie = cookieOf(await doLogin());
    expect((await meWith(cookie)).status).toBe(200);
    await db.query("update users set ativo = false");
    expect((await meWith(cookie)).status).toBe(401);
  });

  it("desativar a conta (setor) também derruba a sessão", async () => {
    const cookie = cookieOf(await doLogin());
    await db.query("update accounts set ativo = false");
    expect((await meWith(cookie)).status).toBe(401);
  });

  it("o papel vem do banco, não de nada enviado pelo cliente", async () => {
    await createOperator();
    const res = await loginHandler(post("/api/auth/login", { email: "op@exemplo.com", senha: SENHA, role: "ADMIN" }, { "x-role": "ADMIN" }));
    const cookie = cookieOf(res);
    const me = await meHandler(new Request(`${ORIGIN}/api/auth/me?role=ADMIN`, { headers: { cookie, "x-role": "ADMIN" } }));
    expect((await me.json()).user.role).toBe("OPERADOR");
  });
});

describe("permissões por papel", () => {
  const ctx = (role: "ADMIN" | "OPERADOR"): AuthContext => ({
    token: "t",
    user: { id: "1", accountId: "1", accountNome: "x", nome: "n", email: "e@e.com", role },
  });

  it("requireRole deixa o ADMIN passar e barra o OPERADOR com 403", () => {
    expect(() => requireRole(ctx("ADMIN"), "ADMIN")).not.toThrow();
    expect(() => requireRole(ctx("OPERADOR"), "ADMIN")).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requireRole(ctx("OPERADOR"), "ADMIN", "OPERADOR")).not.toThrow();
  });
});

describe("bootstrap do primeiro ADMIN", () => {
  it("só funciona uma vez", async () => {
    await expect(
      createFirstAdmin(db, { nome: "Outro", email: "outro@exemplo.com", senha: SENHA }),
    ).rejects.toMatchObject({ code: "admin_ja_existe", status: 409 });
  });

  it("não funciona de novo nem se o admin for desativado", async () => {
    await db.query("update users set ativo = false");
    await expect(
      createFirstAdmin(db, { nome: "Outro", email: "outro@exemplo.com", senha: SENHA }),
    ).rejects.toMatchObject({ code: "admin_ja_existe" });
  });

  it("rejeita senha curta e e-mail inválido", async () => {
    await resetTestDb(db);
    const vazio = db;
    await expect(createFirstAdmin(vazio, { nome: "A", email: "a@b.co", senha: "curta" })).rejects.toMatchObject({ code: "senha_fraca" });
    await expect(createFirstAdmin(vazio, { nome: "A", email: "nao-e-email", senha: SENHA })).rejects.toMatchObject({ status: 400 });
  });

  it("o banco impede papel inválido e e-mail duplicado (sem diferenciar maiúsculas)", async () => {
    const conta = (await db.query<{ id: string }>("select id from accounts limit 1")).rows[0]!.id;
    await expect(
      db.query("insert into users (account_id, nome, email, password_hash, role) values ($1,'x','x@x.com','h','SUPERUSER')", [conta]),
    ).rejects.toThrow();
    await expect(
      db.query("insert into users (account_id, nome, email, password_hash, role) values ($1,'x','ADMIN@EXEMPLO.COM','h','OPERADOR')", [conta]),
    ).rejects.toThrow();
  });
});
