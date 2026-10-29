// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { currentUserFromRequest } from "./auth";
import { API_ROUTES } from "./router";
import { createFirstAdmin } from "../services/bootstrap";
import { amanha, api, fone, loginCookie, openTestDb, ORIGIN, seed, SENHA, type Seed } from "../testing/harness";
import { resetTestDb } from "../testing/pglite-db";

let db: Db;
let s: Seed;
let adm: string;
let vendas: string;
let suporte: string;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

beforeEach(async () => {
  s = await seed(db);
  [adm, vendas, suporte] = await Promise.all([loginCookie("admin@exemplo.com"), loginCookie("vera@exemplo.com"), loginCookie("sidnei@exemplo.com")]);
});

/** Cria grupo com contato + template + campanha (modo manual) no setor da sessão informada. */
async function campanhaDe(cookie: string, nome: string) {
  const g = (await api(cookie, "POST", "/grupos", { nome: `Grupo ${nome}` })).body.grupo;
  await api(cookie, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ["1001"] });
  const t = (await api(cookie, "POST", "/templates", { nome: `Template ${nome}`, conteudo: "Oi {{nome}}" })).body.template;
  const c = await api(cookie, "POST", "/campanhas", { nome, grupoIds: [g.id], templateId: t.id, modo: "manual" });
  expect(c.status).toBe(201);
  return { grupo: g, template: t, campanha: c.body.campanha };
}

