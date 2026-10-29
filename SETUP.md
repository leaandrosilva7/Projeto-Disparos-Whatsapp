# Disparador WhatsApp — configuração e execução

## 1. Supabase (somente como PostgreSQL)
1. Crie um projeto no Supabase. Não use Supabase Auth.
2. Em *Project Settings > Database > Connection string*, copie a string de conexão (pooler).
3. `cp .env.example .env.local` e preencha `DATABASE_URL` (a senha do banco nunca vai para o navegador).

## 2. Instalar, migrar e criar o primeiro ADMIN
```bash
npm ci
npm run db:migrate          # aplica db/migrations (0001_auth, 0002_core); seguro repetir
ADMIN_NOME="Seu Nome" ADMIN_EMAIL="voce@empresa.com" ADMIN_SENHA="uma-senha-forte" npm run admin:create
```
O ADMIN é sempre criado no setor **TI**; o comando só funciona uma vez (não existe cadastro público).

## 3. Executar
```bash
npm run dev                 # desenvolvimento
npm run build               # produção
npx vitest run              # testes (usam PGlite em memória; não precisam do Supabase)
```
Depois do login, o ADMIN gerencia setores e operadores em `/usuarios` (ou pela API `/api/admin/*`).

## Regras de acesso (aplicadas no servidor)
- Toda rota `/api/*` exige sessão (cookie HttpOnly); rotas `/api/admin/*` exigem ADMIN.
- ADMIN **vê** campanhas de todos os setores; só **altera** as do próprio setor (TI).
- OPERADOR só acessa dados do próprio setor; IDs de outro setor respondem 404.
- Usuário/setor desativado perde o acesso imediatamente.

## Pendências (dependem de terceiros ou fora do escopo pedido)
- n8n e Z-API: não implementados (há `TODO(n8n)` em `services/campaigns.ts`). Iniciar campanha só muda o status; nada é enviado. O status da conexão do WhatsApp aparece como "indisponível".
- HubSpot: contatos vêm do navegador via proxy de desenvolvimento; o servidor valida só o formato dos ids. `VITE_HUBSPOT_TOKEN` expõe token no navegador — não use em produção; precisa de proxy no servidor.
- Gráfico "7 dias" do dashboard segue com dados de exemplo (depende dos envios reais).
- Tela de usuários e setores em `/usuarios` (só ADMIN, item "Usuários" no menu). Não foi testada manualmente no navegador.
- Deploy: o build gera alvo Cloudflare (nitro); `pg` exige `nodejs_compat` ou outro host Node. Não testado contra um Supabase real (sem credenciais aqui); a lógica foi testada em PostgreSQL via PGlite.
