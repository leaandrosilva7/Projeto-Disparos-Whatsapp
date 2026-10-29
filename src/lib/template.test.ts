import { describe, expect, it } from "vitest";
import { invalidVariables, TEMPLATE_MAX_LENGTH, validateTemplateContent } from "./template";

describe("validateTemplateContent", () => {
  it("aceita texto com {{nome}} ou sem variáveis", () => {
    expect(validateTemplateContent("Olá {{nome}}, tudo bem?")).toBeNull();
    expect(validateTemplateContent("Mensagem sem variáveis")).toBeNull();
  });

  it("recusa vazio e acima do limite", () => {
    expect(validateTemplateContent("   ")).toMatch(/Escreva/);
    expect(validateTemplateContent("a".repeat(TEMPLATE_MAX_LENGTH + 1))).toMatch(/limite/);
    expect(validateTemplateContent("a".repeat(TEMPLATE_MAX_LENGTH))).toBeNull();
  });

  it("recusa {{empresa}} e qualquer variável que não seja {{nome}}", () => {
    expect(validateTemplateContent("Oi {{nome}} da {{empresa}}")).toMatch(/\{\{empresa\}\}/);
    expect(validateTemplateContent("Oi {{sobrenome}}")).toMatch(/Variável inválida/);
    expect(invalidVariables("{{x}} {{x}} {{nome}}")).toEqual(["x"]);
  });

  it("recusa {{ nome }} com espaços (não seria substituída)", () => {
    expect(validateTemplateContent("Oi {{ nome }}")).toMatch(/Variável inválida/);
  });

  it("recusa chaves incompletas", () => {
    expect(validateTemplateContent("Oi {{nome")).toMatch(/incompletas/);
    expect(validateTemplateContent("Oi nome}}")).toMatch(/incompletas/);
  });
});
