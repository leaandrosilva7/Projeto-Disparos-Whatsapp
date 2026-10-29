import { accountsData } from "../data/accounts.ts";
import { sessionsData } from "../data/sessions.ts";
import type { AuthUser } from "../data/types.ts";
import { usersData } from "../data/users.ts";
import type { Db } from "../db/client.ts";
import { uniqueViolation } from "../db/errors.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { assertAdmin } from "./access.ts";
import { normalizeEmail } from "./auth.ts";
import { assertPasswordAcceptable, hashPassword } from "./password.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(nome: string) {
  const n = nome.trim();
  if (!n || n.length > 120) throw badRequest("Informe o nome (até 120 caracteres).");
  return n;
}
function validateEmail(email: string) {
  const e = normalizeEmail(email);
  if (!EMAIL.test(e) || e.length > 254) throw badRequest("E-mail inválido.");
  return e;
}
async function assertActiveSector(db: Db, id: string) {
  const setor = await accountsData.findById(db, id);
  if (!setor) throw badRequest("Setor não encontrado.", "setor_invalido");
  if (!setor.ativo) throw badRequest("Este setor está desativado.", "setor_invalido");
}
const emailEmUso = () => conflict("Já existe um usuário com esse e-mail.", "email_em_uso");

/**
 * Gestão de contas de OPERADOR por um ADMIN, em qualquer setor. O papel nunca é aceito de fora: contas criadas aqui
 * são sempre OPERADOR, e contas administrativas não podem ser alteradas por esta via.
 */
export const usersService = {
  list(db: Db, actor: AuthUser) {
    assertAdmin(actor);
    return usersData.listForAdmin(db);
  },

  async create(db: Db, actor: AuthUser, input: { nome: string; email: string; senha: string; setorId: string }) {
    assertAdmin(actor);
    const nome = validateName(input.nome);
    const email = validateEmail(input.email);
    assertPasswordAcceptable(input.senha);
    await assertActiveSector(db, input.setorId);
    const passwordHash = await hashPassword(input.senha);
    try {
      return await usersData.create(db, { accountId: input.setorId, nome, email, passwordHash, role: "OPERADOR" });
    } catch (e) {
      if (uniqueViolation(e) !== null) throw emailEmUso();
      throw e;
    }
  },

  async update(
    db: Db,
    actor: AuthUser,
    id: string,
    input: { nome?: string; email?: string; setorId?: string; ativo?: boolean; senha?: string },
  ) {
    assertAdmin(actor);
    const alvo = await usersData.findById(db, id);
    if (!alvo) throw notFound("Usuário não encontrado.");
    if (alvo.role !== "OPERADOR") throw forbidden("Contas administrativas não podem ser alteradas por esta rota.");

    const changes: Parameters<typeof usersData.update>[2] = {};
    if (input.nome !== undefined) changes.nome = validateName(input.nome);
    if (input.email !== undefined) changes.email = validateEmail(input.email);
    if (input.setorId !== undefined) {
      await assertActiveSector(db, input.setorId);
      changes.accountId = input.setorId;
    }
    if (input.ativo !== undefined) changes.ativo = input.ativo;
    if (input.senha !== undefined) {
      assertPasswordAcceptable(input.senha);
      changes.passwordHash = await hashPassword(input.senha);
    }

    try {
      const saved = await usersData.update(db, id, changes);
      if (!saved) throw notFound("Usuário não encontrado.");
      // Desativar ou trocar a senha encerra as sessões abertas (desativar já bloqueia o acesso na checagem da sessão).
      if (input.ativo === false || input.senha !== undefined) await sessionsData.deleteAllForUser(db, id);
      return saved;
    } catch (e) {
      if (uniqueViolation(e) !== null) throw emailEmUso();
      throw e;
    }
  },
};
