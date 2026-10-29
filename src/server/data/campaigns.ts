import type { Db } from "../db/client.ts";
import type { CampaignRecord, CampaignStatus } from "./types.ts";

type Row = {
  id: string;
  account_id: string;
  conta_nome: string;
  nome: string;
  template_id: string | null;
  template_nome: string | null;
  status: CampaignStatus;
  agendada_para: Date | null;
  total_contatos: number;
  enviados: number;
  entregues: number;
  lidos: number;
  criada_em: string;
  grupos: { id: string; nome: string }[];
};

const SELECT = `
  select c.id, c.account_id, a.nome as conta_nome, c.nome, c.template_id, t.nome as template_nome, c.status, c.agendada_para,
         c.total_contatos, c.enviados, c.entregues, c.lidos,
         to_char(c.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as criada_em,
         coalesce((select json_agg(json_build_object('id', g.id, 'nome', g.nome) order by g.nome)
                     from campaign_groups cg join contact_groups g on g.id = cg.group_id
                    where cg.campaign_id = c.id), '[]'::json) as grupos
    from campaigns c
    join accounts a on a.id = c.account_id
    left join templates t on t.id = c.template_id`;

const toCampaign = (r: Row): CampaignRecord => ({
  id: r.id,
  accountId: r.account_id,
  contaNome: r.conta_nome,
  nome: r.nome,
  grupos: r.grupos,
  templateId: r.template_id,
  templateNome: r.template_nome,
  status: r.status,
  criadaEm: r.criada_em,
  agendadaPara: r.agendada_para,
  totalContatos: r.total_contatos,
  enviados: r.enviados,
  entregues: r.entregues,
  lidos: r.lidos,
});

/**
 * `scope`: id da conta cujas campanhas podem ser lidas, ou `null` para todas (somente ADMIN; quem decide é o serviço).
 * O filtro entra na própria consulta: um id de outro setor simplesmente não é encontrado.
 */
export type Scope = string | null;

export type CampaignWrite = {
  nome: string;
  templateId: string | null;
  status: CampaignStatus;
  agendadaPara: Date | null;
  totalContatos: number;
  grupoIds: string[];
};

export const campaignsData = {
  async list(db: Db, scope: Scope, opts: { limit?: number } = {}) {
    const r = await db.query<Row>(`${SELECT} where ($1::uuid is null or c.account_id = $1) order by c.criado_em desc, c.id limit $2`, [
      scope,
      opts.limit ?? 1000,
    ]);
    return r.rows.map(toCampaign);
  },

  async find(db: Db, scope: Scope, id: string) {
    const r = await db.query<Row>(`${SELECT} where c.id = $1 and ($2::uuid is null or c.account_id = $2)`, [id, scope]);
    return r.rows[0] ? toCampaign(r.rows[0]) : null;
  },

  async insert(db: Db, accountId: string, userId: string, w: CampaignWrite) {
    const r = await db.query<{ id: string }>(
      `insert into campaigns (account_id, nome, template_id, status, agendada_para, total_contatos, criado_por)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [accountId, w.nome, w.templateId, w.status, w.agendadaPara, w.totalContatos, userId],
    );
    const id = r.rows[0]!.id;
    await this.setGroups(db, id, w.grupoIds);
    return id;
  },

  /** Atualiza só se a campanha for da conta E ainda estiver em um dos status permitidos (checagem atômica). */
  async update(db: Db, accountId: string, id: string, allowedFrom: CampaignStatus[], w: CampaignWrite) {
    const r = await db.query(
      `update campaigns set nome = $3, template_id = $4, status = $5, agendada_para = $6, total_contatos = $7, atualizado_em = now()
        where id = $1 and account_id = $2 and status = any($8::text[])`,
      [id, accountId, w.nome, w.templateId, w.status, w.agendadaPara, w.totalContatos, allowedFrom],
    );
    if (r.rowCount === 0) return false;
    await this.setGroups(db, id, w.grupoIds);
    return true;
  },

  async setGroups(db: Db, campaignId: string, groupIds: string[]) {
    await db.query("delete from campaign_groups where campaign_id = $1", [campaignId]);
    if (groupIds.length) {
      await db.query("insert into campaign_groups (campaign_id, group_id) select $1, x from unnest($2::uuid[]) as x", [campaignId, groupIds]);
    }
  },

  /** Troca de status atômica: só acontece se a campanha ainda estiver em um dos status de origem. */
  async transition(db: Db, accountId: string, id: string, allowedFrom: CampaignStatus[], to: CampaignStatus, extra: { totalContatos?: number } = {}) {
    const r = await db.query(
      `update campaigns
          set status = $4, agendada_para = null, total_contatos = coalesce($5, total_contatos), atualizado_em = now()
        where id = $1 and account_id = $2 and status = any($3::text[])`,
      [id, accountId, allowedFrom, to, extra.totalContatos ?? null],
    );
    return r.rowCount > 0;
  },

  /** Somatórios para o dashboard, no mesmo escopo da listagem. */
  async metrics(db: Db, scope: Scope) {
    const r = await db.query<{ concluidas: string; enviados: string; entregues: string }>(
      `select count(*) filter (where status = 'Concluída')::text as concluidas,
              coalesce(sum(enviados), 0)::text as enviados,
              coalesce(sum(entregues), 0)::text as entregues
         from campaigns where ($1::uuid is null or account_id = $1)`,
      [scope],
    );
    const row = r.rows[0]!;
    return { campanhasConcluidas: Number(row.concluidas), enviados: Number(row.enviados), entregues: Number(row.entregues) };
  },
};
