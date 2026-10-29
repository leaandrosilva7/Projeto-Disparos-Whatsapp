import type { Db } from "../db/client.ts";
import type { TemplateRecord } from "./types.ts";

type Row = { id: string; account_id: string; nome: string; conteudo: string; criado_em: string };

const COLS = `id, account_id, nome, conteudo, to_char(criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as criado_em`;

const toTemplate = (r: Row): TemplateRecord => ({ id: r.id, accountId: r.account_id, nome: r.nome, conteudo: r.conteudo, criadoEm: r.criado_em });

/** Toda função recebe `accountId`: o escopo do setor faz parte da própria consulta, não de um filtro posterior. */
export const templatesData = {
  async list(db: Db, accountId: string) {
    const r = await db.query<Row>(`select ${COLS} from templates where account_id = $1 order by criado_em desc, id`, [accountId]);
    return r.rows.map(toTemplate);
  },

  async find(db: Db, accountId: string, id: string) {
    const r = await db.query<Row>(`select ${COLS} from templates where id = $1 and account_id = $2`, [id, accountId]);
    return r.rows[0] ? toTemplate(r.rows[0]) : null;
  },

  async create(db: Db, input: { accountId: string; nome: string; conteudo: string; userId: string }) {
    const r = await db.query<Row>(
      `insert into templates (account_id, nome, conteudo, criado_por) values ($1, $2, $3, $4) returning ${COLS}`,
      [input.accountId, input.nome, input.conteudo, input.userId],
    );
    return toTemplate(r.rows[0]!);
  },

  async update(db: Db, accountId: string, id: string, input: { nome: string; conteudo: string }) {
    const r = await db.query<Row>(
      `update templates set nome = $3, conteudo = $4, atualizado_em = now() where id = $1 and account_id = $2 returning ${COLS}`,
      [id, accountId, input.nome, input.conteudo],
    );
    return r.rows[0] ? toTemplate(r.rows[0]) : null;
  },

  /** Quantidade de campanhas em aberto (não concluídas/canceladas) que usam o template. */
  async countOpenCampaigns(db: Db, accountId: string, id: string) {
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from campaigns where account_id = $1 and template_id = $2 and status not in ('Concluída', 'Cancelada')`,
      [accountId, id],
    );
    return Number(r.rows[0]!.n);
  },

  async remove(db: Db, accountId: string, id: string) {
    const r = await db.query("delete from templates where id = $1 and account_id = $2", [id, accountId]);
    return r.rowCount > 0;
  },
};
