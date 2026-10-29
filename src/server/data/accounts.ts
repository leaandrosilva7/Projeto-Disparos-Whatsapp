import type { Db } from "../db/client.ts";
import type { AccountRecord, SectorRecord } from "./types.ts";

type Row = { id: string; nome: string; whatsapp_numero: string | null; ativo: boolean; criado_em: Date };

const toAccount = (r: Row): AccountRecord => ({
  id: r.id,
  nome: r.nome,
  whatsappNumero: r.whatsapp_numero,
  ativo: r.ativo,
  criadoEm: r.criado_em,
});

export const accountsData = {
  async findByName(db: Db, nome: string) {
    const r = await db.query<Row>("select id, nome, whatsapp_numero, ativo, criado_em from accounts where lower(nome) = lower($1)", [nome]);
    return r.rows[0] ? toAccount(r.rows[0]) : null;
  },

  async create(db: Db, input: { nome: string }) {
    const r = await db.query<Row>(
      "insert into accounts (nome) values ($1) returning id, nome, whatsapp_numero, ativo, criado_em",
      [input.nome],
    );
    return toAccount(r.rows[0]!);
  },

  async findById(db: Db, id: string) {
    const r = await db.query<Row>("select id, nome, whatsapp_numero, ativo, criado_em from accounts where id = $1", [id]);
    return r.rows[0] ? toAccount(r.rows[0]) : null;
  },

  /** Setores com a contagem de usuários e se abrigam um ADMIN (o setor do ADMIN é protegido contra desativação). */
  async listSectors(db: Db): Promise<SectorRecord[]> {
    const r = await db.query<Row & { total_usuarios: string; tem_admin: boolean }>(
      `select a.id, a.nome, a.whatsapp_numero, a.ativo, a.criado_em,
              (select count(*) from users u where u.account_id = a.id)::text as total_usuarios,
              exists (select 1 from users u where u.account_id = a.id and u.role = 'ADMIN') as tem_admin
         from accounts a order by lower(a.nome)`,
    );
    return r.rows.map((x) => ({ ...toAccount(x), totalUsuarios: Number(x.total_usuarios), temAdmin: x.tem_admin }));
  },

  async hasAdmin(db: Db, id: string) {
    const r = await db.query("select 1 from users where account_id = $1 and role = 'ADMIN' limit 1", [id]);
    return r.rows.length > 0;
  },

  async update(db: Db, id: string, changes: { nome?: string; ativo?: boolean; whatsappNumero?: string | null }) {
    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (changes.nome !== undefined) push("nome", changes.nome);
    if (changes.ativo !== undefined) push("ativo", changes.ativo);
    if (changes.whatsappNumero !== undefined) push("whatsapp_numero", changes.whatsappNumero);
    if (!sets.length) return this.findById(db, id);
    const r = await db.query<Row>(
      `update accounts set ${sets.join(", ")}, atualizado_em = now() where id = $1 returning id, nome, whatsapp_numero, ativo, criado_em`,
      params,
    );
    return r.rows[0] ? toAccount(r.rows[0]) : null;
  },
};
