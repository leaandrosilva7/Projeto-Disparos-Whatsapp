/** Se `e` for violação de unicidade do Postgres (23505), devolve o nome da restrição/índice (ou "" se desconhecido). */
export function uniqueViolation(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  const err = e as { code?: unknown; constraint?: unknown };
  return err.code === "23505" ? String(err.constraint ?? "") : null;
}
