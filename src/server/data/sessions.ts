import type { Db } from "../db/client.ts";
import type { AuthUser, Role } from "./types.ts";

export const sessionsData = {
  /** `tokenHash` é o SHA-256 do token do cookie; o token em si nunca é gravado. */
  async create(db: Db, input: { userId: string; tokenHash: string; ttlHours: number; ip: string | null; userAgent: string | null }) {
    const r = await db.query<{ expira_em: Date }>(
      `insert into sessions (user_id, token_hash, expira_em, ip, user_agent)
       values ($1, $2, now() + make_interval(hours => $3), $4, $5) returning expira_em`,
      [input.userId, input.tokenHash, input.ttlHours, input.ip, input.userAgent],
    );
    return { expiraEm: r.rows[0]!.expira_em };
  },

  /**
   * Sessão válida = não expirada E usuário ativo E conta ativa. Assim, desativar um usuário (ou a conta dele)
   * derruba o acesso imediatamente, sem esperar a sessão expirar.
   */
  async findActiveUser(db: Db, tokenHash: string): Promise<AuthUser | null> {
    const r = await db.query<{ id: string; account_id: string; conta_nome: string; nome: string; email: string; role: Role }>(
      `select u.id, u.account_id, a.nome as conta_nome, u.nome, u.email, u.role
         from sessions s
         join users u on u.id = s.user_id
         join accounts a on a.id = u.account_id
        where s.token_hash = $1 and s.expira_em > now() and u.ativo and a.ativo`,
      [tokenHash],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { id: row.id, accountId: row.account_id, accountNome: row.conta_nome, nome: row.nome, email: row.email, role: row.role };
  },

  async deleteByTokenHash(db: Db, tokenHash: string) {
    await db.query("delete from sessions where token_hash = $1", [tokenHash]);
  },

  async deleteAllForUser(db: Db, userId: string) {
    await db.query("delete from sessions where user_id = $1", [userId]);
  },

  async deleteExpired(db: Db) {
    await db.query("delete from sessions where expira_em <= now()");
  },
};
