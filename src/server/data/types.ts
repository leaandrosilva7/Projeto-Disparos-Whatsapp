export type Role = "ADMIN" | "OPERADOR";

/** Usuário como o resto do sistema o enxerga: nunca inclui o hash da senha. */
export type UserRecord = {
  id: string;
  accountId: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  ultimoLoginEm: Date | null;
  criadoEm: Date;
};

export type AccountRecord = {
  id: string;
  nome: string;
  whatsappNumero: string | null;
  ativo: boolean;
  criadoEm: Date;
};

/** Usuário autenticado numa requisição (vem do banco, nunca do frontend). */
export type AuthUser = {
  id: string;
  accountId: string;
  accountNome: string;
  nome: string;
  email: string;
  role: Role;
};

export type TemplateRecord = { id: string; accountId: string; nome: string; conteudo: string; criadoEm: string };

/** `contatoIds`: ids do HubSpot (só dígitos) ou `manual-<uuid>` para contatos cadastrados à mão. */
export type GroupRecord = { id: string; accountId: string; nome: string; descricao: string; contatoIds: string[]; criadoEm: string };

export type ManualContactRecord = { id: string; nome: string; telefone: string; email: string; empresa: string };

export type { CampaignStatus } from "../../lib/campaign-rules.ts";
import type { CampaignStatus } from "../../lib/campaign-rules.ts";

export type CampaignRecord = {
  id: string;
  accountId: string;
  contaNome: string;
  nome: string;
  grupos: { id: string; nome: string }[];
  templateId: string | null;
  templateNome: string | null;
  status: CampaignStatus;
  criadaEm: string;
  agendadaPara: Date | null;
  totalContatos: number;
  enviados: number;
  entregues: number;
  lidos: number;
};

/** Conta/setor como o painel administrativo a enxerga. */
export type SectorRecord = AccountRecord & { totalUsuarios: number; temAdmin: boolean };

/** Usuário listado no painel administrativo (nunca inclui hash, bloqueios ou tokens). */
export type AdminUserRecord = UserRecord & { accountNome: string };
