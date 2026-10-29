/**
 * Pontos de integração futuros. Hoje retornam dados mockados; nenhuma chamada real é feita.
 * - HubSpot: listas e contatos (somente leitura — grupos e associações ficam no banco do app).
 *   Com VITE_HUBSPOT_TOKEN configurado usa a API real (src/services/hubspot.ts); sem ele, usa dados fictícios.
 * - Z-API: envio de mensagens WhatsApp
 */
import { apiFetch } from "./api";
import { hubspotApi, hubspotConfigured } from "./hubspot";
import { hubspotMock } from "./hubspot-mock";
import { contacts } from "./mock-data";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const hubspotSource = hubspotConfigured ? hubspotApi : hubspotMock;

export const hubspotService = {
  /** true quando há token configurado (API real); false = modo de demonstração com dados fictícios. */
  configured: hubspotConfigured,
  /** Contatos avulsos (ainda mockados): usados pelo seletor individual de contatos. */
  async listContacts() {
    await wait(350);
    return contacts;
  },
  /** Listas do HubSpot (busca por nome + paginação por offset). */
  searchLists: hubspotSource.searchLists,
  /** Contatos de uma lista, 100 por página (cursor `after`). */
  getListContacts: hubspotSource.getListContacts,
  /** Resolve contatos do HubSpot a partir dos ids guardados nos grupos. */
  getContactsByIds: hubspotSource.getContactsByIds,
};

/** Status da conexão do número no WhatsApp. "indisponivel" = Z-API ainda não consultada (nada é simulado). */
export type ConexaoStatus = "ativo" | "bloqueado" | "indisponivel";
export type ConexaoNumero = { numero: string | null; status: ConexaoStatus };

export const zapiService = {
  async sendMessage(_telefone: string, _mensagem: string) {
    // Futuro: chamada à Z-API
    return { ok: true, mock: true };
  },
  /** Número associado ao setor da sessão (banco). O status real depende da Z-API (ainda não integrada). */
  getConnection: () => apiFetch<ConexaoNumero>("/api/conta/whatsapp"),
  /** Associa o número ao setor da sessão (único entre setores). */
  saveNumber: (e164: string) => apiFetch<ConexaoNumero>("/api/conta/whatsapp", { method: "PUT", body: { numero: e164 } }),
};

export type SessionUser = { id: string; nome: string; email: string; role: "ADMIN" | "OPERADOR"; conta: { id: string; nome: string } };

/** Autenticação real: API própria com cookie de sessão HttpOnly (não há cadastro público). */
export const authService = {
  async login(email: string, senha: string) {
    return (await apiFetch<{ user: SessionUser }>("/api/auth/login", { method: "POST", body: { email, senha } })).user;
  },
  async logout() {
    await apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST", body: {} });
  },
};
