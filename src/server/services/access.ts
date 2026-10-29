import type { AuthUser } from "../data/types.ts";
import { forbidden, notFound } from "../errors.ts";

/** Setor (conta) ao qual o ADMIN pertence. Não vem de entrada do usuário. */
export const ADMIN_SECTOR_NAME = "TI";

export const isAdmin = (u: AuthUser) => u.role === "ADMIN";

/** Defesa em profundidade: serviços administrativos conferem o papel mesmo que o roteador já tenha conferido. */
export function assertAdmin(u: AuthUser) {
  if (!isAdmin(u)) throw forbidden();
}

/**
 * Setor cujas CAMPANHAS o usuário pode LER. `null` = todos os setores (só o ADMIN, mesmo ele pertencendo ao TI).
 * OPERADOR é sempre preso ao próprio setor; pedir outro setor por parâmetro é recusado.
 */
export function readScope(u: AuthUser, requestedAccountId?: string | null): string | null {
  if (isAdmin(u)) return requestedAccountId ?? null;
  if (requestedAccountId && requestedAccountId !== u.accountId) throw forbidden("Você só pode consultar o seu próprio setor.");
  return u.accountId;
}

/** Alterações (editar, iniciar, pausar, cancelar...) só valem para o setor da sessão, inclusive para o ADMIN. */
export function assertOwnSector(u: AuthUser, accountId: string) {
  if (u.accountId !== accountId) throw forbidden("Administradores só podem alterar campanhas do próprio setor.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Id malformado vira 404 (e não um erro de banco): não há diferença observável entre "não existe" e "não é seu". */
export function parseId(v: string): string {
  if (!isUuid(v)) throw notFound();
  return v;
}
