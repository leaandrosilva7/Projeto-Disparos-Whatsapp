import { campaignsData, type CampaignWrite } from "../data/campaigns.ts";
import { groupsData } from "../data/groups.ts";
import { templatesData } from "../data/templates.ts";
import type { AuthUser, CampaignRecord, CampaignStatus } from "../data/types.ts";
import type { Db } from "../db/client.ts";
import { badRequest, conflict, notFound } from "../errors.ts";
import { allowedFrom, canDo, type CampaignAction } from "../../lib/campaign-rules.ts";
import { assertOwnSector, readScope } from "./access.ts";

export type CampaignInput = {
  nome: string;
  grupoIds: string[];
  templateId: string | null;
  /** rascunho = salva mesmo incompleta; manual = completa, só dispara no Iniciar; agendar = dispara na data escolhida. */
  modo: "rascunho" | "manual" | "agendar";
  agendadaPara: Date | null;
};

/** Antecedência mínima de um agendamento. */
const MIN_AHEAD_MS = 60_000;

/**
 * Campanha + o que o usuário pode fazer com ela. `podeEditar` é decidido aqui: o ADMIN enxerga campanhas de todos
 * os setores, mas só altera as do próprio setor.
 */
export const campaignView = (c: CampaignRecord, user: AuthUser) => ({ ...c, podeEditar: c.accountId === user.accountId });

const ACTION_ERRORS: Record<Exclude<CampaignAction, "edit">, string> = {
  start: "Esta campanha não pode ser iniciada.",
  pause: "Só é possível pausar campanhas em andamento.",
  resume: "Só é possível retomar campanhas pausadas.",
  cancel: "Esta campanha não pode ser cancelada.",
};
const NEXT_STATUS: Record<Exclude<CampaignAction, "edit">, CampaignStatus> = {
  start: "Em andamento",
  pause: "Pausada",
  resume: "Em andamento",
  cancel: "Cancelada",
};

export const campaignsService = {
  /** ADMIN: todos os setores (ou um, via `contaId`). OPERADOR: só o próprio setor; outro `contaId` é recusado. */
  async list(db: Db, user: AuthUser, opts: { contaId?: string | null } = {}) {
    const scope = readScope(user, opts.contaId);
    return (await campaignsData.list(db, scope)).map((c) => campaignView(c, user));
  },

  async get(db: Db, user: AuthUser, id: string) {
    const c = await campaignsData.find(db, readScope(user), id);
    if (!c) throw notFound("Campanha não encontrada.");
    return campaignView(c, user);
  },

  /** Cria (sem `id`) ou atualiza (com `id`) uma campanha do setor da sessão. */
  async save(db: Db, user: AuthUser, input: CampaignInput, id?: string) {
    const nome = input.nome.trim();
    if (!nome) throw badRequest("Informe o nome da campanha.");
    if (nome.length > 120) throw badRequest("O nome da campanha pode ter até 120 caracteres.");

    return db.transaction(async (tx) => {
      if (id) {
        const atual = await campaignsData.find(tx, readScope(user), id);
        if (!atual) throw notFound("Campanha não encontrada.");
        assertOwnSector(user, atual.accountId);
        if (!canDo(atual.status, "edit")) throw conflict("Esta campanha não pode mais ser editada.", "status_invalido");
      }

      // Grupos e template precisam ser do MESMO setor da sessão; ids de outro setor são tratados como inexistentes.
      const grupoIds = [...new Set(input.grupoIds)];
      const proprios = await groupsData.findOwnedIds(tx, user.accountId, grupoIds);
      if (proprios.length !== grupoIds.length) throw badRequest("Um dos grupos selecionados não existe.");
      const template = input.templateId ? await templatesData.find(tx, user.accountId, input.templateId) : null;
      if (input.templateId && !template) throw badRequest("O template selecionado não existe.");

      const total = await groupsData.countUniqueContacts(tx, grupoIds);
      if (input.modo !== "rascunho") {
        if (!grupoIds.length || !template) throw badRequest("Selecione grupos e um template.");
        if (total === 0) throw badRequest("Os grupos selecionados não têm contatos.");
      }
      if (input.modo === "agendar") {
        if (!input.agendadaPara || Number.isNaN(input.agendadaPara.getTime())) throw badRequest("Informe a data e o horário do agendamento.");
        if (input.agendadaPara.getTime() < Date.now() + MIN_AHEAD_MS) throw badRequest("Escolha uma data e horário futuros.");
      }

      // Nenhum modo inicia o disparo na criação: "manual" fica como Rascunho até alguém clicar em Iniciar.
      // TODO(n8n): ao agendar, registrar o agendamento no workflow (ainda não implementado, por decisão do projeto).
      const write: CampaignWrite = {
        nome,
        templateId: template?.id ?? null,
        status: input.modo === "agendar" ? "Agendada" : "Rascunho",
        agendadaPara: input.modo === "agendar" ? input.agendadaPara : null,
        totalContatos: total,
        grupoIds,
      };

      let savedId: string;
      if (id) {
        if (!(await campaignsData.update(tx, user.accountId, id, allowedFrom.edit, write))) {
          throw conflict("Esta campanha não pode mais ser editada.", "status_invalido");
        }
        savedId = id;
      } else {
        savedId = await campaignsData.insert(tx, user.accountId, user.id, write);
      }
      return campaignView((await campaignsData.find(tx, user.accountId, savedId))!, user);
    });
  },

  /** start | pause | resume | cancel. A troca de status é atômica: só ocorre se o status de origem ainda for válido. */
  async act(db: Db, user: AuthUser, id: string, action: Exclude<CampaignAction, "edit">) {
    return db.transaction(async (tx) => {
      const atual = await campaignsData.find(tx, readScope(user), id);
      if (!atual) throw notFound("Campanha não encontrada.");
      assertOwnSector(user, atual.accountId);
      if (!canDo(atual.status, action)) throw conflict(ACTION_ERRORS[action], "status_invalido");

      let total: number | undefined;
      if (action === "start") {
        const grupoIds = atual.grupos.map((g) => g.id);
        if (!grupoIds.length || !atual.templateId) throw badRequest("Selecione grupos e um template.");
        total = await groupsData.countUniqueContacts(tx, grupoIds);
        if (total === 0) throw badRequest("Os grupos desta campanha não têm contatos.");
        // TODO(n8n): disparar o workflow de envio aqui (ainda não implementado, por decisão do projeto).
      }

      const ok = await campaignsData.transition(tx, user.accountId, id, allowedFrom[action], NEXT_STATUS[action], total === undefined ? {} : { totalContatos: total });
      if (!ok) throw conflict(ACTION_ERRORS[action], "status_invalido");
      return campaignView((await campaignsData.find(tx, user.accountId, id))!, user);
    });
  },

  /** Métricas e campanhas recentes, no mesmo escopo da listagem (ADMIN: todos os setores ou um; OPERADOR: o seu). */
  async dashboard(db: Db, user: AuthUser, opts: { contaId?: string | null } = {}) {
    const scope = readScope(user, opts.contaId);
    const [m, recentes] = await Promise.all([campaignsData.metrics(db, scope), campaignsData.list(db, scope, { limit: 5 })]);
    return { metricas: { ...m, falhas: m.enviados - m.entregues }, recentes: recentes.map((c) => campaignView(c, user)) };
  },
};

