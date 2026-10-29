import { templatesData } from "../data/templates.ts";
import type { AuthUser } from "../data/types.ts";
import type { Db } from "../db/client.ts";
import { uniqueViolation } from "../db/errors.ts";
import { badRequest, conflict, notFound } from "../errors.ts";
import { validateTemplateContent } from "../../lib/template.ts";

export type TemplateInput = { nome: string; conteudo: string };

const DUPLICADO = () => conflict("Já existe um template com esse nome.", "template_duplicado");

function validate(input: TemplateInput): TemplateInput {
  const nome = input.nome.trim();
  const conteudo = input.conteudo.trim();
  if (!nome) throw badRequest("Informe o nome do template.");
  if (nome.length > 120) throw badRequest("O nome do template pode ter até 120 caracteres.");
  const erro = validateTemplateContent(conteudo);
  if (erro) throw badRequest(erro);
  return { nome, conteudo };
}

/** Templates pertencem ao setor da sessão (inclusive para o ADMIN, que atua no setor TI). */
export const templatesService = {
  list: (db: Db, user: AuthUser) => templatesData.list(db, user.accountId),

  async create(db: Db, user: AuthUser, raw: TemplateInput) {
    const input = validate(raw);
    try {
      return await templatesData.create(db, { accountId: user.accountId, ...input, userId: user.id });
    } catch (e) {
      if (uniqueViolation(e) !== null) throw DUPLICADO();
      throw e;
    }
  },

  async update(db: Db, user: AuthUser, id: string, raw: TemplateInput) {
    const input = validate(raw);
    try {
      const saved = await templatesData.update(db, user.accountId, id, input);
      if (!saved) throw notFound("Template não encontrado.");
      return saved;
    } catch (e) {
      if (uniqueViolation(e) !== null) throw DUPLICADO();
      throw e;
    }
  },

  async remove(db: Db, user: AuthUser, id: string) {
    await db.transaction(async (tx) => {
      if (!(await templatesData.find(tx, user.accountId, id))) throw notFound("Template não encontrado.");
      const uso = await templatesData.countOpenCampaigns(tx, user.accountId, id);
      if (uso > 0) throw conflict(`Este template é usado em ${uso} campanha(s) em aberto.`, "template_em_uso");
      await templatesData.remove(tx, user.accountId, id);
    });
  },
};
