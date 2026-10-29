import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./client.ts";

const FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

/**
 * Aplica, em ordem, as migrations `NNNN_nome.sql` ainda não aplicadas. Cada uma roda em uma transação
 * junto com o seu registro em `schema_migrations`. Se uma migration já aplicada tiver sido editada
 * depois (checksum diferente), aborta: migrations aplicadas são imutáveis, crie uma nova.
 */
export async function runMigrations(db: Db, dir: string, log: (msg: string) => void = () => undefined) {
  await db.exec(`
    create table if not exists schema_migrations (
      version     text primary key,
      checksum    text not null,
      aplicada_em timestamptz not null default now()
    )`);

  const files = (await readdir(dir)).filter((f) => FILE.test(f)).sort();
  const applied: string[] = [];

  for (const file of files) {
    const sql = await readFile(join(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const version = file.replace(/\.sql$/, "");

    await db.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(727274)"); // evita duas execuções simultâneas
      const found = await tx.query<{ checksum: string }>("select checksum from schema_migrations where version = $1", [version]);
      const row = found.rows[0];
      if (row) {
        if (row.checksum !== checksum) {
          throw new Error(`A migration ${file} já foi aplicada e depois foi alterada. Crie uma nova migration em vez de editá-la.`);
        }
        return;
      }
      await tx.exec(sql);
      await tx.query("insert into schema_migrations (version, checksum) values ($1, $2)", [version, checksum]);
      applied.push(version);
      log(`aplicada: ${file}`);
    });
  }
  return applied;
}
