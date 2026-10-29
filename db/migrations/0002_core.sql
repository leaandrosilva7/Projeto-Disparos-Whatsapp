-- 0002_core: templates, grupos de contatos, contatos manuais e campanhas.
-- Todo dado de negócio pertence a UMA conta (setor): account_id nunca vem do navegador.
-- SQL padrão PostgreSQL, sem recursos específicos do Supabase (migração futura facilitada).

-- Um número de WhatsApp só pode estar associado a um setor.
create unique index accounts_whatsapp_unico on accounts (whatsapp_numero) where whatsapp_numero is not null;

create table templates (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts (id) on delete restrict,
  nome           text not null,
  conteudo       text not null,
  criado_por     uuid references users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint templates_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint templates_conteudo_tamanho check (char_length(conteudo) between 1 and 1024)
);
create unique index templates_nome_unico on templates (account_id, lower(nome));

create table contact_groups (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts (id) on delete restrict,
  nome           text not null,
  descricao      text not null default '',
  criado_por     uuid references users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint contact_groups_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint contact_groups_descricao_tamanho check (char_length(descricao) <= 500)
);
create unique index contact_groups_nome_unico on contact_groups (account_id, lower(nome));

-- Contatos cadastrados à mão (não existem no HubSpot). Telefone sempre em E.164 de celular brasileiro.
create table manual_contacts (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts (id) on delete restrict,
  nome        text not null,
  telefone    text not null,
  email       text not null default '',
  empresa     text not null default '',
  criado_em   timestamptz not null default now(),
  constraint manual_contacts_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint manual_contacts_telefone_formato check (telefone ~ '^\+55[1-9][1-9]9[0-9]{8}$'),
  constraint manual_contacts_email_tamanho check (char_length(email) <= 254),
  constraint manual_contacts_empresa_tamanho check (char_length(empresa) <= 120)
);
create unique index manual_contacts_telefone_unico on manual_contacts (account_id, telefone);

-- Membro de um grupo: OU um id do HubSpot (guardamos só a referência, nunca uma cópia) OU um contato manual.
create table group_members (
  group_id           uuid not null references contact_groups (id) on delete cascade,
  hubspot_id         text,
  manual_contact_id  uuid references manual_contacts (id) on delete cascade,
  adicionado_em      timestamptz not null default clock_timestamp(),
  constraint group_members_um_tipo check ((hubspot_id is not null)::int + (manual_contact_id is not null)::int = 1),
  constraint group_members_hubspot_formato check (hubspot_id is null or hubspot_id ~ '^[0-9]{1,20}$')
);
create unique index group_members_hubspot_unico on group_members (group_id, hubspot_id) where hubspot_id is not null;
create unique index group_members_manual_unico on group_members (group_id, manual_contact_id) where manual_contact_id is not null;
create index group_members_manual_idx on group_members (manual_contact_id) where manual_contact_id is not null;

create table campaigns (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts (id) on delete restrict,
  nome            text not null,
  -- Template excluído não apaga o histórico de campanhas encerradas (a exclusão é barrada pelo serviço se houver campanha em aberto).
  template_id     uuid references templates (id) on delete set null,
  status          text not null default 'Rascunho',
  agendada_para   timestamptz,
  total_contatos  integer not null default 0,
  enviados        integer not null default 0,
  entregues       integer not null default 0,
  lidos           integer not null default 0,
  criado_por      uuid references users (id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint campaigns_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint campaigns_status_valido check (status in ('Rascunho', 'Agendada', 'Em andamento', 'Pausada', 'Concluída', 'Cancelada')),
  -- Só campanha Agendada tem data de agendamento.
  constraint campaigns_agenda_coerente check ((status = 'Agendada') = (agendada_para is not null)),
  constraint campaigns_contadores_validos check (
    total_contatos >= 0 and enviados >= 0 and entregues >= 0 and lidos >= 0 and entregues <= enviados and lidos <= enviados
  )
);
create index campaigns_conta_idx on campaigns (account_id, criado_em desc);
create index campaigns_template_idx on campaigns (template_id) where template_id is not null;
create index campaigns_status_idx on campaigns (status);

create table campaign_groups (
  campaign_id  uuid not null references campaigns (id) on delete cascade,
  group_id     uuid not null references contact_groups (id) on delete cascade,
  primary key (campaign_id, group_id)
);
create index campaign_groups_group_idx on campaign_groups (group_id);
