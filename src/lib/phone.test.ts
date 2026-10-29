import { describe, expect, it } from "vitest";
import { pickPhone } from "./phone";

// Números fictícios, nos mesmos formatos vistos no HubSpot.
describe("pickPhone", () => {
  it("aceita os formatos encontrados no HubSpot", () => {
    expect(pickPhone({ mobilephone: "+5561999990001", phone: null })).toMatchObject({ ok: true, e164: "+5561999990001" });
    expect(pickPhone({ mobilephone: null, phone: "61999990001" })).toMatchObject({ ok: true, e164: "+5561999990001" });
    expect(pickPhone({ mobilephone: "+55-86-9999-90003", phone: null })).toMatchObject({ ok: true, e164: "+5586999990003" });
    expect(pickPhone({ mobilephone: "(11) 99999-0002", phone: null })).toMatchObject({ ok: true, formatted: "+55 11 99999-0002" });
  });

  it("marca como sem telefone quando vem nulo ou vazio", () => {
    expect(pickPhone({ mobilephone: null, phone: null })).toMatchObject({ ok: false, issue: "sem_telefone" });
    expect(pickPhone({ mobilephone: "", phone: "  " })).toMatchObject({ ok: false, issue: "sem_telefone" });
  });

  it("marca como inválido: sem DDD, fixo, sem 9º dígito, outro país, lixo", () => {
    for (const v of ["999990004", "1133334444", "11 8888-7777", "+14155550123", "+351912345678", "abc", "0000"]) {
      expect(pickPhone({ mobilephone: null, phone: v })).toMatchObject({ ok: false, issue: "invalido" });
    }
  });

  it("usa o segundo campo quando o primeiro é inválido", () => {
    expect(pickPhone({ mobilephone: "999990004", phone: "11999990002" })).toMatchObject({ ok: true, e164: "+5511999990002" });
  });
});
