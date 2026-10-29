import type { Db } from "../db/client.ts";
import type { GroupRecord, ManualContactRecord } from "./types.ts";

type Row = { id: string; account_id: string; nome: string; descricao: string; criado_em: string; contato_ids: string[] };

/** `contato_ids`: id do HubSpot ou `manual-<uuid>`, na ordem em que foram adicionados. */
const SELECT = `
  select g.id, g.account_id, g.nome, g.descricao,
         to_char(g.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as criado_em,
         coalesce((select array_agg(coalesce(m.hubspot_id, 'manual-' || m.manual_contact_id::text) order by m.adicionado_em)
                     from group_members m where m.group_id = g.id), '{}') as contato_ids
    from contact_groups g`;

const toGroup = (r: Row): GroupRecord => ({
  id: r.id,
  accountId: r.account_id,
  nome: r.nome,
  descricao: r.descricao,
  contatoIds: r.contato_ids,
  criadoEm: r.criado_em,
});

export const groupsData = {
  async list(db: Db, accountId: string) {
    const r = await db.query<Row>(`${SELECT} where g.account_id = $1 order by g.criado_em desc, g.id`, [accountId]);
    return r.rows.map(toGroup);
  },

  async find(db: Db, accountId: string, id: string) {
    const r = await db.query<Row>(`${SELECT} where g.id = $1 and g.account_id = $2`, [id, accountId]);
    return r.rows[0] ? toGroup(r.rows[0]) : null;
  },

  /** Quais dos ids informados são grupos DESTA conta (ids de outro setor simplesmente não voltam). */
  async findOwnedIds(db: Db, accountId: string, ids: string[]) {
    if (!ids.length) return [];
    const r = await db.query<{ id: string }>("select id from contact_groups where account_id = $1 and id = any($2::uuid[])", [accountId, ids]);
    return r.rows.map((x) => x.id);
  },

  async create(db: Db, input: { accountId: string; nome: string; descricao: string; userId: string }) {
    const r = await db.query<{ id: string }>(
      "insert into contact_groups (account_id, nome, descricao, criado_por) values ($1, $2, $3, $4) returning id",
      [input.accountId, input.nome, input.descricao, input.userId],
    );
    return (await this.find(db, input.accountId, r.rows[0]!.id))!;
  },

  async update(db: Db, accountId: string, id: string, input: { nome: string; descricao: string }) {
    const r = await db.query("update contact_groups set nome = $3, descricao = $4, atualizado_em = now() where id = $1 and account_id = $2", [
      id,
      accountId,
      input.nome,
      input.descricao,
    ]);
    return r.rowCount > 0;
  },

  async countOpenCampaigns(db: Db, accountId: string, id: string) {
    const r = await db.query<{ n: string }>(
      `select count(distinct c.id)::text as n
         from campaigns c join campaign_groups cg on cg.campaign_id = c.id
        where c.account_id = $1 and cg.group_id = $2 and c.status not in ('Concluída', 'Cancelada')`,
      [accountId, id],
    );
    return Number(r.rows[0]!.n);
  },

  async remove(db: Db, accountId: string, id: string) {
    const r = await db.query("delete from contact_groups where id = $1 and account_id = $2", [id, accountId]);
    return r.rowCount > 0;
  },

  /** Adiciona ids do HubSpot sem duplicar. Retorna quantos entraram de fato. */
  async addHubspotMembers(db: Db, groupId: string, hubspotIds: string[]) {
    if (!hubspotIds.length) return 0;
    const r = await db.query(
      `insert into group_members (group_id, hubspot_id)
       select $1, x from unnest($2::text[]) as x
       on conflict do nothing`,
      [groupId, hubspotIds],
    );
    return r.rowCount;
  },

  async addManualMember(db: Db, groupId: string, manualContactId: string) {
    const r = await db.query("insert into group_members (group_id, manual_contact_id) values ($1, $2) on conflict do nothing", [groupId, manualContactId]);
    return r.rowCount > 0;
  },

  /** `refs`: ids do HubSpot e/ou `manual-<uuid>`. Remove apenas a associação com o grupo. */
  async removeMembers(db: Db, groupId: string, hubspotIds: string[], manualIds: string[]) {
    await db.query(
      `delete from group_members
        where group_id = $1 and (hubspot_id = any($2::text[]) or manual_contact_id = any($3::uuid[]))`,
      [groupId, hubspotIds, manualIds],
    );
  },

  /** Contatos únicos (sem repetir quem está em mais de um grupo) dos grupos informados. */
  async countUniqueContacts(db: Db, groupIds: string[]) {
    if (!groupIds.length) return 0;
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from (
         select coalesce(hubspot_id, manual_contact_id::text) from group_members where group_id = any($1::uuid[]) group by 1
       ) u`,
      [groupIds],
    );
    return Number(r.rows[0]!.n);
  },
};

type ManualRow = { id: string; nome: string; telefone: string; email: string; empresa: string };
const toManual = (r: ManualRow): ManualContactRecord => ({ id: r.id, nome: r.nome, telefone: r.telefone, email: r.email, empresa: r.empresa });

export const manualContactsData = {
  async list(db: Db, accountId: string) {
    const r = await db.query<ManualRow>("select id, nome, telefone, email, empresa from manual_contacts where account_id = $1 order by criado_em, id", [accountId]);
    return r.rows.map(toManual);
  },

  async findByPhone(db: Db, accountId: string, telefone: string) {
    const r = await db.query<ManualRow>("select id, nome, telefone, email, empresa from manual_contacts where account_id = $1 and telefone = $2", [accountId, telefone]);
    return r.rows[0] ? toManual(r.rows[0]) : null;
  },

  async create(db: Db, input: { accountId: string; nome: string; telefone: string; email: string; empresa: string }) {
    const r = await db.query<ManualRow>(
      "insert into manual_contacts (account_id, nome, telefone, email, empresa) values ($1, $2, $3, $4, $5) returning id, nome, telefone, email, empresa",
      [input.accountId, input.nome, input.telefone, input.email, input.empresa],
    );
    return toManual(r.rows[0]!);
  },
};