describe("rotas sem autenticação", () => {
  it("TODAS as rotas da API respondem 401 sem sessão (nenhuma rota fica esquecida)", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    for (const r of API_ROUTES) {
      const res = await api(null, r.method, r.path.replace(/:\w+/g, id), r.method === "GET" ? undefined : {});
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it("caminhos inexistentes também exigem sessão, e com sessão dão 404 (sem vazar nada)", async () => {
    expect((await api(null, "GET", "/qualquer-coisa")).status).toBe(401);
    expect((await api(null, "POST", "/bootstrap", {})).status).toBe(401);
    const res = await api(adm, "GET", "/qualquer-coisa");
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/select|postgres|stack/i);
  });

  it("cookie inventado, malformado ou de sessão encerrada não autentica", async () => {
    expect((await api("session=" + "x".repeat(43), "GET", "/templates")).status).toBe(401);
    expect((await api("session=lixo", "GET", "/templates")).status).toBe(401);
    await api(vendas, "POST", "/templates", { nome: "T", conteudo: "oi" }); // sessão válida funciona...
    await db.query("delete from sessions"); // ...até o servidor encerrá-la
    expect((await api(vendas, "GET", "/templates")).status).toBe(401);
  });

  it("o guard das páginas (SSR) vê 'sem usuário' sem cookie e o usuário com cookie", async () => {
    expect(await currentUserFromRequest(new Request(`${ORIGIN}/dashboard`), db)).toBeNull();
    const u = await currentUserFromRequest(new Request(`${ORIGIN}/dashboard`, { headers: { cookie: vendas } }), db);
    expect(u).toMatchObject({ email: "vera@exemplo.com", role: "OPERADOR", conta: { nome: "Vendas" } });
  });

  it("recusa mutação vinda de outra origem mesmo com cookie válido (CSRF)", async () => {
    const res = await api(vendas, "POST", "/templates", { nome: "X", conteudo: "oi" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await db.query("select 1 from templates")).rowCount).toBe(0);
  });
});

describe("OPERADOR não executa operações administrativas", () => {
  const rotasAdmin = API_ROUTES.filter((r) => r.roles?.includes("ADMIN"));

  it("toda rota administrativa devolve 403 para OPERADOR e funciona para ADMIN", async () => {
    expect(rotasAdmin.length).toBeGreaterThanOrEqual(6);
    const id = s.operadores.vendas.id;
    for (const r of rotasAdmin) {
      const path = r.path.replace(/:\w+/g, id);
      const res = await api(vendas, r.method, path, r.method === "GET" ? undefined : {});
      expect(res.status, `${r.method} ${r.path}`).toBe(403);
    }
    expect((await api(adm, "GET", "/admin/usuarios")).status).toBe(200);
    expect((await api(adm, "GET", "/admin/setores")).status).toBe(200);
  });

  it("tentativas reais de criar usuário/setor ou promover a si mesmo não têm efeito", async () => {
    const antes = (await db.query("select 1 from users")).rowCount;
    expect((await api(vendas, "POST", "/admin/usuarios", { nome: "Hack", email: "hack@x.com", senha: SENHA, setorId: s.setores.vendas, role: "ADMIN" })).status).toBe(403);
    expect((await api(vendas, "PATCH", `/admin/usuarios/${s.operadores.vendas.id}`, { role: "ADMIN", ativo: true })).status).toBe(403);
    expect((await api(vendas, "POST", "/admin/setores", { nome: "Novo" })).status).toBe(403);
    expect((await db.query("select 1 from users")).rowCount).toBe(antes);
    const papel = await db.query<{ role: string }>("select role from users where id = $1", [s.operadores.vendas.id]);
    expect(papel.rows[0]!.role).toBe("OPERADOR");
  });

  it("nem o ADMIN cria outro ADMIN pela API: o papel enviado é ignorado e a conta sai como OPERADOR", async () => {
    const res = await api(adm, "POST", "/admin/usuarios", { nome: "Novo", email: "novo@exemplo.com", senha: SENHA, setorId: s.setores.suporte, role: "ADMIN" });
    expect(res.status).toBe(201);
    expect(res.body.usuario.role).toBe("OPERADOR");
  });

  it("contas administrativas não podem ser alteradas pela rota de usuários", async () => {
    const res = await api(adm, "PATCH", `/admin/usuarios/${s.admin.id}`, { ativo: false });
    expect(res.status).toBe(403);
    expect((await db.query<{ ativo: boolean }>("select ativo from users where id = $1", [s.admin.id])).rows[0]!.ativo).toBe(true);
  });
});

describe("gestão de usuários e setores pelo ADMIN", () => {
  it("cria, consulta, edita e desativa operadores de qualquer setor, sem expor hash", async () => {
    const criado = await api(adm, "POST", "/admin/usuarios", { nome: "Nova Pessoa", email: " NOVA@Exemplo.com ", senha: SENHA, setorId: s.setores.suporte });
    expect(criado.status).toBe(201);
    expect(criado.body.usuario).toMatchObject({ email: "nova@exemplo.com", role: "OPERADOR", ativo: true });

    const lista = await api(adm, "GET", "/admin/usuarios");
    expect(lista.body.usuarios.map((u: { email: string }) => u.email)).toContain("nova@exemplo.com");
    expect(JSON.stringify(lista.body)).not.toMatch(/hash|\$2[aby]\$|senha/i);

    const id = criado.body.usuario.id;
    const editado = await api(adm, "PATCH", `/admin/usuarios/${id}`, { nome: "Nome Novo", setorId: s.setores.vendas });
    expect(editado.body.usuario).toMatchObject({ nome: "Nome Novo", conta: { id: s.setores.vendas } });
    expect((await api(adm, "PATCH", `/admin/usuarios/${id}`, { ativo: false })).body.usuario.ativo).toBe(false);
  });

  it("valida e-mail duplicado, senha fraca, setor inexistente/desativado e corpo vazio", async () => {
    const base = { nome: "X", email: "x@exemplo.com", senha: SENHA, setorId: s.setores.vendas };
    expect((await api(adm, "POST", "/admin/usuarios", { ...base, email: "VERA@exemplo.com" })).body.error.code).toBe("email_em_uso");
    expect((await api(adm, "POST", "/admin/usuarios", { ...base, senha: "curta" })).body.error.code).toBe("senha_fraca");
    expect((await api(adm, "POST", "/admin/usuarios", { ...base, setorId: "00000000-0000-4000-8000-000000000009" })).body.error.code).toBe("setor_invalido");
    expect((await api(adm, "POST", "/admin/usuarios", { ...base, setorId: "nao-e-uuid" })).status).toBe(400);
    expect((await api(adm, "POST", "/admin/usuarios", { ...base, email: "nao-e-email" })).status).toBe(400);
    await api(adm, "PATCH", `/admin/setores/${s.setores.suporte}`, { ativo: false });
    expect((await api(adm, "POST", "/admin/usuarios", { ...base, setorId: s.setores.suporte })).body.error.code).toBe("setor_invalido");
    expect((await api(adm, "PATCH", `/admin/usuarios/${s.operadores.vendas.id}`, {})).status).toBe(400);
  });

  it("setor do ADMIN (TI) não pode ser desativado nem renomeado; nome de setor é único", async () => {
    expect((await api(adm, "PATCH", `/admin/setores/${s.setores.ti}`, { ativo: false })).body.error.code).toBe("setor_protegido");
    expect((await api(adm, "PATCH", `/admin/setores/${s.setores.ti}`, { nome: "Outro" })).body.error.code).toBe("setor_protegido");
    expect((await api(adm, "POST", "/admin/setores", { nome: "vendas" })).body.error.code).toBe("setor_duplicado");
    const lista = (await api(adm, "GET", "/admin/setores")).body.setores;
    expect(lista.map((x: { nome: string }) => x.nome)).toEqual(["Suporte", "TI", "Vendas"]);
  });
});

describe("usuários desativados não acessam o sistema", () => {
  it("desativar o operador derruba a sessão aberta e impede novo login", async () => {
    expect((await api(vendas, "GET", "/templates")).status).toBe(200);
    expect((await api(adm, "PATCH", `/admin/usuarios/${s.operadores.vendas.id}`, { ativo: false })).status).toBe(200);
    expect((await api(vendas, "GET", "/templates")).status).toBe(401);
    expect((await db.query("select 1 from sessions where user_id = $1", [s.operadores.vendas.id])).rowCount).toBe(0);
    await expect(loginCookie("vera@exemplo.com")).rejects.toThrow(/401/);
    // reativar devolve o acesso
    await api(adm, "PATCH", `/admin/usuarios/${s.operadores.vendas.id}`, { ativo: true });
    expect(await loginCookie("vera@exemplo.com")).toMatch(/^session=/);
  });

  it("desativar o setor bloqueia todos os usuários dele, mas não os de outros setores", async () => {
    await api(adm, "PATCH", `/admin/setores/${s.setores.vendas}`, { ativo: false });
    expect((await api(vendas, "GET", "/templates")).status).toBe(401);
    expect((await api(suporte, "GET", "/templates")).status).toBe(200);
    await expect(loginCookie("vera@exemplo.com")).rejects.toThrow(/401/);
  });

  it("trocar a senha encerra as sessões antigas e a senha antiga deixa de valer", async () => {
    const nova = "outra-senha-bem-forte-9";
    expect((await api(adm, "PATCH", `/admin/usuarios/${s.operadores.vendas.id}`, { senha: nova })).status).toBe(200);
    expect((await api(vendas, "GET", "/templates")).status).toBe(401);
    await expect(loginCookie("vera@exemplo.com", SENHA)).rejects.toThrow();
    expect(await loginCookie("vera@exemplo.com", nova)).toMatch(/^session=/);
  });
});

describe("ADMIN consulta campanhas de TODOS os setores", () => {
  it("lista e abre campanhas de Vendas e Suporte mesmo pertencendo ao TI (que não tem nenhuma)", async () => {
    const v = await campanhaDe(vendas, "Black Friday");
    const su = await campanhaDe(suporte, "Pesquisa NPS");

    const res = await api(adm, "GET", "/campanhas");
    expect(res.status).toBe(200);
    const nomes = res.body.campanhas.map((c: { nome: string; contaNome: string }) => `${c.contaNome}:${c.nome}`).sort();
    expect(nomes).toEqual(["Suporte:Pesquisa NPS", "Vendas:Black Friday"]);
    expect(res.body.campanhas.every((c: { podeEditar: boolean }) => c.podeEditar === false)).toBe(true); // nenhuma é do TI

    expect((await api(adm, "GET", `/campanhas/${v.campanha.id}`)).body.campanha.nome).toBe("Black Friday");
    expect((await api(adm, "GET", `/campanhas/${su.campanha.id}`)).body.campanha.contaNome).toBe("Suporte");

    // filtro opcional por setor
    const so = await api(adm, "GET", `/campanhas?contaId=${s.setores.suporte}`);
    expect(so.body.campanhas.map((c: { nome: string }) => c.nome)).toEqual(["Pesquisa NPS"]);
  });

  it("o dashboard do ADMIN soma todos os setores; o do OPERADOR só o próprio", async () => {
    await campanhaDe(vendas, "A");
    await campanhaDe(suporte, "B");
    await db.query("update campaigns set status = 'Concluída', agendada_para = null, enviados = 10, entregues = 8 where nome = 'A'");
    await db.query("update campaigns set status = 'Concluída', agendada_para = null, enviados = 5, entregues = 5 where nome = 'B'");

    const todos = (await api(adm, "GET", "/dashboard")).body;
    expect(todos.metricas).toEqual({ campanhasConcluidas: 2, enviados: 15, entregues: 13, falhas: 2 });
    expect(todos.recentes).toHaveLength(2);
    const meu = (await api(vendas, "GET", "/dashboard")).body;
    expect(meu.metricas).toEqual({ campanhasConcluidas: 1, enviados: 10, entregues: 8, falhas: 2 });
    expect(meu.recentes.map((c: { nome: string }) => c.nome)).toEqual(["A"]);
  });

  it("ver não é alterar: o ADMIN não inicia, edita nem cancela campanha de outro setor", async () => {
    const v = await campanhaDe(vendas, "Black Friday");
    const id = v.campanha.id;
    for (const acao of ["iniciar", "pausar", "retomar", "cancelar"]) {
      expect((await api(adm, "POST", `/campanhas/${id}/${acao}`, {})).status, acao).toBe(403);
    }
    const edit = await api(adm, "PUT", `/campanhas/${id}`, { nome: "Sequestrada", grupoIds: [], templateId: null, modo: "rascunho" });
    expect(edit.status).toBe(403);
    const c = await db.query<{ nome: string; status: string }>("select nome, status from campaigns where id = $1", [id]);
    expect(c.rows[0]).toEqual({ nome: "Black Friday", status: "Rascunho" });
  });

  it("no próprio setor (TI) o ADMIN opera normalmente", async () => {
    const t = await campanhaDe(adm, "Interna TI");
    expect(t.campanha.podeEditar).toBe(true);
    expect((await api(adm, "POST", `/campanhas/${t.campanha.id}/iniciar`, {})).body.campanha.status).toBe("Em andamento");
  });
});

describe("OPERADOR não acessa campanhas de outros setores alterando IDs ou parâmetros", () => {
  it("ID de campanha de outro setor: 404 em leitura, edição e ações (indistinguível de inexistente)", async () => {
    const su = await campanhaDe(suporte, "Do Suporte");
    const id = su.campanha.id;
    const inexistente = await api(vendas, "GET", "/campanhas/00000000-0000-4000-8000-00000000abcd");
    const alheia = await api(vendas, "GET", `/campanhas/${id}`);
    expect(alheia.status).toBe(404);
    expect(alheia.body).toEqual(inexistente.body);

    for (const acao of ["iniciar", "pausar", "retomar", "cancelar"]) expect((await api(vendas, "POST", `/campanhas/${id}/${acao}`, {})).status).toBe(404);
    const edit = await api(vendas, "PUT", `/campanhas/${id}`, { nome: "Roubada", grupoIds: [], templateId: null, modo: "rascunho" });
    expect(edit.status).toBe(404);
    expect((await db.query<{ nome: string; status: string }>("select nome, status from campaigns where id = $1", [id])).rows[0]).toEqual({ nome: "Do Suporte", status: "Rascunho" });
  });

  it("a listagem nunca traz campanhas alheias; ?contaId= de outro setor é recusado", async () => {
    await campanhaDe(vendas, "Minha");
    await campanhaDe(suporte, "Alheia");
    expect((await api(vendas, "GET", "/campanhas")).body.campanhas.map((c: { nome: string }) => c.nome)).toEqual(["Minha"]);
    expect((await api(vendas, "GET", `/campanhas?contaId=${s.setores.suporte}`)).status).toBe(403);
    expect((await api(vendas, "GET", `/dashboard?contaId=${s.setores.suporte}`)).status).toBe(403);
    expect((await api(vendas, "GET", `/campanhas?contaId=${s.setores.vendas}`)).status).toBe(200); // o próprio setor pode
    expect((await api(vendas, "GET", "/campanhas?contaId=lixo")).status).toBe(400);
    // pedir "todos" misturando parâmetros de outro jeito também não amplia o acesso
    expect((await api(vendas, "GET", `/campanhas?contaId=&todos=1&role=ADMIN&accountId=${s.setores.suporte}`)).body.campanhas.map((c: { nome: string }) => c.nome)).toEqual(["Minha"]);
  });

  it("setor, papel e dono enviados no corpo são ignorados: a campanha nasce no setor da sessão", async () => {
    const g = (await api(vendas, "POST", "/grupos", { nome: "G" })).body.grupo;
    await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ["7"] });
    const t = (await api(vendas, "POST", "/templates", { nome: "T", conteudo: "oi" })).body.template;
    const res = await api(
      vendas,
      "POST",
      "/campanhas",
      { nome: "Forjada", grupoIds: [g.id], templateId: t.id, modo: "manual", accountId: s.setores.suporte, contaId: s.setores.suporte, role: "ADMIN" },
      { "x-role": "ADMIN", "x-account-id": s.setores.suporte },
    );
    expect(res.status).toBe(201);
    const row = await db.query<{ account_id: string; criado_por: string }>("select account_id, criado_por from campaigns where id = $1", [res.body.campanha.id]);
    expect(row.rows[0]).toEqual({ account_id: s.setores.vendas, criado_por: s.operadores.vendas.id });
  });

  it("não monta campanha com grupo ou template de outro setor", async () => {
    const su = await campanhaDe(suporte, "Do Suporte");
    const g = (await api(vendas, "POST", "/grupos", { nome: "Meu grupo" })).body.grupo;
    await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ["7"] });
    const t = (await api(vendas, "POST", "/templates", { nome: "Meu template", conteudo: "oi" })).body.template;

    const grupoAlheio = await api(vendas, "POST", "/campanhas", { nome: "X", grupoIds: [su.grupo.id], templateId: t.id, modo: "manual" });
    const templateAlheio = await api(vendas, "POST", "/campanhas", { nome: "Y", grupoIds: [g.id], templateId: su.template.id, modo: "manual" });
    expect(grupoAlheio.status).toBe(400);
    expect(templateAlheio.status).toBe(400);
    expect((await db.query("select 1 from campaigns where account_id = $1", [s.setores.vendas])).rowCount).toBe(0);
  });

  it("grupos, templates e contatos de outro setor também são inacessíveis por ID", async () => {
    const su = await campanhaDe(suporte, "Do Suporte");
    const gid = su.grupo.id;
    const tid = su.template.id;
    expect((await api(vendas, "GET", "/grupos")).body.grupos).toEqual([]);
    expect((await api(vendas, "GET", "/templates")).body.templates).toEqual([]);
    expect((await api(vendas, "PUT", `/grupos/${gid}`, { nome: "Tomado" })).status).toBe(404);
    expect((await api(vendas, "DELETE", `/grupos/${gid}`)).status).toBe(404);
    expect((await api(vendas, "POST", `/grupos/${gid}/contatos`, { contatoIds: ["99"] })).status).toBe(404);
    expect((await api(vendas, "POST", `/grupos/${gid}/contatos/remover`, { contatoIds: ["1001"] })).status).toBe(404);
    expect((await api(vendas, "POST", `/grupos/${gid}/contatos-manuais`, { nome: "A", telefone: fone(1) })).status).toBe(404);
    expect((await api(vendas, "PUT", `/templates/${tid}`, { nome: "Tomado", conteudo: "x" })).status).toBe(404);
    expect((await api(vendas, "DELETE", `/templates/${tid}`)).status).toBe(404);
    const g = await db.query<{ nome: string; n: string }>("select nome, (select count(*) from group_members where group_id = g.id)::text as n from contact_groups g where id = $1", [gid]);
    expect(g.rows[0]).toEqual({ nome: "Grupo Do Suporte", n: "1" });
  });
});

