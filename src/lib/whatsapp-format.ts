/**
 * Formatação de texto do WhatsApp.
 *
 * O template é guardado (e enviado) já na sintaxe do WhatsApp; a interface só ajuda a escrevê-la:
 *   *negrito*   _itálico_   ~tachado~   ```monoespaçado```   `código em linha`
 *   > citação   "* item" ou "- item" (lista)   "1. item" (lista numerada)
 */

export type InlineFormat = "bold" | "italic" | "strike" | "mono" | "code";
export type LineFormat = "quote" | "bullet" | "numbered";

const MARK: Record<InlineFormat, string> = { bold: "*", italic: "_", strike: "~", mono: "```", code: "`" };

export type EditResult = { text: string; start: number; end: number };

/** Envolve a seleção com o marcador (ou remove, se já estiver envolvida). Sem seleção, insere o par e deixa o cursor no meio. */
export function toggleInline(text: string, start: number, end: number, format: InlineFormat): EditResult {
  const m = MARK[format];
  const sel = text.slice(start, end);
  const antes = text.slice(0, start);
  const depois = text.slice(end);

  // marcadores logo ao redor da seleção → remove
  if (antes.endsWith(m) && depois.startsWith(m) && (sel || antes.length + depois.length > 0)) {
    return { text: antes.slice(0, -m.length) + sel + depois.slice(m.length), start: start - m.length, end: end - m.length };
  }
  // marcadores dentro da seleção → remove
  if (sel.length > 2 * m.length && sel.startsWith(m) && sel.endsWith(m)) {
    const miolo = sel.slice(m.length, -m.length);
    return { text: antes + miolo + depois, start, end: start + miolo.length };
  }
  // O WhatsApp não aceita espaço colado ao marcador (`* texto*` não formata): mantém os espaços fora.
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const core = sel.trim();
  const s = start + lead;
  return {
    text: text.slice(0, s) + m + core + m + text.slice(end - trail),
    start: s + m.length,
    end: s + m.length + core.length,
  };
}

const PREFIX: Record<LineFormat, RegExp> = { quote: /^> ?/, bullet: /^[*-] /, numbered: /^\d+\. / };

/** Aplica (ou remove) citação/lista nas linhas tocadas pela seleção. */
export function toggleLines(text: string, start: number, end: number, format: LineFormat): EditResult {
  const iniLinha = text.lastIndexOf("\n", start - 1) + 1;
  const fimIdx = text.indexOf("\n", end);
  const fimLinha = fimIdx === -1 ? text.length : fimIdx;
  const linhas = text.slice(iniLinha, fimLinha).split("\n");
  const todas = linhas.every((l) => PREFIX[format].test(l));
  const novas = linhas.map((l, i) => {
    if (todas) return l.replace(PREFIX[format], "");
    const limpa = l.replace(/^(> ?|[*-] |\d+\. )/, "");
    return (format === "quote" ? "> " : format === "bullet" ? "- " : `${i + 1}. `) + limpa;
  });
  const bloco = novas.join("\n");
  return { text: text.slice(0, iniLinha) + bloco + text.slice(fimLinha), start: iniLinha, end: iniLinha + bloco.length };
}

/* ---------- Prévia: converte a sintaxe do WhatsApp em nós para exibir ---------- */

export type Node =
  | { t: "text"; v: string }
  | { t: "bold" | "italic" | "strike" | "code"; c: Node[] }
  | { t: "mono"; v: string };

// O marcador precisa encostar no texto (sem espaço logo depois de abrir nem antes de fechar), como no WhatsApp.
const INLINE: { t: "bold" | "italic" | "strike" | "code"; re: RegExp }[] = [
  { t: "code", re: /`([^`\n]+)`/ },
  { t: "bold", re: /\*(?=\S)([^*\n]*?\S)\*/ },
  { t: "italic", re: /_(?=\S)([^_\n]*?\S)_/ },
  { t: "strike", re: /~(?=\S)([^~\n]*?\S)~/ },
];

/** Interpreta marcações em linha (aceita aninhar, ex.: *negrito _e itálico_*). */
export function parseInline(src: string): Node[] {
  let melhor: { t: (typeof INLINE)[number]["t"]; idx: number; len: number; inner: string } | null = null;
  for (const { t, re } of INLINE) {
    const m = re.exec(src);
    if (m && (melhor === null || m.index < melhor.idx)) melhor = { t, idx: m.index, len: m[0].length, inner: m[1]! };
  }
  if (!melhor) return src ? [{ t: "text", v: src }] : [];
  const out: Node[] = [];
  if (melhor.idx > 0) out.push({ t: "text", v: src.slice(0, melhor.idx) });
  out.push(melhor.t === "code" ? { t: "code", c: [{ t: "text", v: melhor.inner }] } : { t: melhor.t, c: parseInline(melhor.inner) });
  return [...out, ...parseInline(src.slice(melhor.idx + melhor.len))];
}

export type Block =
  | { kind: "line"; nodes: Node[] }
  | { kind: "quote"; nodes: Node[] }
  | { kind: "bullet"; nodes: Node[] }
  | { kind: "numbered"; n: string; nodes: Node[] }
  | { kind: "mono"; text: string };

/** Quebra a mensagem em blocos (linhas, citações, listas e blocos ``` ```). */
export function parseWhatsApp(texto: string): Block[] {
  const blocos: Block[] = [];
  const partes = texto.split(/```([\s\S]*?)```/);
  partes.forEach((parte, i) => {
    if (i % 2 === 1) return void blocos.push({ kind: "mono", text: parte.replace(/^\n|\n$/g, "") });
    // o \n colado a um bloco ``` já é a quebra dele, não uma linha em branco
    let corpo = parte;
    const temAntes = i > 0;
    const temDepois = i < partes.length - 1;
    if (temAntes && corpo.startsWith("\n")) corpo = corpo.slice(1);
    else if (temAntes && corpo === "") return;
    if (temDepois && corpo.endsWith("\n")) corpo = corpo.slice(0, -1);
    else if (temDepois && corpo === "") return;
    if ((temAntes || temDepois) && corpo === "" && parte.length <= 1) return;
    for (const linha of corpo.split("\n")) {
      let m: RegExpExecArray | null;
      if ((m = /^> ?(.*)$/.exec(linha))) blocos.push({ kind: "quote", nodes: parseInline(m[1]!) });
      else if ((m = /^[*-] (.*)$/.exec(linha))) blocos.push({ kind: "bullet", nodes: parseInline(m[1]!) });
      else if ((m = /^(\d+)\. (.*)$/.exec(linha))) blocos.push({ kind: "numbered", n: m[1]!, nodes: parseInline(m[2]!) });
      else blocos.push({ kind: "line", nodes: parseInline(linha) });
    }
  });
  return blocos;
}
