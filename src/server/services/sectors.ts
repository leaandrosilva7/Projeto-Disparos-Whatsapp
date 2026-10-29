import { accountsData } from "../data/accounts.ts";
import type { AuthUser } from "../data/types.ts";
import type { Db } from "../db/client.ts";
import { uniqueViolation } from "../db/errors.ts";
import { badRequest, conflict, notFound } from "../errors.ts";
import { pickPhone } from "../../lib/phone.ts";
import { assertAdmin } from "./access.ts";

/** Status real da conexão depende da Z-API (ainda não integrada): nada é simulado. */
export type WhatsappConnection = { numero: string | null; status: "indisponivel" };

function normalizeNumber(raw: string): string {
  const fone = pickPhone({ mobilephone: raw });
  if (!fone.ok) throw badRequest("Informe um celular válido com DDD, ex.: (11) 91234-5678.", "numero_invalido");
  return fone.e164;
}

function validateName(nome: string) {
  const n = nome.trim();
  if (!n) throw badRequest("Informe o nome do setor.");
  if (n.length > 120) throw badRequest("O nome do setor pode ter até 120 caracteres.");
  return n;
}

function mapUnique(e: unknown): never {
  const c = uniqueViolation(e);
  if (c === null) throw e;
  if (c.includes("whatsapp")) throw conflict("Este número já está associado a outro setor.", "numero_em_uso");
  throw conflict("Já existe um setor com esse nome.", "setor_duplicado");
}

async function updateAccount(db: Db, id: string, changes: Parameters<typeof accountsData.update>[2]) {
  try {
    const saved = await accountsData.update(db, id, changes);
    if (!saved) throw notFound("Setor não encontrado.");
    return saved;
  } catch (e) {
    return mapUnique(e);
  }
}

/** Número do WhatsApp do setor da própria sessão (qualquer papel; nunca de outro setor). */
export const whatsappService = {
  async get(db: Db, user: AuthUser): Promise<WhatsappConnection> {
    const conta = await accountsData.findById(db, user.accountId);
    return { numero: conta?.whatsappNumero ?? null, status: "indisponivel" };
  },

  async set(db: Db, user: AuthUser, raw: string): Promise<WhatsappConnection> {
    const saved = await updateAccount(db, user.accountId, { whatsappNumero: normalizeNumber(raw) });
    return { numero: saved.whatsappNumero, status: "indisponivel" };
  },
};

/** Gestão de setores: somente ADMIN. */
export const sectorsService = {
  list(db: Db, actor: AuthUser) {
    assertAdmin(actor);
    return accountsData.listSectors(db);
  },

  async create(db: Db, actor: AuthUser, nome: string) {
    assertAdmin(actor);
    try {
      return await accountsData.create(db, { nome: validateName(nome) });
    } catch (e) {
      return mapUnique(e);
    }
  },

  async update(db: Db, actor: AuthUser, id: string, changes: { nome?: string; ativo?: boolean; whatsappNumero?: string | null }) {
    assertAdmin(actor);
    const atual = await accountsData.findById(db, id);
    if (!atual) throw notFound("Setor não encontrado.");
    // O setor que abriga o ADMIN não pode ser renomeado nem desativado: isso trancaria o próprio administrador fora do sistema.
    if ((changes.ativo === false || (changes.nome !== undefined && changes.nome.trim().toLowerCase() !== atual.nome.toLowerCase())) && (await accountsData.hasAdmin(db, id))) {
      throw conflict("O setor do administrador não pode ser renomeado nem desativado.", "setor_protegido");
    }
    const patch: Parameters<typeof accountsData.update>[2] = {};
    if (changes.nome !== undefined) patch.nome = validateName(changes.nome);
    if (changes.ativo !== undefined) patch.ativo = changes.ativo;
    if (changes.whatsappNumero !== undefined) patch.whatsappNumero = changes.whatsappNumero === null ? null : normalizeNumber(changes.whatsappNumero);
    return updateAccount(db, id, patch);
  },
};
