import type { z } from "zod";
import type { Role } from "../data/types.ts";
import type { Db } from "../db/client.ts";
import { badRequest } from "../errors.ts";
import { isUuid } from "../services/access.ts";
import type { AuthContext } from "../http/api.ts";

export type Ctx = {
  request: Request;
  db: Db;
  /** Usuário e papel vêm do banco, a partir do cookie. */
  auth: AuthContext;
  /** Parâmetros do caminho (ex.: `:id`), ainda NÃO validados. */
  params: Record<string, string>;
  query: URLSearchParams;
};

export type Def = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Caminho relativo a /api, com `:param`. */
  path: string;
  /** Sem `roles`, qualquer usuário autenticado. */
  roles?: Role[];
  handler: (c: Ctx) => Promise<Response>;
};

/** Primeira mensagem de erro de um schema zod (as mensagens são em português e seguras para o usuário). */
export function parseWith<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw badRequest(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

/** `?contaId=` opcional: precisa ser um UUID. A autorização sobre ele é do serviço. */
export function optionalAccountId(query: URLSearchParams): string | null {
  const v = query.get("contaId");
  if (v === null || v === "") return null;
  if (!isUuid(v)) throw badRequest("Setor inválido.");
  return v;
}
