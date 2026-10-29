/** Regras de status de campanha, compartilhadas entre o servidor (que as aplica) e a interface (que só as reflete). */
export type CampaignStatus = "Rascunho" | "Agendada" | "Em andamento" | "Pausada" | "Concluída" | "Cancelada";

export type CampaignAction = "start" | "pause" | "resume" | "cancel" | "edit";

export const allowedFrom: Record<CampaignAction, CampaignStatus[]> = {
  edit: ["Rascunho", "Agendada"],
  start: ["Rascunho", "Agendada"],
  pause: ["Em andamento"],
  resume: ["Pausada"],
  cancel: ["Rascunho", "Agendada", "Em andamento", "Pausada"],
};

export const canDo = (status: CampaignStatus, action: CampaignAction) => allowedFrom[action].includes(status);

/** Campanhas que ainda podem disparar mensagens (usadas para proteger a exclusão de grupos e templates). */
export const isOpen = (status: CampaignStatus) => status !== "Concluída" && status !== "Cancelada";
