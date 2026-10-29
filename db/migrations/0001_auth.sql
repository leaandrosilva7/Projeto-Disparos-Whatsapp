-- 0001_auth: contas (setores), usuários e sessões.
-- Acesso exclusivo pelo backend (nenhuma tabela é exposta ao navegador).
-- SQL padrão PostgreSQL: sem recursos específicos do Supabase, para facilitar uma migração futura.

-- Conta = setor. Cada conta tem um número de WhatsApp (preenchido na etapa do número).
create table accounts (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  whatsapp_numero  text,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint accounts_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint accounts_whatsapp_formato check (whatsapp_numero is null or whatsapp_numero ~ '^\+[1-9][0-9]{7,14}$')
);
create unique index accounts_nome_unico on accounts (lower(nome));

create table users (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts (id) on delete restrict,
  nome             text not null,
  email            text not null,
  password_hash    text not null,
  role             text not null,
  ativo            boolean not null default true,
  falhas_login     integer not null default 0,
  bloqueado_ate    timestamptz,
  ultimo_login_em  timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint users_role_valido check (role in ('ADMIN', 'OPERADOR')),
  constraint users_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint users_email_tamanho check (char_length(email) between 3 and 254),
  constraint users_falhas_nao_negativas check (falhas_login >= 0)
);
create unique index users_email_unico on users (lower(email));
create index users_account_idx on users (account_id);
create index users_role_idx on users (role) where ativo;

-- Sessões opacas: o cookie leva um token aleatório; aqui fica apenas o hash SHA-256 dele.
-- Vazamento do banco, portanto, não permite sequestrar sessões.
create table sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  token_hash     text not null,
  criada_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  ip             text,
  user_agent     text
);
create unique index sessions_token_hash_unico on sessions (token_hash);
create index sessions_user_idx on sessions (user_id);
create index sessions_expira_idx on sessions (expira_em);
