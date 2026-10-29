// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { createTestDb } from "../testing/pglite-db";
import { runMigrations } from "./migrate";

let db: Db;
beforeAll(async () => {
  db = await createTestDb(); // já aplica as migrations reais uma vez
}, 60_000);

const tmpDir = () => mkdtemp(join(tmpdir(), "mig-"));

describe("migrations", () => {
  it("são idempotentes: rodar de novo não aplica nada", async () => {
    const dir = new URL("../../../db/migrations", import.meta.url).pathname;
    expect(await runMigrations(db, dir)).toEqual([]);
    const v = await db.query<{ version: string }>("select version from schema_migrations order by version");
    expect(v.rows.map((r) => r.version)).toContain("0001_auth");
  });

  it("abortam se uma migration já aplicada for editada", async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, "0001_a.sql"), "create table t (id int);");
    await runMigrations(db, dir);
    await writeFile(join(dir, "0001_a.sql"), "create table t (id int, extra int);");
    await expect(runMigrations(db, dir)).rejects.toThrow(/já foi aplicada e depois foi alterada/);
  });

  it("uma migration com erro é desfeita por completo", async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, "0001_ruim.sql"), "create table ok_antes (id int); select * from tabela_que_nao_existe;");
    await expect(runMigrations(db, dir)).rejects.toThrow();
    await expect(db.query("select * from ok_antes")).rejects.toThrow();
    expect((await db.query("select 1 from schema_migrations where version = '0001_ruim'")).rowCount).toBe(0);
  });
});
