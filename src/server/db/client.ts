import pg from "pg";
import { getDbEnv } from "../env.ts";

/**
 * Contrato mínimo de acesso ao banco. A camada de dados (`../data`) só conhece esta interface:
 * trocar de banco (ou de driver) significa reimplementar apenas este arquivo.
 */
export type QueryResult<T> = { rows: T[]; rowCount: number };

export interface Db {
  /** Consulta parametrizada ($1, $2...). NUNCA concatene valores do usuário no SQL. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Executa um script com vários comandos, sem parâmetros (usado pelas migrations). */
  exec(text: string): Promise<void>;
  /** Executa `fn` em uma transação; qualquer erro desfaz tudo. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

function wrap(q: Queryable, transaction: Db["transaction"]): Db {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const r = await q.query(text, params as unknown[] | undefined);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
    },
    async exec(text: string) {
      await q.query(text);
    },
    transaction,
  };
}

function buildSsl(mode: "require" | "verify" | "disable", ca: string | undefined): pg.PoolConfig["ssl"] {
  if (mode === "disable") return false;
  if (mode === "verify") return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/** Remove parâmetros de SSL da URL: quem decide é DATABASE_SSL (a URL do driver tem precedência sobre as opções). */
function cleanConnectionString(url: string) {
  try {
    const u = new URL(url);
    for (const k of ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey"]) u.searchParams.delete(k);
    return u.toString();
  } catch {
    throw new Error("DATABASE_URL inválida.");
  }
}

export type PgDb = Db & { close(): Promise<void> };

export function createPgDb(opts: { url: string; ssl: "require" | "verify" | "disable"; ca?: string; max: number }): PgDb {
  const pool = new pg.Pool({
    connectionString: cleanConnectionString(opts.url),
    ssl: buildSsl(opts.ssl, opts.ca),
    max: opts.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Sem este handler, um erro em conexão ociosa derrubaria o processo.
  pool.on("error", (e) => console.error("[db] erro em conexão ociosa:", e.message));

  const transaction: Db["transaction"] = async (fn) => {
    const client = await pool.connect();
    const tx: Db = wrap(client, (inner) => inner(tx)); // transação aninhada reaproveita a atual
    try {
      await client.query("begin");
      const out = await fn(tx);
      await client.query("commit");
      return out;
    } catch (e) {
      await client.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  };

  return { ...wrap(pool, transaction), close: () => pool.end() };
}

let current: Db | null = null;
let currentPg: PgDb | null = null;

/** Banco único do processo, criado sob demanda a partir do ambiente. */
export function getDb(): Db {
  if (current) return current;
  const env = getDbEnv();
  currentPg = createPgDb({
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
    ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {}),
    max: env.DATABASE_POOL_MAX,
  });
  current = currentPg;
  return current;
}

/** Usado pelos testes para injetar um banco em memória. `null` restaura o comportamento normal. */
export function setDb(db: Db | null) {
  current = db;
  currentPg = null;
}

export async function closeDb() {
  await currentPg?.close();
  current = null;
  currentPg = null;
}