describe("criação segura do primeiro ADMIN", () => {
  beforeEach(async () => {
    await resetTestDb(db);
  });

  it("cria o ADMIN sempre no setor TI, com hash bcrypt, e usa o TI já existente", async () => {
    const { user, conta } = await createFirstAdmin(db, { nome: "Primeiro", email: "Primeiro@Exemplo.com", senha: SENHA });
    expect(conta.nome).toBe("TI");
    expect(user).toMatchObject({ role: "ADMIN", email: "primeiro@exemplo.com", accountId: conta.id });
    const row = await db.query<{ password_hash: string; nome: string }>("select u.password_hash, a.nome from users u join accounts a on a.id = u.account_id");
    expect(row.rows[0]!.nome).toBe("TI");
    expect(row.rows[0]!.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.rows[0]!.password_hash).not.toContain(SENHA);
  });

  it("não aceita setor escolhido pelo chamador: um 'contaNome' extra é ignorado", async () => {
    const { conta } = await createFirstAdmin(db, { nome: "P", email: "p@exemplo.com", senha: SENHA, contaNome: "Comercial" } as never);
    expect(conta.nome).toBe("TI");
  });

  it("só funciona uma vez (mesmo com o ADMIN desativado) e duas execuções simultâneas criam um único ADMIN", async () => {
    const tentativas = await Promise.allSettled([
      createFirstAdmin(db, { nome: "A", email: "a@exemplo.com", senha: SENHA }),
      createFirstAdmin(db, { nome: "B", email: "b@exemplo.com", senha: SENHA }),
    ]);
    expect(tentativas.filter((t) => t.status === "fulfilled")).toHaveLength(1);
    expect((await db.query("select 1 from users where role = 'ADMIN'")).rowCount).toBe(1);
    await db.query("update users set ativo = false");
    await expect(createFirstAdmin(db, { nome: "C", email: "c@exemplo.com", senha: SENHA })).rejects.toMatchObject({ code: "admin_ja_existe" });
  });

  it("não existe rota HTTP de bootstrap nem cadastro público", async () => {
    await createFirstAdmin(db, { nome: "A", email: "a@exemplo.com", senha: SENHA });
    const cookie = await loginCookie("a@exemplo.com");
    for (const path of ["/bootstrap", "/admin/bootstrap", "/auth/register", "/registro", "/cadastro"]) {
      expect((await api(null, "POST", path, { nome: "x", email: "x@x.com", senha: SENHA })).status, path).toBe(401);
      expect((await api(cookie, "POST", path, { nome: "x", email: "x@x.com", senha: SENHA })).status, path).toBe(404);
    }
  });

  it("rejeita senha curta, e-mail inválido e nome vazio sem criar nada", async () => {
    await expect(createFirstAdmin(db, { nome: "A", email: "a@b.co", senha: "curta" })).rejects.toMatchObject({ code: "senha_fraca" });
    await expect(createFirstAdmin(db, { nome: "A", email: "nao-e-email", senha: SENHA })).rejects.toMatchObject({ status: 400 });
    await expect(createFirstAdmin(db, { nome: "  ", email: "a@b.co", senha: SENHA })).rejects.toMatchObject({ status: 400 });
    expect((await db.query("select 1 from users")).rowCount).toBe(0);
    expect((await db.query("select 1 from accounts")).rowCount).toBe(0); // nada de setor órfão
  });
});

