/**
 * Modo sem token: dados 100% fictícios, no MESMO formato bruto do HubSpot, passando pelo mesmo
 * conversor (`toContact`) do modo real. Serve para testar a interface (incluindo a validação de
 * telefone e a paginação) antes de configurar o token.
 */
import { toContact, toList, type HubspotList, type ListsPage, type MembersPage, type RawContact } from "./hubspot";
import type { Contact } from "./mock-data";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE = 100;

const NOMES = ["Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Rocha", "Elisa Costa", "Felipe Alves", "Gabriela Nunes", "Henrique Dias"];

/** Telefones fictícios nos formatos observados no HubSpot, incluindo os que devem ser barrados. */
const TELEFONES: { mobilephone: string | null; phone: string | null }[] = [
  { mobilephone: "+5511999990001", phone: null },
  { mobilephone: null, phone: "11999990002" }, // sem +55
  { mobilephone: "+55-21-9999-90003", phone: null }, // com hifens
  { mobilephone: null, phone: "999990004" }, // sem DDD → inválido
  { mobilephone: null, phone: null }, // sem telefone
  { mobilephone: "", phone: "" }, // vazio
  { mobilephone: "+5531999990005", phone: "31999990005" },
  { mobilephone: null, phone: "+14155550123" }, // outro país → inválido
];

function fakeRaw(id: number): RawContact {
  const i = id % 1000;
  const tel = TELEFONES[i % TELEFONES.length]!;
  const nome = NOMES[i % NOMES.length]!.split(" ");
  const semNome = i % 3 === 0; // no HubSpot real muitos contatos vêm sem nome
  return {
    id: String(id),
    archived: false,
    properties: {
      firstname: semNome ? null : nome[0]!,
      lastname: semNome ? null : nome[1]!,
      email: `contato${id}@exemplo.com.br`,
      company: i % 4 === 0 ? "Empresa Exemplo" : null,
      ...tel,
    },
  };
}

type FakeList = { listId: string; name: string; size: number; firstId: number };
const LISTAS: FakeList[] = [
  { listId: "9001", name: "Leads Webinar (exemplo)", size: 130, firstId: 9_001_000 },
  { listId: "9002", name: "Clientes Ativos (exemplo)", size: 24, firstId: 9_002_000 },
  { listId: "9003", name: "Evento São Paulo (exemplo)", size: 60, firstId: 9_003_000 },
  { listId: "9004", name: "Lista vazia (exemplo)", size: 0, firstId: 9_004_000 },
];

const asRawList = (l: FakeList) => ({ listId: l.listId, name: l.name, processingType: "MANUAL", additionalProperties: { hs_list_size: String(l.size) } });

export const hubspotMock = {
  async searchLists(query: string): Promise<ListsPage> {
    await wait(350);
    const q = query.trim().toLowerCase();
    const listas: HubspotList[] = LISTAS.filter((l) => l.name.toLowerCase().includes(q)).map((l) => toList(asRawList(l)));
    return { listas, total: listas.length, proximo: null };
  },

  async getListContacts(listId: string, after?: string): Promise<MembersPage> {
    await wait(350);
    const lista = LISTAS.find((l) => l.listId === listId);
    if (!lista) return { contatos: [], proximo: null, total: 0 };
    const inicio = Number(after ?? 0);
    const fim = Math.min(inicio + PAGE, lista.size);
    const contatos = Array.from({ length: Math.max(fim - inicio, 0) }, (_, k) => toContact(fakeRaw(lista.firstId + inicio + k)));
    return { contatos, proximo: fim < lista.size ? String(fim) : null, total: lista.size };
  },

  async getContactsByIds(ids: string[]): Promise<Contact[]> {
    await wait(200);
    const validos = ids.map(Number).filter((n) => LISTAS.some((l) => n >= l.firstId && n < l.firstId + l.size));
    return validos.map((n) => toContact(fakeRaw(n)));
  },
};
