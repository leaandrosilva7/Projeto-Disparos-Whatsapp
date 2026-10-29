/**
 * Camada de dados de Campanhas, Grupos e Templates: cliente da API própria (as regras valem no servidor).
 * Erros chegam como `Error` com mensagem amigável, vinda do servidor.
 */
import { apiFetch } from "./api";
import type { Campaign, Contact, ContactGroup, Template } from "./mock-data";
import { store, toCampaign } from "./store";

export { canDo, isOpen, type CampaignAction } from "@/lib/campaign-rules";

/** Quantidade de contatos únicos (sem repetir quem está em mais de um grupo). Só para pré-visualização; o servidor recalcula. */
export function countUniqueContacts(groups: ContactGroup[], grupoIds: string[]) {
  return new Set(groups.filter((g) => grupoIds.includes(g.id)).flatMap((g) => g.contatoIds)).size;
}

/** Valida data/hora de agendamento (formato local "YYYY-MM-DDTHH:mm"). Retorna a mensagem de erro ou null. */
export function validateSchedule(data: string, hora: string): string | null {
  if (!data || !hora) return "Informe a data e o horário do agendamento.";
  const d = new Date(`${data}T${hora}`);
  if (Number.isNaN(d.getTime())) return "Data ou horário inválido.";
  if (d.getTime() < Date.now() + 60_000) return "Escolha uma data e horário futuros.";
  return null;
}

export type CampaignInput = {
  nome: string;
  grupoIds: string[];
  templateId: string;
  /** rascunho = salva incompleta; manual = só dispara no Iniciar; agendar = dispara na data escolhida. */
  modo: "rascunho" | "manual" | "agendar";
  /** Data/hora local "YYYY-MM-DDTHH:mm". */
  agendadaPara: string | null;
};

type CampaignAct = "iniciar" | "pausar" | "retomar" | "cancelar";
const act = async (id: string, verbo: CampaignAct) => {
  await apiFetch(`/api/campanhas/${id}/${verbo}`, { method: "POST", body: {} });
  await store.refresh(["campaigns"]);
};

export const campaignsRepo = {
  /** Cria (sem `id`) ou atualiza (com `id`) uma campanha. */
  async save(input: CampaignInput, id?: string): Promise<Campaign> {
    const body = {
      nome: input.nome,
      grupoIds: input.grupoIds,
      templateId: input.templateId || null,
      modo: input.modo,
      agendadaPara: input.modo === "agendar" && input.agendadaPara ? new Date(input.agendadaPara).toISOString() : null,
    };
    const r = await apiFetch<{ campanha: Parameters<typeof toCampaign>[0] }>(id ? `/api/campanhas/${id}` : "/api/campanhas", { method: id ? "PUT" : "POST", body });
    await store.refresh(["campaigns"]);
    return toCampaign(r.campanha);
  },
  start: (id: string) => act(id, "iniciar"),
  pause: (id: string) => act(id, "pausar"),
  resume: (id: string) => act(id, "retomar"),
  cancel: (id: string) => act(id, "cancelar"),
};

type GroupInput = { nome: string; descricao: string };
const BATCH = 1000;

export const groupsRepo = {
  async create(input: GroupInput) {
    const r = await apiFetch<{ grupo: ContactGroup }>("/api/grupos", { method: "POST", body: input });
    await store.refresh(["groups"]);
    return r.grupo;
  },
  async update(id: string, input: GroupInput) {
    await apiFetch(`/api/grupos/${id}`, { method: "PUT", body: input });
    await store.refresh(["groups", "campaigns"]);
  },
  async remove(id: string) {
    await apiFetch(`/api/grupos/${id}`, { method: "DELETE" });
    await store.refresh(["groups", "campaigns"]);
  },
  /**
   * Adiciona contatos do HubSpot (só os ids). Contatos sem telefone válido (`telefoneErro`) são recusados aqui,
   * qualquer que seja a tela de origem; o servidor valida o formato dos ids.
   */
  async addContacts(id: string, contatos: Pick<Contact, "id" | "telefoneErro">[]) {
    const validos = [...new Set(contatos.filter((c) => !c.telefoneErro).map((c) => c.id))];
    let added = 0;
    for (let i = 0; i < validos.length; i += BATCH) {
      added += (await apiFetch<{ added: number }>(`/api/grupos/${id}/contatos`, { method: "POST", body: { contatoIds: validos.slice(i, i + BATCH) } })).added;
    }
    await store.refresh(["groups"]);
    return { added, ignored: contatos.length - validos.length };
  },
  /** Cadastra um contato à mão (celular brasileiro válido) e já o coloca no grupo. */
  async addManualContact(id: string, input: { nome: string; telefone: string; email?: string; empresa?: string }) {
    const r = await apiFetch<{ contato: Contact }>(`/api/grupos/${id}/contatos-manuais`, { method: "POST", body: input });
    await store.refresh(["groups", "manualContacts"]);
    return r.contato;
  },
  /** Remove apenas a associação com o grupo. */
  async removeContacts(id: string, contatoIds: string[]) {
    await apiFetch(`/api/grupos/${id}/contatos/remover`, { method: "POST", body: { contatoIds } });
    await store.refresh(["groups"]);
  },
};

export type TemplateInput = { nome: string; conteudo: string };

export const templatesRepo = {
  /** Cria (sem `id`) ou atualiza (com `id`) um template. */
  async save(input: TemplateInput, id?: string): Promise<Template> {
    const r = await apiFetch<{ template: Template }>(id ? `/api/templates/${id}` : "/api/templates", { method: id ? "PUT" : "POST", body: input });
    await store.refresh(["templates", "campaigns"]);
    return r.template;
  },
  async remove(id: string) {
    await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
    await store.refresh(["templates", "campaigns"]);
  },
};