describe("número de WhatsApp por setor", () => {
  it("cada sessão lê e grava só o número do próprio setor, em formato E.164", async () => {
    expect((await api(vendas, "GET", "/conta/whatsapp")).body).toEqual({ numero: null, status: "indisponivel" });
    const salvo = await api(vendas, "PUT", "/conta/whatsapp", { numero: "(11) 91234-5678" });
    expect(salvo.body).toEqual({ numero: "+5511912345678", status: "indisponivel" });
    expect((await api(suporte, "GET", "/conta/whatsapp")).body.numero).toBeNull(); // outro setor não vê
    const row = await db.query<{ nome: string }>("select nome from accounts where whatsapp_numero = '+5511912345678'");
    expect(row.rows).toEqual([{ nome: "Vendas" }]);
  });

  it("recusa número inválido e número já usado por outro setor", async () => {
    expect((await api(vendas, "PUT", "/conta/whatsapp", { numero: "12345" })).body.error.code).toBe("numero_invalido");
    expect((await api(vendas, "PUT", "/conta/whatsapp", { numero: "+14155550123" })).status).toBe(400);
    await api(vendas, "PUT", "/conta/whatsapp", { numero: "(11) 91234-5678" });
    const dup = await api(suporte, "PUT", "/conta/whatsapp", { numero: "11912345678" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("numero_em_uso");
  });

  it("o ADMIN associa o número a qualquer setor; OPERADOR não consegue por essa rota", async () => {
    const res = await api(adm, "PATCH", `/admin/setores/${s.setores.suporte}`, { whatsappNumero: "(21) 98891-0018" });
    expect(res.body.setor.whatsappNumero).toBe("+5521988910018");
    expect((await api(suporte, "GET", "/conta/whatsapp")).body.numero).toBe("+5521988910018");
    expect((await api(vendas, "PATCH", `/admin/setores/${s.setores.suporte}`, { whatsappNumero: null })).status).toBe(403);
    expect((await api(adm, "PATCH", `/admin/setores/${s.setores.suporte}`, { whatsappNumero: null })).body.setor.whatsappNumero).toBeNull();
  });
});

describe("agendamento usa horário futuro e fuso explícito", () => {
  it("rejeita hora sem fuso e horário passado; aceita ISO futuro", async () => {
    const { grupo, template } = await campanhaDe(vendas, "Base");
    const base = { nome: "Agendada", grupoIds: [grupo.id], templateId: template.id, modo: "agendar" };
    expect((await api(vendas, "POST", "/campanhas", { ...base, agendadaPara: "2099-01-01T10:00" })).status).toBe(400);
    expect((await api(vendas, "POST", "/campanhas", { ...base, agendadaPara: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    const ok = await api(vendas, "POST", "/campanhas", { ...base, agendadaPara: amanha() });
    expect(ok.status).toBe(201);
    expect(ok.body.campanha.status).toBe("Agendada");
  });
});
