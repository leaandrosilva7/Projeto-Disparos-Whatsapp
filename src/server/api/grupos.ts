import { z } from "zod";
import { json, readJson } from "../http/api.ts";
import { parseId } from "../services/access.ts";
import { groupsService } from "../services/groups.ts";
import type { Def } from "./kit.ts";

const group = z.object({
  nome: z.string({ required_error: "Informe o nome do grupo.", invalid_type_error: "Nome inválido." }),
  descricao: z.string({ invalid_type_error: "Descrição inválida." }).default(""),
});
const manual = z.object({
  nome: z.string({ required_error: "Informe o nome do contato.", invalid_type_error: "Nome inválido." }),
  telefone: z.string({ required_error: "Informe o telefone do contato.", invalid_type_error: "Telefone inválido." }),
  email: z.string().optional(),
  empresa: z.string().optional(),
});
const ids = z.object({ contatoIds: z.array(z.string().max(80), { required_error: "Informe os contatos." }).max(5000, "Contatos demais de uma vez.") });
const BIG = { maxBytes: 256 * 1024 };

export const groupRoutes: Def[] = [
  { method: "GET", path: "/grupos", handler: async ({ db, auth }) => json({ grupos: await groupsService.list(db, auth.user) }) },
  {
    method: "POST",
    path: "/grupos",
    handler: async ({ request, db, auth }) => json({ grupo: await groupsService.create(db, auth.user, await readJson(request, group)) }, { status: 201 }),
  },
  {
    method: "PUT",
    path: "/grupos/:id",
    handler: async ({ request, db, auth, params }) =>
      json({ grupo: await groupsService.update(db, auth.user, parseId(params["id"]!), await readJson(request, group)) }),
  },
  {
    method: "DELETE",
    path: "/grupos/:id",
    handler: async ({ db, auth, params }) => {
      await groupsService.remove(db, auth.user, parseId(params["id"]!));
      return json({ ok: true });
    },
  },
  {
    method: "POST",
    path: "/grupos/:id/contatos",
    handler: async ({ request, db, auth, params }) => {
      const { contatoIds } = await readJson(request, ids, BIG);
      return json(await groupsService.addHubspotContacts(db, auth.user, parseId(params["id"]!), contatoIds));
    },
  },
  {
    method: "POST",
    path: "/grupos/:id/contatos/remover",
    handler: async ({ request, db, auth, params }) => {
      const { contatoIds } = await readJson(request, ids, BIG);
      await groupsService.removeContacts(db, auth.user, parseId(params["id"]!), contatoIds);
      return json({ ok: true });
    },
  },
  {
    method: "POST",
    path: "/grupos/:id/contatos-manuais",
    handler: async ({ request, db, auth, params }) =>
      json({ contato: await groupsService.addManualContact(db, auth.user, parseId(params["id"]!), await readJson(request, manual)) }, { status: 201 }),
  },
  { method: "GET", path: "/contatos-manuais", handler: async ({ db, auth }) => json({ contatos: await groupsService.listManualContacts(db, auth.user) }) },
];
