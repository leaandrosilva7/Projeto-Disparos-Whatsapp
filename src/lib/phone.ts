/**
 * Validação de telefone para disparo no WhatsApp (somente celulares do Brasil).
 *
 * Formatos que o HubSpot devolveu nos testes (campos `mobilephone` e `phone`):
 * "+5561983014790", "+55-86-9881-98692", "61995508066" (sem +55), "988616299" (sem DDD), "" e null.
 *
 * Regras adotadas (decisões do app, não do HubSpot):
 * - ignora tudo que não for dígito;
 * - aceita com DDI 55 (12–13 dígitos) ou sem DDI (10–11 dígitos, assume Brasil);
 * - DDD de 2 dígitos (11–99) e número de celular com 9 dígitos começando em 9;
 * - número fixo, sem DDD, sem o 9º dígito ou com outro DDI é considerado inválido.
 */
export type PhoneIssue = "sem_telefone" | "invalido";

export type PhoneResult =
  | { ok: true; e164: string; formatted: string }
  | { ok: false; issue: PhoneIssue; raw: string };

const blank = (v: string | null | undefined) => !v || !v.trim();

function parseBr(raw: string): { e164: string; formatted: string } | null {
  const digits = raw.replace(/\D/g, "");
  // "+" com outro país (ex.: +1, +351) não é suportado
  if (raw.trim().startsWith("+") && !digits.startsWith("55")) return null;

  let nacional: string;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) nacional = digits.slice(2);
  else if (digits.length === 10 || digits.length === 11) nacional = digits;
  else return null;

  const ddd = nacional.slice(0, 2);
  const numero = nacional.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  if (numero.length !== 9 || numero[0] !== "9") return null;

  return { e164: `+55${nacional}`, formatted: `+55 ${ddd} ${numero.slice(0, 5)}-${numero.slice(5)}` };
}

/**
 * Escolhe o telefone do contato: tenta `mobilephone` primeiro (WhatsApp é celular) e depois `phone`;
 * usa o primeiro que for válido.
 */
export function pickPhone(p: { mobilephone?: string | null; phone?: string | null }): PhoneResult {
  const candidatos = [p.mobilephone, p.phone].filter((v): v is string => !blank(v)).map((v) => v.trim());
  if (!candidatos.length) return { ok: false, issue: "sem_telefone", raw: "" };
  for (const c of candidatos) {
    const r = parseBr(c);
    if (r) return { ok: true, ...r };
  }
  return { ok: false, issue: "invalido", raw: candidatos[0]! };
}

export const phoneIssueLabel: Record<PhoneIssue, string> = {
  sem_telefone: "Sem telefone",
  invalido: "Telefone inválido",
};
