/**
 * Aplica as migrations de db/migrations no banco apontado por DATABASE_URL.
 * Uso: npm run db:migrate
 */
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "../src/server/db/client.ts";
import { runMigrations } from "../src/server/db/migrate.ts";

const dir = fileURLToPath(new URL("../db/migrations", import.meta.url));

try {
  const applied = await runMigrations(getDb(), dir, (m) => console.log(m));
  console.log(applied.length ? `${applied.length} migration(s) aplicada(s).` : "Banco já está atualizado.");
} catch (e) {
  console.error("Falha ao aplicar migrations:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await closeDb();
}
