// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDb, type Db } from "../db/client";
import { amanha, api, fone, loginCookie, openTestDb, ORIGIN, seed, type Seed } from "../testing/harness";

let db: Db;
let s: Seed;
let vendas: string;
let suporte: string;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

beforeEach(async () => {
  s = await seed(db);
  [vendas, suporte] = await Promise.all([loginCookie("vera@exemplo.com"), loginCookie("sidnei@exemplo.com")]);
});

const grupo = async (cookie: string, nome: string, contatos: string[] = []) => {
  const r = await api(cookie, "POST", "/grupos", { nome, descricao: `desc ${nome}` });
  expect(r.status).toBe(201);
  if (contatos.length) expect((await api(cookie, "POST", `/grupos/${r.body.grupo.id}/contatos`, { contatoIds: contatos })).status).toBe(200);
  return r.body.grupo as { id: string; nome: string };
};
const template = async (cookie: string, nome: string, conteudo = "Oi {{nome}}") => {
  const r = await api(cookie, "POST", "/templates", { nome, conteudo });
  expect(r.status).toBe(201);
  return r.body.template as { id: string; nome: string };
};
const campanha = async (cookie: string, nome: string, grupoIds: string[], templateId: string, modo = "manual", extra: object = {}) =>
  api(cookie, "POST", "/campanhas", { nome, grupoIds, templateId, modo, ...extra });
