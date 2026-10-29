import type { Contact } from "@/services/mock-data";

/** Limite de caracteres da mensagem de um template. */
export const TEMPLATE_MAX_LENGTH = 1024;

/** Variáveis que `renderTemplate` sabe preencher com os dados do contato. */
export const TEMPLATE_VARIABLES = [{ chave: "nome", descricao: "Primeiro nome do contato" }] as const;

/** Contato fictício usado nas prévias de template. */
export const SAMPLE_CONTACT: Pick<Contact, "nome"> = { nome: "Maria Silva" };

const TOKEN = /\{\{([^{}]*)\}\}/g;

/** Variáveis escritas na mensagem que não existem (ou estão mal escritas, ex.: `{{ nome }}`). */
export function invalidVariables(conteudo: string): string[] {
  const validas = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.chave));
  const achadas = [...conteudo.matchAll(TOKEN)].map((m) => m[1] ?? "");
  return [...new Set(achadas.filter((k) => !validas.has(k)))];
}

/** Valida a mensagem de um template. Retorna o texto do erro ou null quando está tudo certo. */
export function validateTemplateContent(conteudo: string): string | null {
  const texto = conteudo.trim();
  if (!texto) return "Escreva a mensagem do template.";
  if (texto.length > TEMPLATE_MAX_LENGTH) return `A mensagem passou do limite de ${TEMPLATE_MAX_LENGTH} caracteres.`;
  const invalidas = invalidVariables(texto);
  if (invalidas.length) {
    const lista = invalidas.map((k) => `{{${k}}}`).join(", ");
    const validas = TEMPLATE_VARIABLES.map((v) => `{{${v.chave}}}`).join(", ");
    return `Variável inválida: ${lista}. Use ${validas}, sem espaços.`;
  }
  if (/\{\{|\}\}/.test(texto.replace(TOKEN, ""))) return "Há chaves {{ }} incompletas na mensagem.";
  return null;
}
