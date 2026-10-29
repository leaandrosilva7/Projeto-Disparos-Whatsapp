import type { Db } from "../db/client.ts";
import type { AdminUserRecord, Role, UserRecord } from "./types.ts";

type Row = {
  id: string;
  account_id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  ultimo_login_em: Date | null;
  criado_em: Date;
};

const COLS = "id, account_id, nome, email, role, ativo, ultimo_login_em, criado_em";

const toUser = (r: Row): UserRecord => ({
  id: r.id,
  accountId: r.account_id,
  nome: r.nome,
  email: r.email,
  role: r.role,
  ativo: r.ativo,
  ultimoLoginEm: r.ultimo_login_em,
  criadoEm: r.criado_em,
});

/** Dados necessários só para validar o login (inclui o hash; não deve sair do serviço de autenticação). */
export type LoginCandidate = UserRecord & {
  passwordHash: string;
  falhasLogin: number;
  bloqueadoAte: Date | null;
  contaAtiva: boolean;
  accountNome: string;
};

export const usersData = {
  async findLoginCandidate(db: Db, email: string): Promise<LoginCandidate | null> {
    const r = await db.query<Row & { password_hash: string; falhas_login: number; bloqueado_ate: Date | null; conta_ativa: boolean; conta_nome: string }>(
      `select u.id, u.account_id, u.nome, u.email, u.role, u.ativo, u.ultimo_login_em, u.criado_em,
              u.password_hash, u.falhas_login, u.bloqueado_ate, a.ativo as conta_ativa, a.nome as conta_nome
         from users u join accounts a on a.id = u.account_id
        where lower(u.email) = lower($1)`,
      [email],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      ...toUser(row),
      passwordHash: row.password_hash,
      falhasLogin: row.falhas_login,
      bloqueadoAte: row.bloqueado_ate,
      contaAtiva: row.conta_ativa,
      accountNome: row.conta_nome,
    };
  },

  async create(db: Db, input: { accountId: string; nome: string; email: string; passwordHash: string; role: Role }) {
    const r = await db.query<Row>(
      `insert into users (account_id, nome, email, password_hash, role) values ($1, $2, $3, $4, $5) returning ${COLS}`,
      [input.accountId, input.nome, input.email, input.passwordHash, input.role],
    );
    return toUser(r.rows[0]!);
  },

  async countActiveByRole(db: Db, role: Role) {
    const r = await db.query<{ n: string }>("select count(*)::text as n from users where role = $1 and ativo", [role]);
    return Number(r.rows[0]!.n);
  },

  /** Conta ADMINs mesmo inativos: o bootstrap não deve ser reutilizável só porque o admin foi desativado. */
  async countByRole(db: Db, role: Role) {
    const r = await db.query<{ n: string }>("select count(*)::text as n from users where role = $1", [role]);
    return Number(r.rows[0]!.n);
  },

  /** Incrementa as falhas e, ao atingir o limite, bloqueia o login por `lockMinutes` (atômico, sem corrida). */
  async registerFailedLogin(db: Db, id: string, maxFailures: number, lockMinutes: number) {
    await db.query(
      `update users
          set falhas_login = falhas_login + 1,
              bloqueado_ate = case when falhas_login + 1 >= $2 then now() + make_interval(mins => $3) else bloqueado_ate end,
              atualizado_em = now()
        where id = $1`,
      [id, maxFailures, lockMinutes],
    );
  },

  async registerSuccessfulLogin(db: Db, id: string) {
    await db.query(
      "update users set falhas_login = 0, bloqueado_ate = null, ultimo_login_em = now(), atualizado_em = now() where id = $1",
      [id],
    );
  },

  async findById(db: Db, id: string) {
    const r = await db.query<Row>(`select ${COLS} from users where id = $1`, [id]);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  },

  /** Lista para o painel administrativo (todos os setores). Nunca seleciona o hash da senha. */
  async listForAdmin(db: Db): Promise<AdminUserRecord[]> {
    const r = await db.query<Row & { conta_nome: string }>(
      `select u.id, u.account_id, u.nome, u.email, u.role, u.ativo, u.ultimo_login_em, u.criado_em, a.nome as conta_nome
         from users u join accounts a on a.id = u.account_id order by lower(u.nome), u.id`,
    );
    return r.rows.map((x) => ({ ...toUser(x), accountNome: x.conta_nome }));
  },

  async update(
    db: Db,
    id: string,
    changes: { nome?: string; email?: string; accountId?: string; ativo?: boolean; passwordHash?: string },
  ) {
    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (changes.nome !== undefined) push("nome", changes.nome);
    if (changes.email !== undefined) push("email", changes.email);
    if (changes.accountId !== undefined) push("account_id", changes.accountId);
    if (changes.ativo !== undefined) push("ativo", changes.ativo);
    if (changes.passwordHash !== undefined) push("password_hash", changes.passwordHash);
    // Reativar a conta ou trocar a senha limpa o bloqueio por tentativas.
    if (changes.passwordHash !== undefined || changes.ativo === true) sets.push("falhas_login = 0", "bloqueado_ate = null");
    if (!sets.length) return this.findById(db, id);
    const r = await db.query<Row>(`update users set ${sets.join(", ")}, atualizado_em = now() where id = $1 returning ${COLS}`, params);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  },
};
