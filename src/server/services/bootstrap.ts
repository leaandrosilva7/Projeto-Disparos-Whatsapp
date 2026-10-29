import { accountsData } from "../data/accounts.ts";
import { usersData } from "../data/users.ts";
import type { Db } from "../db/client.ts";
import { badRequest, conflict } from "../errors.ts";
import { ADMIN_SECTOR_NAME } from "./access.ts";
import { normalizeEmail } from "./auth.ts";
import { assertPasswordAcceptable, hashPassword } from "./password.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cria o PRIMEIRO administrador, sempre associado ao setor TI (criado aqui se ainda não existir). Só funciona
 * enquanto não houver nenhum ADMIN no banco (mesmo inativo). Não existe rota HTTP para isto: apenas o script
 * `npm run admin:create`. Contas OPERADOR são criadas depois, por um ADMIN autenticado.
 */
export async function createFirstAdmin(db: Db, input: { nome: string; email: string; senha: string }) {
  const nome = input.nome.trim();
  const email = normalizeEmail(input.email);
  if (!nome || nome.length > 120) throw badRequest("Informe o nome (até 120 caracteres).");
  if (!EMAIL.test(email) || email.length > 254) throw badRequest("E-mail inválido.");
  assertPasswordAcceptable(input.senha);

  const passwordHash = await hashPassword(input.senha); // fora da transação: bcrypt é lento

  return db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(727275)"); // duas execuções simultâneas não criam dois admins
    if ((await usersData.countByRole(tx, "ADMIN")) > 0) {
      throw conflict("Já existe um administrador. O bootstrap só pode ser usado uma vez.", "admin_ja_existe");
    }
    const conta = (await accountsData.findByName(tx, ADMIN_SECTOR_NAME)) ?? (await accountsData.create(tx, { nome: ADMIN_SECTOR_NAME }));
    const user = await usersData.create(tx, { accountId: conta.id, nome, email, passwordHash, role: "ADMIN" });
    return { user, conta };
  });
}
