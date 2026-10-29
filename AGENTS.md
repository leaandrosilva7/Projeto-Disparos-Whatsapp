<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Integrations (HubSpot, n8n, Z-API) live behind mock services in src/services/integrations.ts; swap implementations there without touching pages.
- Shared mock state uses a tiny useSyncExternalStore store in src/services/store.ts; avoids extra deps.
- Backend próprio em src/server/ (data/ = só SQL, services/ = regras, http/ = sessão/guardas, api/ = handlers); rotas finas em src/routes/api/*. Migrations em db/migrations; variáveis em .env.example. Auth: cookie HttpOnly, sem cadastro público; primeiro ADMIN via `npm run admin:create`.
