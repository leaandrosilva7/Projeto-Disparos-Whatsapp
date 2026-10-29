import type { PhoneIssue } from "@/lib/phone";

/** `telefoneErro` só existe quando o contato não tem telefone utilizável para disparo (nesse caso ele não entra em grupos). */
export type Contact = { id: string; nome: string; telefone: string; email: string; empresa: string; telefoneErro?: PhoneIssue };
/** Grupo salvo no banco do app. `contatoIds` guarda apenas ids do HubSpot (nunca uma cópia) ou `manual-<uuid>`. */
export type ContactGroup = { id: string; nome: string; descricao: string; contatoIds: string[]; criadoEm: string };
export type Template = { id: string; nome: string; conteudo: string; criadoEm: string };
export type { CampaignStatus } from "@/lib/campaign-rules";
import type { CampaignStatus } from "@/lib/campaign-rules";
export type Campaign = {
  id: string;
  nome: string;
  /** Setor dono da campanha (o ADMIN enxerga campanhas de todos os setores). */
  contaId: string;
  contaNome: string;
  grupoIds: string[];
  /** Nome dos grupos vindo do servidor: o ADMIN vê campanhas cujos grupos não são do setor dele. */
  grupos: { id: string; nome: string }[];
  templateId: string;
  templateNome: string | null;
  status: CampaignStatus;
  criadaEm: string;
  /** Data/hora local no formato "YYYY-MM-DDTHH:mm". Só preenchida quando status = Agendada. */
  agendadaPara: string | null;
  /** Contatos únicos dos grupos no momento em que a campanha foi salva/iniciada. */
  totalContatos: number;
  enviados: number;
  entregues: number;
  lidos: number;
  /** Decidido pelo servidor: o ADMIN só altera campanhas do próprio setor. */
  podeEditar: boolean;
};

const nomes = ["Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Rocha", "Elisa Costa", "Felipe Alves", "Gabriela Nunes", "Henrique Dias", "Isabela Martins", "João Pereira", "Karina Ribeiro", "Lucas Ferreira", "Mariana Gomes", "Nicolas Barros", "Olívia Cardoso", "Pedro Teixeira"];
const empresas = ["Acme Ltda", "Nova Tech", "Grupo Sul", "Vértice SA"];

export const contacts: Contact[] = nomes.map((nome, i) => ({
  id: `c${i + 1}`,
  nome,
  telefone: `+55 11 9${String(8000_0000 + i * 1371).slice(0, 4)}-${String(1000 + i * 37).slice(0, 4)}`,
  email: `${nome.split(" ")[0]!.toLowerCase()}@exemplo.com.br`,
  empresa: empresas[i % empresas.length]!,
}));

/** Substitui {{nome}} pelo primeiro nome do contato. Qualquer outra variável é mantida como está. */
export function renderTemplate(conteudo: string, c: Pick<Contact, "nome">) {
  return conteudo.replace(/\{\{(\w+)\}\}/g, (m: string, k: string) => (k === "nome" ? c.nome.split(" ")[0]! : m));
}

/** Desempenho diário fictício dos últimos 7 dias. */
export const desempenho7Dias = [
  { dia: "06/10", enviados: 220, entregues: 212, falhas: 8 },
  { dia: "07/10", enviados: 310, entregues: 301, falhas: 9 },
  { dia: "08/10", enviados: 180, entregues: 172, falhas: 8 },
  { dia: "09/10", enviados: 420, entregues: 409, falhas: 11 },
  { dia: "10/10", enviados: 260, entregues: 255, falhas: 5 },
  { dia: "11/10", enviados: 150, entregues: 146, falhas: 4 },
  { dia: "12/10", enviados: 240, entregues: 234, falhas: 6 },
];
