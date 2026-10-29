import { z } from "zod";
import type { AdminUserRecord } from "../data/types.ts";
import { json, readJson } from "../http/api.ts";
import { isUuid, parseId } from "../services/access.ts";
import { whatsappService, sectorsService } from "../services/sectors.ts";
import { usersService } from "../services/users.ts";
import { badRequest } from "../errors.ts";
import type { Def } from "./kit.ts";

const setorId = z.string({ invalid_type_error: "Setor inválido." }).refine(isUuid, "Setor inválido.");

const newUser = z.object({
  nome: z.string({ required_error: "Informe o nome.", invalid_type_error: "Nome inválido." }),
  email: z.string({ required_error: "Informe o e-mail.", invalid_type_error: "E-mail inválido." }),
  senha: z.string({ required_error: "Informe a senha.", invalid_type_error: "Senha inválida." }).max(200, "Senha inválida."),
  setorId: setorId,
});
// `role` não existe nestes schemas de propósito: o papel nunca é aceito de fora.
const patchUser = z.object({
  nome: z.string().optional(),
  email: z.string().optional(),
  setorId: setorId.optional(),
  ativo: z.boolean().optional(),
  senha: z.string().max(200, "Senha inválida.").optional(),
});
const newSector = z.object({ nome: z.string({ required_error: "Informe o nome do setor.", invalid_type_error: "Nome inválido." }) });
const patchSector = z.object({
  nome: z.string().optional(),
  ativo: z.boolean().optional(),
  whatsappNumero: z.string().nullable().optional(),
});

const publicUser = (u: AdminUserRecord) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  role: u.role,
  ativo: u.ativo,
  ultimoLoginEm: u.ultimoLoginEm,
  conta: { id: u.accountId, nome: u.accountNome },
});

/** Remove chaves `undefined` (o tipo exige `exactOptionalPropertyTypes`). */
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };

export const adminRoutes: Def[] = [
  { method: "GET", path: "/admin/setores", roles: ["ADMIN"], handler: async ({ db, auth }) => json({ setores: await sectorsService.list(db, auth.user) }) },
  {
    method: "POST",
    path: "/admin/setores",
    roles: ["ADMIN"],
    handler: async ({ request, db, auth }) => json({ setor: await sectorsService.create(db, auth.user, (await readJson(request, newSector)).nome) }, { status: 201 }),
  },
  {
    method: "PATCH",
    path: "/admin/setores/:id",
    roles: ["ADMIN"],
    handler: async ({ request, db, auth, params }) =>
      json({ setor: await sectorsService.update(db, auth.user, parseId(params["id"]!), defined(await readJson(request, patchSector))) }),
  },
  {
    method: "GET",
    path: "/admin/usuarios",
    roles: ["ADMIN"],
    handler: async ({ db, auth }) => json({ usuarios: (await usersService.list(db, auth.user)).map(publicUser) }),
  },
  {
    method: "POST",
    path: "/admin/usuarios",
    roles: ["ADMIN"],
    handler: async ({ request, db, auth }) => {
      const b = await readJson(request, newUser);
      const u = await usersService.create(db, auth.user, b);
      return json({ usuario: { id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo, conta: { id: u.accountId } } }, { status: 201 });
    },
  },
  {
    method: "PATCH",
    path: "/admin/usuarios/:id",
    roles: ["ADMIN"],
    handler: async ({ request, db, auth, params }) => {
      const b = defined(await readJson(request, patchUser));
      if (!Object.keys(b).length) throw badRequest("Nada para alterar.");
      const u = await usersService.update(db, auth.user, parseId(params["id"]!), b);
      return json({ usuario: { id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo, conta: { id: u.accountId } } });
    },
  },
  // Número do WhatsApp do setor da PRÓPRIA sessão (qualquer papel).
  { method: "GET", path: "/conta/whatsapp", handler: async ({ db, auth }) => json(await whatsappService.get(db, auth.user)) },
  {
    method: "PUT",
    path: "/conta/whatsapp",
    handler: async ({ request, db, auth }) =>
      json(await whatsappService.set(db, auth.user, (await readJson(request, z.object({ numero: z.string({ required_error: "Informe o número." }) }))).numero)),
  },
];
