import { groupsData, manualContactsData } from "../data/groups.ts";
import type { AuthUser, ManualContactRecord } from "../data/types.ts";
import type { Db } from "../db/client.ts";
import { uniqueViolation } from "../db/errors.ts";
import { badRequest, conflict, notFound } from "../errors.ts";
import { pickPhone } from "../../lib/phone.ts";
import { isUuid } from "./access.ts";

export type GroupInput = { nome: string; descricao: string };

const HUBSPOT_ID = /^\d{1,20}$/;
const MANUAL_PREFIX = "manual-";
const DUPLICADO = () => conflict("Já existe um grupo com esse nome.", "grupo_duplicado");

function validate(input: GroupInput): GroupInput {
  const nome = input.nome.trim();
  const descricao = input.descricao.trim();
  if (!nome) throw badRequest("Informe o nome do grupo.");
  if (nome.length > 120) throw badRequest("O nome do grupo pode ter até 120 caracteres.");
  if (descricao.length > 500) throw badRequest("A descrição pode ter até 500 caracteres.");
  return { nome, descricao };
}

/** Forma que a interface usa para um contato manual (id com prefixo, telefone formatado). */
export function manualContactView(c: ManualContactRecord) {
  const fone = pickPhone({ mobilephone: c.telefone });
  return { id: `${MANUAL_PREFIX}${c.id}`, nome: c.nome, telefone: fone.ok ? fone.formatted : c.telefone, email: c.email, empresa: c.empresa };
}

const ownGroup = async (db: Db, user: AuthUser, id: string) => {
  const g = await groupsData.find(db, user.accountId, id);
  if (!g) throw notFound("Grupo não encontrado.");
  return g;
};

/** Grupos pertencem ao setor da sessão. */
export const groupsService = {
  list: (db: Db, user: AuthUser) => groupsData.list(db, user.accountId),

  async create(db: Db, user: AuthUser, raw: GroupInput) {
    const input = validate(raw);
    try {
      return await groupsData.create(db, { accountId: user.accountId, ...input, userId: user.id });
    } catch (e) {
      if (uniqueViolation(e) !== null) throw DUPLICADO();
      throw e;
    }
  },

  async update(db: Db, user: AuthUser, id: string, raw: GroupInput) {
    const input = validate(raw);
    try {
      if (!(await groupsData.update(db, user.accountId, id, input))) throw notFound("Grupo não encontrado.");
    } catch (e) {
      if (uniqueViolation(e) !== null) throw DUPLICADO();
      throw e;
    }
    return ownGroup(db, user, id);
  },

  async remove(db: Db, user: AuthUser, id: string) {
    await db.transaction(async (tx) => {
      await ownGroup(tx, user, id);
      const uso = await groupsData.countOpenCampaigns(tx, user.accountId, id);
      if (uso > 0) throw conflict(`Este grupo é usado em ${uso} campanha(s) em aberto.`, "grupo_em_uso");
      await groupsData.remove(tx, user.accountId, id);
    });
  },

  /**
   * Adiciona contatos do HubSpot (somente os ids; nada é copiado nem alterado no HubSpot).
   * A validação do telefone é feita pela interface, que é quem lê o HubSpot; o servidor valida o formato do id.
   */
  async addHubspotContacts(db: Db, user: AuthUser, id: string, ids: string[]) {
    const unicos = [...new Set(ids)];
    if (unicos.some((x) => !HUBSPOT_ID.test(x))) throw badRequest("Contato inválido.");
    await ownGroup(db, user, id);
    return { added: await groupsData.addHubspotMembers(db, id, unicos) };
  },

  /** Cadastra um contato manual no setor (reaproveita se o telefone já existir) e o coloca no grupo. */
  async addManualContact(db: Db, user: AuthUser, id: string, input: { nome: string; telefone: string; email?: string | undefined; empresa?: string | undefined }) {
    const nome = input.nome.trim();
    if (!nome) throw badRequest("Informe o nome do contato.");
    if (nome.length > 120) throw badRequest("O nome do contato pode ter até 120 caracteres.");
    const email = (input.email ?? "").trim();
    const empresa = (input.empresa ?? "").trim();
    if (email.length > 254 || empresa.length > 120) throw badRequest("E-mail ou empresa grandes demais.");
    const fone = pickPhone({ mobilephone: input.telefone });
    if (!fone.ok) {
      throw badRequest(fone.issue === "sem_telefone" ? "Informe o telefone do contato." : "Telefone inválido. Use um celular com DDD, ex.: (21) 98891-0018.", "telefone_invalido");
    }

    return db.transaction(async (tx) => {
      await ownGroup(tx, user, id);
      const existente = await manualContactsData.findByPhone(tx, user.accountId, fone.e164);
      const contato = existente ?? (await manualContactsData.create(tx, { accountId: user.accountId, nome, telefone: fone.e164, email, empresa }));
      if (!(await groupsData.addManualMember(tx, id, contato.id))) throw conflict("Este contato já está no grupo.", "contato_ja_no_grupo");
      return manualContactView(contato);
    });
  },

  /** Remove só a associação com o grupo (o contato continua existindo no HubSpot ou na lista manual). */
  async removeContacts(db: Db, user: AuthUser, id: string, refs: string[]) {
    const hubspot: string[] = [];
    const manuais: string[] = [];
    for (const ref of refs) {
      if (ref.startsWith(MANUAL_PREFIX) && isUuid(ref.slice(MANUAL_PREFIX.length))) manuais.push(ref.slice(MANUAL_PREFIX.length));
      else if (HUBSPOT_ID.test(ref)) hubspot.push(ref);
      else throw badRequest("Contato inválido.");
    }
    await ownGroup(db, user, id);
    await groupsData.removeMembers(db, id, hubspot, manuais);
  },

  async listManualContacts(db: Db, user: AuthUser) {
    return (await manualContactsData.list(db, user.accountId)).map(manualContactView);
  },
};
