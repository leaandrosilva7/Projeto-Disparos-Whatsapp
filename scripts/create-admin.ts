/**
 * Bootstrap do PRIMEIRO administrador. Não existe rota HTTP para isto, por segurança.
 * Só funciona enquanto não houver nenhum ADMIN no banco.
 *
 * Uso interativo:  npm run admin:create
 * Uso não interativo (CI/provisionamento), via ambiente:
 *   ADMIN_NOME="..." ADMIN_EMAIL="..." ADMIN_SENHA="..." npm run admin:create
 *
 * O administrador é sempre associado ao setor TI (criado automaticamente).
 *
 * A senha nunca é aceita por argumento de linha de comando (ficaria no histórico do shell).
 */
import { createInterface } from "node:readline/promises";
import { closeDb, getDb } from "../src/server/db/client.ts";
import { AppError } from "../src/server/errors.ts";
import { createFirstAdmin } from "../src/server/services/bootstrap.ts";

async function ask(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Lê a senha sem ecoar na tela (exige terminal interativo). */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Sem terminal interativo: defina ADMIN_SENHA no ambiente."));
    process.stdout.write(question);
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          process.stdin.setRawMode(false);
          return reject(new Error("Cancelado."));
        }
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

try {
  const nome = process.env["ADMIN_NOME"] ?? (await ask("Nome do administrador: "));
  const email = process.env["ADMIN_EMAIL"] ?? (await ask("E-mail: "));
  let senha = process.env["ADMIN_SENHA"];
  if (!senha) {
    senha = await askHidden("Senha (mín. 10 caracteres): ");
    if (senha !== (await askHidden("Repita a senha: "))) throw new Error("As senhas não conferem.");
  }

  const { user, conta } = await createFirstAdmin(getDb(), { nome, email, senha });
  console.log(`ADMIN criado: ${user.email} (conta "${conta.nome}").`);
} catch (e) {
  console.error(e instanceof AppError || e instanceof Error ? `Erro: ${e.message}` : "Erro desconhecido.");
  process.exitCode = 1;
} finally {
  await closeDb();
}
