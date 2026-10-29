import { z } from "zod";
import { badRequest } from "../errors.ts";
import { json, readJson } from "../http/api.ts";
import { isUuid, parseId } from "../services/access.ts";
import { campaignsService, type CampaignInput } from "../services/campaigns.ts";
import { optionalAccountId, type Def } from "./kit.ts";

const body = z.object({
  nome: z.string({ required_error: "Informe o nome da campanha.", invalid_type_error: "Nome inválido." }),
  grupoIds: z.array(z.string(), { required_error: "Selecione ao menos um grupo." }).max(100, "Grupos demais."),
  templateId: z.string().nullable().optional(),
  modo: z.enum(["rascunho", "manual", "agendar"], { errorMap: () => ({ message: "Modo de envio inválido." }) }),
  agendadaPara: z.string().nullable().optional(),
});

/** Aceita só instantes com fuso explícito (ISO com Z ou ±hh:mm): hora sem fuso seria ambígua no servidor. */
const WITH_ZONE = /(Z|[+-]\d{2}:\d{2})$/i;

function toInput(b: z.infer<typeof body>): CampaignInput {
  if (b.grupoIds.some((g) => !isUuid(g))) throw badRequest("Um dos grupos selecionados é inválido.");
  if (b.templateId && !isUuid(b.templateId)) throw badRequest("O template selecionado é inválido.");
  let agendadaPara: Date | null = null;
  if (b.agendadaPara) {
    agendadaPara = WITH_ZONE.test(b.agendadaPara) ? new Date(b.agendadaPara) : new Date(Number.NaN);
    if (Number.isNaN(agendadaPara.getTime())) throw badRequest("Data ou horário inválido.");
  }
  return { nome: b.nome, grupoIds: b.grupoIds, templateId: b.templateId || null, modo: b.modo, agendadaPara };
}

const ACTIONS = { iniciar: "start", pausar: "pause", retomar: "resume", cancelar: "cancel" } as const;

export const campaignRoutes: Def[] = [
  {
    method: "GET",
    path: "/campanhas",
    handler: async ({ db, auth, query }) => json({ campanhas: await campaignsService.list(db, auth.user, { contaId: optionalAccountId(query) }) }),
  },
  {
    method: "GET",
    path: "/campanhas/:id",
    handler: async ({ db, auth, params }) => json({ campanha: await campaignsService.get(db, auth.user, parseId(params["id"]!)) }),
  },
  {
    method: "POST",
    path: "/campanhas",
    handler: async ({ request, db, auth }) =>
      json({ campanha: await campaignsService.save(db, auth.user, toInput(await readJson(request, body))) }, { status: 201 }),
  },
  {
    method: "PUT",
    path: "/campanhas/:id",
    handler: async ({ request, db, auth, params }) =>
      json({ campanha: await campaignsService.save(db, auth.user, toInput(await readJson(request, body)), parseId(params["id"]!)) }),
  },
  ...(Object.entries(ACTIONS) as [keyof typeof ACTIONS, (typeof ACTIONS)[keyof typeof ACTIONS]][]).map(
    ([verbo, action]): Def => ({
      method: "POST",
      path: `/campanhas/:id/${verbo}`,
      handler: async ({ db, auth, params }) => json({ campanha: await campaignsService.act(db, auth.user, parseId(params["id"]!), action) }),
    }),
  ),
  {
    method: "GET",
    path: "/dashboard",
    handler: async ({ db, auth, query }) => json(await campaignsService.dashboard(db, auth.user, { contaId: optionalAccountId(query) })),
  },
];
