import { describe, expect, it } from "vitest";
import { parseInline, parseWhatsApp, toggleInline, toggleLines } from "./whatsapp-format";

describe("toggleInline", () => {
  it("envolve a seleção com a sintaxe do WhatsApp", () => {
    expect(toggleInline("Oi mundo", 3, 8, "bold").text).toBe("Oi *mundo*");
    expect(toggleInline("Oi mundo", 3, 8, "italic").text).toBe("Oi _mundo_");
    expect(toggleInline("Oi mundo", 3, 8, "strike").text).toBe("Oi ~mundo~");
    expect(toggleInline("Oi mundo", 3, 8, "mono").text).toBe("Oi ```mundo```");
  });
  it("remove quando já está formatado (seleção dentro ou fora dos marcadores)", () => {
    expect(toggleInline("Oi *mundo*", 4, 9, "bold").text).toBe("Oi mundo");
    expect(toggleInline("Oi *mundo*", 3, 10, "bold").text).toBe("Oi mundo");
  });
  it("mantém espaços fora dos marcadores e sem seleção insere o par", () => {
    expect(toggleInline("a b c", 1, 4, "bold").text).toBe("a *b* c");
    const r = toggleInline("", 0, 0, "bold");
    expect([r.text, r.start]).toEqual(["**", 1]);
  });
});

describe("toggleLines", () => {
  it("aplica e remove lista/citação nas linhas", () => {
    expect(toggleLines("a\nb", 0, 3, "bullet").text).toBe("- a\n- b");
    expect(toggleLines("- a\n- b", 0, 7, "bullet").text).toBe("a\nb");
    expect(toggleLines("a\nb", 0, 3, "numbered").text).toBe("1. a\n2. b");
    expect(toggleLines("a", 0, 1, "quote").text).toBe("> a");
  });
});

describe("parseWhatsApp", () => {
  it("interpreta negrito, itálico, tachado e aninhamento", () => {
    expect(parseInline("*a* _b_ ~c~")).toEqual([
      { t: "bold", c: [{ t: "text", v: "a" }] }, { t: "text", v: " " },
      { t: "italic", c: [{ t: "text", v: "b" }] }, { t: "text", v: " " },
      { t: "strike", c: [{ t: "text", v: "c" }] },
    ]);
    expect(parseInline("*a _b_*")).toEqual([{ t: "bold", c: [{ t: "text", v: "a " }, { t: "italic", c: [{ t: "text", v: "b" }] }] }]);
  });
  it("não formata com espaço colado ao marcador (igual ao WhatsApp)", () => {
    expect(parseInline("* a *")).toEqual([{ t: "text", v: "* a *" }]);
  });
  it("reconhece bloco monoespaçado, citação e listas", () => {
    const b = parseWhatsApp("> cit\n- item\n1. um\n```x *y*```");
    expect(b.map((x) => x.kind)).toEqual(["quote", "bullet", "numbered", "mono"]);
    expect(b[3]).toEqual({ kind: "mono", text: "x *y*" });
  });
});