const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) x`, params)).rows[0]!.n);

describe("templates: persistência real", () => {
  it("grava no banco, no setor e com o autor da sessão, e devolve o que foi gravado", async () => {
    const r = await api(vendas, "POST", "/templates", { nome: "  Boas-vindas  ", conteudo: "  Olá {{nome}}!  " });
    expect(r.status).toBe(201);
    expect(r.body.template).toMatchObject({ nome: "Boas-vindas", conteudo: "Olá {{nome}}!" });
    expect(r.body.template.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const row = await db.query<{ account_id: string; criado_por: string; nome: string }>("select account_id, criado_por, nome from templates");
    expect(row.rows).toEqual([{ account_id: s.setores.vendas, criado_por: s.operadores.vendas.id, nome: "Boas-vindas" }]);
    expect((await api(vendas, "GET", "/templates")).body.templates).toHaveLength(1);
  });

  it("edita (inclusive mantendo o mesmo nome) e exclui", async () => {
    const t = await template(vendas, "Promo");
    const ed = await api(vendas, "PUT", `/templates/${t.id}`, { nome: "Promo", conteudo: "Novo texto {{nome}}" });
    expect(ed.status).toBe(200);
    expect((await db.query<{ conteudo: string }>("select conteudo from templates")).rows[0]!.conteudo).toBe("Novo texto {{nome}}");
    expect((await api(vendas, "DELETE", `/templates/${t.id}`)).status).toBe(200);
    expect(await count("select 1 from templates")).toBe(0);
  });

  it("valida o conteúdo: vazio, variável inexistente, chaves soltas e acima de 1024 caracteres", async () => {
    for (const conteudo of ["", "   ", "Oi {{empresa}}", "Oi {{ nome }}", "Oi {{nome", "x".repeat(1025)]) {
      const r = await api(vendas, "POST", "/templates", { nome: "T", conteudo });
      expect(r.status, conteudo.slice(0, 20)).toBe(400);
    }
    expect((await api(vendas, "POST", "/templates", { nome: "", conteudo: "oi" })).status).toBe(400);
    expect((await api(vendas, "POST", "/templates", { nome: "x".repeat(121), conteudo: "oi" })).status).toBe(400);
    expect((await api(vendas, "POST", "/templates", { nome: 123, conteudo: "oi" })).status).toBe(400);
    expect(await count("select 1 from templates")).toBe(0);
  });

  it("nome único por setor, sem diferenciar maiúsculas; outro setor pode repetir o nome", async () => {
    await template(vendas, "Promoção");
    const dup = await api(vendas, "POST", "/templates", { nome: "PROMOÇÃO", conteudo: "oi" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("template_duplicado");
    expect((await api(suporte, "POST", "/templates", { nome: "Promoção", conteudo: "oi" })).status).toBe(201);
    const outro = await template(vendas, "Outro");
    expect((await api(vendas, "PUT", `/templates/${outro.id}`, { nome: "promoção", conteudo: "oi" })).status).toBe(409);
  });

  it("não exclui template de campanha em aberto; ao concluir/cancelar exclui e o histórico da campanha permanece", async () => {
    const g = await grupo(vendas, "G", ["10"]);
    const t = await template(vendas, "Usado");
    const c = (await campanha(vendas, "Camp", [g.id], t.id)).body.campanha;
    const bloqueado = await api(vendas, "DELETE", `/templates/${t.id}`);
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.error.code).toBe("template_em_uso");
    expect(await count("select 1 from templates")).toBe(1);

    await api(vendas, "POST", `/campanhas/${c.id}/cancelar`, {});
    expect((await api(vendas, "DELETE", `/templates/${t.id}`)).status).toBe(200);
    const hist = (await api(vendas, "GET", `/campanhas/${c.id}`)).body.campanha;
    expect(hist).toMatchObject({ status: "Cancelada", templateId: null, templateNome: null });
  });
});

describe("grupos e contatos: persistência real", () => {
  it("cria, edita e exclui grupos; nome único por setor", async () => {
    const g = await grupo(vendas, "Clientes VIP");
    expect(g).toMatchObject({ nome: "Clientes VIP" });
    const ed = await api(vendas, "PUT", `/grupos/${g.id}`, { nome: "VIP", descricao: "só os melhores" });
    expect(ed.body.grupo).toMatchObject({ nome: "VIP", descricao: "só os melhores", contatoIds: [] });
    expect((await api(vendas, "POST", "/grupos", { nome: "vip" })).body.error.code).toBe("grupo_duplicado");
    expect((await api(suporte, "POST", "/grupos", { nome: "VIP" })).status).toBe(201);
    expect((await api(vendas, "DELETE", `/grupos/${g.id}`)).status).toBe(200);
    expect(await count("select 1 from contact_groups where account_id = $1", [s.setores.vendas])).toBe(0);
  });

  it("guarda só as referências do HubSpot, sem duplicar, na ordem de entrada, e é idempotente", async () => {
    const g = await grupo(vendas, "G");
    const r1 = await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ["300", "100", "200", "100"] });
    expect(r1.body).toEqual({ added: 3 });
    expect((await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ["100", "400"] })).body).toEqual({ added: 1 });
    expect((await api(vendas, "GET", "/grupos")).body.grupos[0].contatoIds).toEqual(["300", "100", "200", "400"]);
    await api(vendas, "POST", `/grupos/${g.id}/contatos/remover`, { contatoIds: ["100", "999"] });
    expect((await api(vendas, "GET", "/grupos")).body.grupos[0].contatoIds).toEqual(["300", "200", "400"]);
  });

  it("recusa ids inválidos sem gravar nada (nem os válidos do mesmo pedido)", async () => {
    const g = await grupo(vendas, "G");
    for (const ids of [["c1"], ["12", "abc"], ["12 3"], ["1".repeat(21)], ["manual-x"], [""]]) {
      expect((await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ids })).status, JSON.stringify(ids)).toBe(400);
    }
    expect((await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: "123" })).status).toBe(400);
    expect(await count("select 1 from group_members")).toBe(0);
  });

  it("contato manual: valida o celular, grava em E.164, reaproveita pelo telefone e barra repetição no grupo", async () => {
    const g1 = await grupo(vendas, "G1");
    const g2 = await grupo(vendas, "G2");
    for (const telefone of ["", "12345", "(21) 3333-4444", "+14155550123"]) {
      expect((await api(vendas, "POST", `/grupos/${g1.id}/contatos-manuais`, { nome: "A", telefone })).status, telefone).toBe(400);
    }
    expect((await api(vendas, "POST", `/grupos/${g1.id}/contatos-manuais`, { nome: " ", telefone: fone(1) })).status).toBe(400);

    const r = await api(vendas, "POST", `/grupos/${g1.id}/contatos-manuais`, { nome: " Maria Souza ", telefone: "(21) 98891-0018", email: " m@x.com ", empresa: "Acme" });
    expect(r.status).toBe(201);
    expect(r.body.contato).toMatchObject({ nome: "Maria Souza", telefone: "+55 21 98891-0018", email: "m@x.com", empresa: "Acme" });
    expect(r.body.contato.id).toMatch(/^manual-[0-9a-f-]{36}$/);
    expect((await db.query<{ telefone: string }>("select telefone from manual_contacts")).rows).toEqual([{ telefone: "+5521988910018" }]);

    const dup = await api(vendas, "POST", `/grupos/${g1.id}/contatos-manuais`, { nome: "Maria", telefone: "21988910018" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("contato_ja_no_grupo");

    const noutro = await api(vendas, "POST", `/grupos/${g2.id}/contatos-manuais`, { nome: "Maria de novo", telefone: "+55 (21) 98891-0018" });
    expect(noutro.status).toBe(201);
    expect(noutro.body.contato.id).toBe(r.body.contato.id); // reaproveitado, não duplicado
    expect(await count("select 1 from manual_contacts")).toBe(1);
    expect((await api(vendas, "GET", "/contatos-manuais")).body.contatos).toHaveLength(1);
    expect((await api(suporte, "GET", "/contatos-manuais")).body.contatos).toEqual([]);
  });

  it("remover do grupo só desfaz a associação; o contato manual continua cadastrado", async () => {
    const g = await grupo(vendas, "G");
    const c = (await api(vendas, "POST", `/grupos/${g.id}/contatos-manuais`, { nome: "Ana", telefone: fone(2) })).body.contato;
    await api(vendas, "POST", `/grupos/${g.id}/contatos/remover`, { contatoIds: [c.id] });
    expect(await count("select 1 from group_members")).toBe(0);
    expect(await count("select 1 from manual_contacts")).toBe(1);
    expect((await api(vendas, "POST", `/grupos/${g.id}/contatos/remover`, { contatoIds: ["manual-lixo"] })).status).toBe(400);
  });

  it("não exclui grupo usado em campanha em aberto; depois de cancelada exclui e a campanha mantém o histórico", async () => {
    const g = await grupo(vendas, "G", ["10"]);
    const t = await template(vendas, "T");
    const c = (await campanha(vendas, "Camp", [g.id], t.id)).body.campanha;
    const r = await api(vendas, "DELETE", `/grupos/${g.id}`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("grupo_em_uso");
    await api(vendas, "POST", `/campanhas/${c.id}/cancelar`, {});
    expect((await api(vendas, "DELETE", `/grupos/${g.id}`)).status).toBe(200);
    const hist = (await api(vendas, "GET", `/campanhas/${c.id}`)).body.campanha;
    expect(hist).toMatchObject({ status: "Cancelada", grupos: [], totalContatos: 1 });
  });
});

describe("campanhas: persistência e regras", () => {
  it("salva e relê todos os campos, contando contatos únicos entre grupos", async () => {
    const a = await grupo(vendas, "A", ["1", "2", "3"]);
    const b = await grupo(vendas, "B", ["3", "4"]);
    const manual = (await api(vendas, "POST", `/grupos/${b.id}/contatos-manuais`, { nome: "M", telefone: fone(3) })).body.contato;
    await api(vendas, "POST", `/grupos/${a.id}/contatos`, { contatoIds: [] });
    const t = await template(vendas, "T");
    const r = await campanha(vendas, "  Lançamento  ", [a.id, b.id, a.id], t.id);
    expect(r.status).toBe(201);
    const c = r.body.campanha;
    expect(c).toMatchObject({ nome: "Lançamento", status: "Rascunho", agendadaPara: null, totalContatos: 5, enviados: 0, entregues: 0, lidos: 0, templateNome: "T", contaNome: "Vendas", podeEditar: true });
    expect(c.grupos.map((x: { nome: string }) => x.nome)).toEqual(["A", "B"]);
    expect(c.criadaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(manual.id).toMatch(/^manual-/);
    expect((await api(vendas, "GET", `/campanhas/${c.id}`)).body.campanha).toEqual(c);
    expect(await count("select 1 from campaign_groups where campaign_id = $1", [c.id])).toBe(2);
  });

  it("rascunho aceita dados incompletos; manual/agendar exigem grupos, template e contatos", async () => {
    const vazio = await grupo(vendas, "Vazio");
    const g = await grupo(vendas, "G", ["1"]);
    const t = await template(vendas, "T");
    expect((await api(vendas, "POST", "/campanhas", { nome: "Só nome", grupoIds: [], templateId: "", modo: "rascunho" })).status).toBe(201);
    expect((await api(vendas, "POST", "/campanhas", { nome: " ", grupoIds: [g.id], templateId: t.id, modo: "manual" })).status).toBe(400);
    expect((await api(vendas, "POST", "/campanhas", { nome: "X", grupoIds: [], templateId: t.id, modo: "manual" })).status).toBe(400);
    expect((await api(vendas, "POST", "/campanhas", { nome: "X", grupoIds: [g.id], templateId: null, modo: "manual" })).status).toBe(400);
    const semContatos = await api(vendas, "POST", "/campanhas", { nome: "X", grupoIds: [vazio.id], templateId: t.id, modo: "manual" });
    expect(semContatos.status).toBe(400);
    expect(semContatos.body.error.message).toMatch(/não têm contatos/);
    expect((await api(vendas, "POST", "/campanhas", { nome: "X", grupoIds: [g.id], templateId: t.id, modo: "inventado" })).status).toBe(400);
    expect((await api(vendas, "POST", "/campanhas", { nome: "X", grupoIds: ["lixo"], templateId: t.id, modo: "manual" })).status).toBe(400);
    expect((await api(vendas, "POST", "/campanhas", { nome: "x".repeat(121), grupoIds: [], modo: "rascunho" })).status).toBe(400);
    expect(await count("select 1 from campaigns")).toBe(1); // só o rascunho
  });

  it("edição troca grupos, template e agendamento; agendada → manual limpa a data", async () => {
    const a = await grupo(vendas, "A", ["1"]);
    const b = await grupo(vendas, "B", ["2", "3"]);
    const t1 = await template(vendas, "T1");
    const t2 = await template(vendas, "T2");
    const c = (await campanha(vendas, "Camp", [a.id], t1.id, "agendar", { agendadaPara: amanha() })).body.campanha;
    expect(c).toMatchObject({ status: "Agendada", totalContatos: 1 });
    expect(c.agendadaPara).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const ed = await api(vendas, "PUT", `/campanhas/${c.id}`, { nome: "Camp 2", grupoIds: [b.id], templateId: t2.id, modo: "manual" });
    expect(ed.status).toBe(200);
    expect(ed.body.campanha).toMatchObject({ id: c.id, nome: "Camp 2", status: "Rascunho", agendadaPara: null, totalContatos: 2, templateNome: "T2" });
    expect(ed.body.campanha.grupos.map((x: { id: string }) => x.id)).toEqual([b.id]);
    expect(await count("select 1 from campaigns")).toBe(1);
    expect(await count("select 1 from campaign_groups")).toBe(1);
  });

  it("transições de status: só as permitidas; as inválidas dão 409 e não alteram nada", async () => {
    const g = await grupo(vendas, "G", ["1"]);
    const t = await template(vendas, "T");
    const id = (await campanha(vendas, "C", [g.id], t.id)).body.campanha.id;
    const post = (acao: string) => api(vendas, "POST", `/campanhas/${id}/${acao}`, {});
    const status = async () => (await db.query<{ status: string }>("select status from campaigns where id = $1", [id])).rows[0]!.status;

    expect((await post("pausar")).status).toBe(409); // rascunho não pausa
    expect((await post("retomar")).status).toBe(409);
    expect(await status()).toBe("Rascunho");
    expect((await post("iniciar")).body.campanha.status).toBe("Em andamento");
    expect((await post("iniciar")).status).toBe(409);
    const edit = await api(vendas, "PUT", `/campanhas/${id}`, { nome: "Nova", grupoIds: [g.id], templateId: t.id, modo: "manual" });
    expect(edit.status).toBe(409);
    expect((await post("retomar")).status).toBe(409);
    expect((await post("pausar")).body.campanha.status).toBe("Pausada");
    expect((await post("pausar")).status).toBe(409);
    expect((await post("retomar")).body.campanha.status).toBe("Em andamento");
    expect((await post("cancelar")).body.campanha.status).toBe("Cancelada");
    for (const a of ["iniciar", "pausar", "retomar", "cancelar"]) expect((await post(a)).status, a).toBe(409);
    expect(await status()).toBe("Cancelada");
    expect((await db.query<{ nome: string }>("select nome from campaigns")).rows[0]!.nome).toBe("C");
  });

  it("iniciar recalcula os contatos e recusa campanha sem público ou sem template", async () => {
    const g = await grupo(vendas, "G", ["1"]);
    const t = await template(vendas, "T");
    const rascunho = (await api(vendas, "POST", "/campanhas", { nome: "Incompleta", grupoIds: [], templateId: null, modo: "rascunho" })).body.campanha;
    expect((await api(vendas, "POST", `/campanhas/${rascunho.id}/iniciar`, {})).status).toBe(400); // antes dava para iniciar rascunho vazio

    const c = (await campanha(vendas, "C", [g.id], t.id)).body.campanha;
    await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ["2", "3"] });
    const iniciada = (await api(vendas, "POST", `/campanhas/${c.id}/iniciar`, {})).body.campanha;
    expect(iniciada).toMatchObject({ status: "Em andamento", totalContatos: 3 });

    const g2 = await grupo(vendas, "G2", ["9"]);
    const c2 = (await campanha(vendas, "C2", [g2.id], t.id)).body.campanha;
    await api(vendas, "POST", `/grupos/${g2.id}/contatos/remover`, { contatoIds: ["9"] });
    const vazio = await api(vendas, "POST", `/campanhas/${c2.id}/iniciar`, {});
    expect(vazio.status).toBe(400);
    expect((await db.query<{ status: string }>("select status from campaigns where id = $1", [c2.id])).rows[0]!.status).toBe("Rascunho");
  });

  it("duas tentativas simultâneas de iniciar: exatamente uma vence, a outra recebe 409", async () => {
    const g = await grupo(vendas, "G", ["1"]);
    const t = await template(vendas, "T");
    const id = (await campanha(vendas, "C", [g.id], t.id)).body.campanha.id;
    const [a, b] = await Promise.all([api(vendas, "POST", `/campanhas/${id}/iniciar`, {}), api(vendas, "POST", `/campanhas/${id}/iniciar`, {})]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("criação simultânea com o mesmo nome: uma passa, a outra é 409 (nunca 500)", async () => {
    const r = await Promise.all([api(vendas, "POST", "/templates", { nome: "Igual", conteudo: "a" }), api(vendas, "POST", "/templates", { nome: "igual", conteudo: "b" })]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(await count("select 1 from templates")).toBe(1);
  });
});

describe("integridade no próprio banco (defesa além do código)", () => {
  const rejeita = (sql: string, params: unknown[] = []) => expect(db.query(sql, params)).rejects.toThrow();

  it("campanha: status válido, data só quando Agendada, contadores coerentes, conta existente", async () => {
    const conta = s.setores.vendas;
    await rejeita("insert into campaigns (account_id, nome, status) values ($1, 'x', 'Inventado')", [conta]);
    await rejeita("insert into campaigns (account_id, nome, status, agendada_para) values ($1, 'x', 'Rascunho', now())", [conta]);
    await rejeita("insert into campaigns (account_id, nome, status) values ($1, 'x', 'Agendada')", [conta]);
    await rejeita("insert into campaigns (account_id, nome, enviados, entregues) values ($1, 'x', 1, 2)", [conta]);
    await rejeita("insert into campaigns (account_id, nome, enviados) values ($1, 'x', -1)", [conta]);
    await rejeita("insert into campaigns (account_id, nome) values ('00000000-0000-4000-8000-000000000000', 'x')");
    await rejeita("insert into campaigns (account_id, nome) values ($1, '')", [conta]);
    expect(await count("select 1 from campaigns")).toBe(0);
  });

  it("membros de grupo: exatamente um tipo, id do HubSpot só com dígitos, sem duplicata", async () => {
    const g = await grupo(vendas, "G");
    await rejeita("insert into group_members (group_id) values ($1)", [g.id]);
    await rejeita("insert into group_members (group_id, hubspot_id) values ($1, 'abc')", [g.id]);
    await db.query("insert into group_members (group_id, hubspot_id) values ($1, '55')", [g.id]);
    await rejeita("insert into group_members (group_id, hubspot_id) values ($1, '55')", [g.id]);
    await rejeita("insert into group_members (group_id, hubspot_id) values ('00000000-0000-4000-8000-000000000000', '1')");
  });

  it("contato manual: telefone em formato de celular e único por setor", async () => {
    const conta = s.setores.vendas;
    await rejeita("insert into manual_contacts (account_id, nome, telefone) values ($1, 'x', '21988910018')", [conta]);
    await rejeita("insert into manual_contacts (account_id, nome, telefone) values ($1, 'x', '+552133334444')", [conta]);
    await db.query("insert into manual_contacts (account_id, nome, telefone) values ($1, 'a', '+5521988910018')", [conta]);
    await rejeita("insert into manual_contacts (account_id, nome, telefone) values ($1, 'b', '+5521988910018')", [conta]);
    await db.query("insert into manual_contacts (account_id, nome, telefone) values ($1, 'c', '+5521988910018')", [s.setores.suporte]); // outro setor pode
  });

  it("exclusões em cascata não deixam órfãos; setor com dados não pode ser apagado", async () => {
    const g = await grupo(vendas, "G");
    const c = (await api(vendas, "POST", `/grupos/${g.id}/contatos-manuais`, { nome: "A", telefone: fone(5) })).body.contato;
    await api(vendas, "POST", `/grupos/${g.id}/contatos`, { contatoIds: ["1"] });
    await rejeita("delete from accounts where id = $1", [s.setores.vendas]); // on delete restrict
    await db.query("delete from manual_contacts where id = $1", [c.id.replace("manual-", "")]);
    expect(await count("select 1 from group_members")).toBe(1); // só sobrou o do HubSpot
    await db.query("delete from contact_groups where id = $1", [g.id]);
    expect(await count("select 1 from group_members")).toBe(0);
  });

  it("número de WhatsApp único entre setores e sessões apagadas junto com o usuário", async () => {
    await db.query("update accounts set whatsapp_numero = '+5511912345678' where id = $1", [s.setores.vendas]);
    await rejeita("update accounts set whatsapp_numero = '+5511912345678' where id = $1", [s.setores.suporte]);
    await rejeita("update accounts set whatsapp_numero = '123' where id = $1", [s.setores.suporte]);
    expect(await count("select 1 from sessions where user_id = $1", [s.operadores.vendas.id])).toBe(1);
    await db.query("delete from users where id = $1", [s.operadores.vendas.id]);
    expect(await count("select 1 from sessions where user_id = $1", [s.operadores.vendas.id])).toBe(0);
  });
});

describe("tratamento de erros", () => {
  const raw = (cookie: string, init: RequestInit & { path: string }) =>
    import("../api/router").then(({ apiHandler }) => apiHandler(new Request(`${ORIGIN}/api${init.path}`, { ...init, headers: { origin: ORIGIN, cookie, ...(init.headers as object) } })));

  it("corpo inválido: não-JSON, JSON quebrado, grande demais e tipo errado → 4xx com mensagem segura", async () => {
    const txt = await raw(vendas, { path: "/templates", method: "POST", headers: { "content-type": "text/plain" }, body: "oi" });
    expect(txt.status).toBe(400);
    const quebrado = await raw(vendas, { path: "/templates", method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
    expect(quebrado.status).toBe(400);
    const grande = await raw(vendas, { path: "/templates", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: "a", conteudo: "x".repeat(20_000) }) });
    expect(grande.status).toBe(413);
    const array = await raw(vendas, { path: "/campanhas", method: "POST", headers: { "content-type": "application/json" }, body: "[]" });
    expect(array.status).toBe(400);
    expect(await count("select 1 from templates")).toBe(0);
  });

  it("id malformado ou inexistente → 404 (nunca erro de banco); método errado → 405", async () => {
    for (const path of ["/campanhas/lixo", "/templates/123", "/grupos/%E0%A4%A", "/campanhas/lixo/iniciar"]) {
      const r = await api(vendas, "GET", path);
      expect([404, 405], path).toContain(r.status);
    }
    expect((await api(vendas, "DELETE", "/templates/lixo")).status).toBe(404);
    expect((await api(vendas, "PUT", "/campanhas/00000000-0000-4000-8000-000000000001", { nome: "x", grupoIds: [], modo: "rascunho" })).status).toBe(404);
    expect((await api(vendas, "PATCH", "/campanhas")).status).toBe(405);
    expect((await api(vendas, "DELETE", "/dashboard")).status).toBe(405);
  });

  it("falha do banco vira 500 genérico, sem vazar credenciais ou SQL", async () => {
    const quebrado: Db = { ...db, query: () => Promise.reject(new Error("password authentication failed for user postgres at postgres://u:segredo@db.interno:5432")), transaction: () => Promise.reject(new Error("segredo")) };
    // a sessão precisa ser resolvida: injeta falha só nas rotas de negócio, depois da autenticação
    const ok = db.query.bind(db);
    let autenticou = false;
    setDb({
      ...db,
      query: (text: string, params?: unknown[]) => {
        if (!autenticou && /from sessions/.test(text)) {
          autenticou = true;
          return ok(text, params);
        }
        return quebrado.query(text, params);
      },
      transaction: quebrado.transaction,
    } as Db);
    const r = await api(vendas, "GET", "/templates");
    setDb(db);
    expect(r.status).toBe(500);
    const txt = JSON.stringify(r.body);
    expect(txt).not.toMatch(/segredo|postgres|password|db\.interno|select/i);
    expect(r.body.error.code).toBe("erro_interno");
  });

  it("transação com erro desfaz tudo (sem contato manual pela metade)", async () => {
    const g = await grupo(vendas, "G");
    await db.query("delete from contact_groups where id = $1", [g.id]); // grupo some no meio do fluxo
    const r = await api(vendas, "POST", `/grupos/${g.id}/contatos-manuais`, { nome: "A", telefone: fone(7) });
    expect(r.status).toBe(404);
    expect(await count("select 1 from manual_contacts")).toBe(0);
  });

  it("respostas da API nunca são cacheáveis e não expõem campos internos", async () => {
    await grupo(vendas, "G");
    const r = await api(vendas, "GET", "/grupos");
    expect(r.raw.headers.get("cache-control")).toBe("no-store");
    expect(r.raw.headers.get("x-content-type-options")).toBe("nosniff");
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash|token/i);
  });
});
