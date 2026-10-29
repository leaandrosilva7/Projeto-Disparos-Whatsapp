import bcrypt from "bcryptjs";
import { badRequest } from "../errors.ts";
import { getAppEnv } from "../env.ts";

/** bcrypt só considera os primeiros 72 BYTES da senha; acima disso rejeitamos em vez de truncar em silêncio. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 72;

export function assertPasswordAcceptable(senha: string) {
  if (senha.length < PASSWORD_MIN) throw badRequest(`A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`, "senha_fraca");
  if (new TextEncoder().encode(senha).length > PASSWORD_MAX_BYTES) {
    throw badRequest(`A senha deve ter no máximo ${PASSWORD_MAX_BYTES} bytes (cerca de ${PASSWORD_MAX_BYTES} caracteres simples).`, "senha_fraca");
  }
}

export const hashPassword = (senha: string) => bcrypt.hash(senha, getAppEnv().BCRYPT_COST);

export const verifyPassword = (senha: string, hash: string) => bcrypt.compare(senha, hash).catch(() => false);

let dummy: Promise<string> | null = null;
/**
 * Hash descartável para comparar quando o e-mail não existe: o tempo de resposta fica igual ao de um
 * e-mail válido com senha errada, o que dificulta descobrir quais e-mails estão cadastrados.
 */
export function dummyHash() {
  dummy ??= bcrypt.hash("senha-descartavel-nao-usada", getAppEnv().BCRYPT_COST);
  return dummy;
}
