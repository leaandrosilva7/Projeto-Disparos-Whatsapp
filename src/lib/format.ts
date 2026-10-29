/** "2026-10-19" -> "19/10/2026" */
export function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}

/** "2026-10-19T14:30" -> "19/10/2026 às 14:30" */
export function formatDateTime(local: string) {
  const d = new Date(local);
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

/** Data local de hoje no formato "YYYY-MM-DD" (útil para o atributo min de <input type="date">). */
export function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
