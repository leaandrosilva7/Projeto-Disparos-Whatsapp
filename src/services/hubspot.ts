/**
 * Cliente do HubSpot.
 *
 * Endpoints e campos copiados do script de teste e dos JSONs de amostra:
 *  - POST /crm/v3/lists/search                      → listas (nome, tamanho em additionalProperties.hs_list_size)
 *  - GET  /crm/v3/lists/{listId}/memberships        → ids dos membros (recordId), 100 por página
 *  - POST /crm/v3/objects/contacts/batch/read       → dados dos contatos (até 100 ids por chamada)
 *
 * Como a chamada é feita (por ordem de prioridade):
 *  1. `npm run dev` com HUBSPOT_TOKEN no .env.local → via proxy do Vite (/hubspot-api). O navegador não
 *     fala com o HubSpot (evita o bloqueio de CORS) e o token fica só no servidor. Ver vite.config.ts.
 *  2. VITE_HUBSPOT_TOKEN → direto do navegador. O HubSpot bloqueia por CORS e o token FICA VISÍVEL no
 *     JavaScript do app; só serve se VITE_HUBSPOT_BASE_URL apontar para um proxy seu.
 *  3. Sem nenhum dos dois → dados fictícios (hubspot-mock.ts).
 */
import { pickPhone } from "@/lib/phone";
import type { Contact } from "./mock-data";

/** Proxy do Vite ativo (só existe no `npm run dev`). */
const DEV_PROXY = import.meta.env.DEV && import.meta.env["VITE_HUBSPOT_PROXY"] === "1";
const BASE = DEV_PROXY ? "/hubspot-api" : ((import.meta.env["VITE_HUBSPOT_BASE_URL"] as string | undefined) ?? "https://api.hubapi.com");
/** No modo proxy o token fica no servidor; o navegador não envia Authorization. */
const TOKEN = DEV_PROXY ? undefined : (import.meta.env["VITE_HUBSPOT_TOKEN"] as string | undefined);

export const hubspotConfigured = DEV_PROXY || Boolean(TOKEN);

/* ---------- Formato bruto devolvido pela API (conforme os JSONs de teste) ---------- */

type RawList = {
  listId: string;
  name: string;
  processingType: string;
  additionalProperties?: { hs_list_size?: string };
};
type RawListsResponse = { lists?: RawList[]; total: number; hasMore: boolean; offset: number };
type RawMembersResponse = { results?: { recordId: string; membershipTimestamp: string }[]; paging?: { next?: { after: string } }; total?: number };
type RawContactProps = {
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  phone: string | null;
  mobilephone: string | null;
  company: string | null;
};
export type RawContact = { id: string; archived: boolean; properties: RawContactProps };
type RawBatchResponse = { results?: RawContact[] };

/* ---------- Tipos usados pelo app ---------- */

export type HubspotList = { id: string; nome: string; /** null quando o HubSpot não informou o tamanho */ tamanho: number | null };
export type ListsPage = { listas: HubspotList[]; total: number; /** offset da próxima página, ou null se acabou */ proximo: number | null };
export type MembersPage = { contatos: Contact[]; /** cursor da próxima página, ou null se acabou */ proximo: string | null; total: number | null };

export const CONTACT_PROPERTIES = ["firstname", "lastname", "email", "phone", "mobilephone", "company"] as const;
const PAGE_SIZE = 100;

/* ---------- Conversões ---------- */

export function toList(l: RawList): HubspotList {
  const n = Number(l.additionalProperties?.hs_list_size);
  return { id: l.listId, nome: l.name, tamanho: Number.isFinite(n) ? n : null };
}

/** Converte o contato bruto no `Contact` do app, validando o telefone. */
export function toContact(raw: RawContact): Contact {
  const p = raw.properties;
  const phone = pickPhone({ mobilephone: p.mobilephone, phone: p.phone });
  const nome = [p.firstname, p.lastname].map((v) => v?.trim()).filter(Boolean).join(" ");
  return {
    id: raw.id,
    nome,
    email: p.email?.trim() ?? "",
    empresa: p.company?.trim() ?? "",
    telefone: phone.ok ? phone.formatted : phone.raw,
    ...(phone.ok ? {} : { telefoneErro: phone.issue }),
  };
}

/* ---------- Chamadas ---------- */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), "Content-Type": "application/json" },
    });
  } catch {
    // Falha de rede ou bloqueio do navegador (CORS): o fetch nem chega a ter resposta.
    throw new Error("Não foi possível conectar ao HubSpot. Verifique sua conexão e a configuração do acesso.");
  }
  if (resp.ok) return (await resp.json()) as T;
  if (resp.status === 401) throw new Error("Token do HubSpot inválido ou expirado.");
  if (resp.status === 403) throw new Error("O token do HubSpot não tem permissão para esta consulta.");
  if (resp.status === 429) throw new Error("Muitas consultas ao HubSpot em pouco tempo. Aguarde um instante e tente de novo.");
  throw new Error(`O HubSpot respondeu com erro (${resp.status}).`);
}

export const hubspotApi = {
  async searchLists(query: string, offset = 0): Promise<ListsPage> {
    // O offset só é enviado a partir da 2ª página, para a 1ª chamada ser idêntica à já testada.
    const body = { query, count: 50, ...(offset > 0 ? { offset } : {}) };
    const dados = await call<RawListsResponse>("/crm/v3/lists/search", { method: "POST", body: JSON.stringify(body) });
    return { listas: (dados.lists ?? []).map(toList), total: dados.total, proximo: dados.hasMore ? dados.offset : null };
  },

  async getListContacts(listId: string, after?: string): Promise<MembersPage> {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (after) params.set("after", after); // mesmo tratamento do script de teste
    const membros = await call<RawMembersResponse>(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships?${params}`);
    const ids = (membros.results ?? []).map((m) => m.recordId);
    return { contatos: await readContacts(ids), proximo: membros.paging?.next?.after ?? null, total: membros.total ?? null };
  },

  async getContactsByIds(ids: string[]): Promise<Contact[]> {
    // Só ids numéricos do HubSpot; ids do mock antigo (ex.: "c1") nunca vão para a API.
    return readContacts(ids.filter((id) => /^\d+$/.test(id)));
  },
};

async function readContacts(ids: string[]): Promise<Contact[]> {
  const contatos: Contact[] = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const dados = await call<RawBatchResponse>("/crm/v3/objects/contacts/batch/read", {
      method: "POST",
      body: JSON.stringify({ properties: CONTACT_PROPERTIES, inputs: ids.slice(i, i + PAGE_SIZE).map((id) => ({ id })) }),
    });
    contatos.push(...(dados.results ?? []).map(toContact));
  }
  return contatos;
}
