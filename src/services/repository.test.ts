import { describe, expect, it } from "vitest";
import { countUniqueContacts, validateSchedule } from "./repository";

describe("regras locais de apoio à interface", () => {
  it("conta contatos únicos entre grupos", () => {
    const g = (id: string, contatoIds: string[]) => ({ id, nome: id, descricao: "", contatoIds, criadoEm: "2026-01-01" });
    expect(countUniqueContacts([g("a", ["1", "2"]), g("b", ["2", "3"])], ["a", "b"])).toBe(3);
  });
  it("valida agendamento futuro", () => {
    expect(validateSchedule("", "")).toMatch(/Informe/);
    expect(validateSchedule("2000-01-01", "10:00")).toMatch(/futuros/);
    expect(validateSchedule("2999-01-01", "10:00")).toBeNull();
  });
});
