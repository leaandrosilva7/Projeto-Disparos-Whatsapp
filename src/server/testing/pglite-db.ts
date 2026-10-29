import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";

type Runner = Pick<PGlite, "query" | "exec">;

function wrap(q: Runner, transaction: Db["transaction"]): Db {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const r = await q.query<T>(text, params);
      // Mesma semântica do driver `pg`: SELECT → nº de linhas devolvidas; INSERT/UPDATE/DELETE → nº de linhas afetadas.
      // (No PGlite `affectedRows` é 0 em SELECT, o que tornaria vacuosa qualquer checagem de rowCount nos testes.)
      return { rows: r.rows, rowCount: Math.max(r.affectedRows ?? 0, r.rows.length) };
    },
    async exec(text: string) {
      await q.exec(text);
    },
    transaction,
  };
}

/** Postgres real (WASM, em memória) com todas as migrations aplicadas. Só para testes. */
export async function createTestDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = wrap(pg, (fn) => pg.transaction((tx) => fn(wrap(tx, (inner) => inner(db)))));
  const dir = fileURLToPath(new URL("../../../db/migrations", import.meta.url));
  await runMigrations(db, dir);
  return db;
}

/** Esvazia as tabelas do app (mantém o esquema). Muito mais rápido do que recriar o banco a cada teste. */
export async function resetTestDb(db: Db) {
  await db.exec("truncate table sessions, users, accounts restart identity cascade");
}
