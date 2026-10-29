import { z } from "zod";

/**
 * Configuração do servidor, lida do ambiente (nunca do navegador).
 * Em desenvolvimento, `.env.local` e `.env` são carregados automaticamente se existirem
 * (variáveis já definidas no ambiente têm prioridade).
 */

const dbSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL não configurada."),
  DATABASE_SSL: z.enum(["require", "verify", "disable"]).default("require"),
  DATABASE_CA_CERT: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
});

const appSchema = z.object({
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  ALLOWED_ORIGINS: z.string().optional(),
});

export type DbEnv = z.infer<typeof dbSchema>;
export type AppEnv = z.infer<typeof appSchema>;

let dotenvLoaded = false;

/** Carrega `.env.local` e `.env` no `process.env`, sem sobrescrever o que já existe. Não faz nada fora do Node. */
export function loadDotEnv() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  if (typeof process === "undefined" || typeof process.loadEnvFile !== "function") return;
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* arquivo ausente: segue com o ambiente atual */
    }
  }
}

export const isProduction = () => typeof process !== "undefined" && process.env["NODE_ENV"] === "production";

function parse<S extends z.ZodTypeAny>(schema: S): z.infer<S> {
  loadDotEnv();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Lista só os NOMES das variáveis com problema, nunca os valores.
    const campos = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "?"))].join(", ");
    throw new Error(`Configuração de ambiente inválida: ${campos}. Veja o .env.example.`);
  }
  return parsed.data;
}

/** Configuração do banco. Lida a cada chamada (barato, e deixa os testes ajustarem variáveis). */
export const getDbEnv = (): DbEnv => parse(dbSchema);

/** Configuração de sessão/senhas (não depende do banco). */
export function getAppEnv(): AppEnv {
  const env = parse(appSchema);
  if (isProduction() && env.BCRYPT_COST < 10) {
    throw new Error("Configuração de ambiente inválida: BCRYPT_COST. Em produção o mínimo é 10.");
  }
  return env;
}
