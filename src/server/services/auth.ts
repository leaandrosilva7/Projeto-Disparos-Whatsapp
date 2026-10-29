import { createHash, randomBytes } from "node:crypto";
import { sessionsData } from "../data/sessions.ts";
import type { AuthUser } from "../data/types.ts";
import { usersData } from "../data/users.ts";
import type { Db } from "../db/client.ts";
import { getAppEnv } from "../env.ts";
import { AppError } from "../errors.ts";
import { dummyHash, verifyPassword } from "./password.ts";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Mensagem única para qualquer falha de credencial: não revela se o e-mail existe, está inativo ou bloqueado. */
const invalidCredentials = () => new AppError(401, "credenciais_invalidas", "E-mail ou senha inválidos.");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const TOKEN_LENGTH = 43; // 32 bytes em base64url
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function login(db: Db, input: { email: string; senha: string; ip: string | null; userAgent: string | null }) {
  const user = await usersData.findLoginCandidate(db, normalizeEmail(input.email));

  // Sempre executa um bcrypt (real ou descartável) para manter o tempo de resposta parecido.
  const senhaOk = await verifyPassword(input.senha, user?.passwordHash ?? (await dummyHash()));

  if (!user || !user.ativo || !user.contaAtiva) throw invalidCredentials();

  if (user.bloqueadoAte && user.bloqueadoAte.getTime() > Date.now()) throw invalidCredentials();

  if (!senhaOk) {
    await usersData.registerFailedLogin(db, user.id, MAX_FAILED_LOGINS, LOCK_MINUTES);
    throw invalidCredentials();
  }

  await usersData.registerSuccessfulLogin(db, user.id);
  await sessionsData.deleteExpired(db);

  const token = randomBytes(32).toString("base64url");
  const { expiraEm } = await sessionsData.create(db, {
    userId: user.id,
    tokenHash: hashToken(token),
    ttlHours: getAppEnv().SESSION_TTL_HOURS,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  const authUser: AuthUser = {
    id: user.id,
    accountId: user.accountId,
    accountNome: user.accountNome,
    nome: user.nome,
    email: user.email,
    role: user.role,
  };
  return { token, expiraEm, user: authUser };
}

/** Resolve o usuário da sessão a partir do token do cookie; `null` se ausente, malformado, expirado ou desativado. */
export async function authenticate(db: Db, token: string | null): Promise<AuthUser | null> {
  if (!token || token.length !== TOKEN_LENGTH) return null;
  return sessionsData.findActiveUser(db, hashToken(token));
}

export async function logout(db: Db, token: string | null) {
  if (!token || token.length !== TOKEN_LENGTH) return;
  await sessionsData.deleteByTokenHash(db, hashToken(token));
}
