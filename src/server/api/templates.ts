import { z } from "zod";
import { json, readJson } from "../http/api.ts";
import { parseId } from "../services/access.ts";
import { templatesService } from "../services/templates.ts";
import type { Def } from "./kit.ts";

const body = z.object({
  nome: z.string({ required_error: "Informe o nome do template.", invalid_type_error: "Nome inválido." }),
  conteudo: z.string({ required_error: "Escreva a mensagem do template.", invalid_type_error: "Mensagem inválida." }),
});

export const templateRoutes: Def[] = [
  { method: "GET", path: "/templates", handler: async ({ db, auth }) => json({ templates: await templatesService.list(db, auth.user) }) },
  {
    method: "POST",
    path: "/templates",
    handler: async ({ request, db, auth }) => json({ template: await templatesService.create(db, auth.user, await readJson(request, body)) }, { status: 201 }),
  },
  {
    method: "PUT",
    path: "/templates/:id",
    handler: async ({ request, db, auth, params }) =>
      json({ template: await templatesService.update(db, auth.user, parseId(params["id"]!), await readJson(request, body)) }),
  },
  {
    method: "DELETE",
    path: "/templates/:id",
    handler: async ({ db, auth, params }) => {
      await templatesService.remove(db, auth.user, parseId(params["id"]!));
      return json({ ok: true });
    },
  },
];
