# Microsoft Edge Add-ons - atualização 1.7.0

> A 1.7.0 remove a permissão `identity` e usa a página de callback do OAuth (content script restrito). O pacote é enviado manualmente.

## 1. Pacote

Partner Center → SEI Flow → **Packages** → envie:

```
sei-flow-1.7.0-edge.zip
```

Confirme a versão **1.7.0**.

## 2. Listagem

- Nome: `SEI Flow`
- Resumo/descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity.
- Privacidade: `https://github.com/engleonardo/SEI/blob/main/PRIVACY.md`.
- Screenshots: `dashboard`, `options`, `destination`, `kanban`, `rules` (1280x800).
- Notas da versão: `docs/store/release-notes-1.7.0.md`.

## 3. Permissões e dados

Use os textos de `docs/store/chrome-1.7.0.md`:

- `storage`, `scripting`, `activeTab`, `alarms`, `notifications`.
- **Sem `identity`**.
- Host: `https://api.trello.com/*`, `https://auth.atlassian.com/*`, `https://engleonardo.github.io/SEI/oauth-callback.html` e o opcional `*://*/*`.
- Dados: Informações de autenticação + Conteúdo do site; sem servidor próprio.

## 4. Notes for certification

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

OAuth 2.0 (PKCE, public client) opens the Trello authorization page in a tab. The registered callback is https://engleonardo.github.io/SEI/oauth-callback.html. A content script restricted to that page reads the OAuth code/state and sends it to the extension background. No per-install redirect URL is used. Tokens stay in storage.local.

Host permissions:
- https://api.trello.com/*: read/write cards, labels, checklists, attachments, due dates and boards on the user's own Trello account, only on user action.
- https://auth.atlassian.com/*: exchange the OAuth code for the user's own tokens (login/refresh), no client secret.
- https://engleonardo.github.io/SEI/oauth-callback.html: OAuth callback page only.
- Optional *://*/*: requested at runtime when the user enables SEI Flow on their SEI installation.

No identity permission. No analytics, no ads, no developer server.
```

## 5. Enviar

Revise **Properties**, **Privacy** e clique em **Publish / Submit for certification**.

> O ID do Edge é próprio, mas o login não depende mais dele: a página de callback é a mesma para Chrome, Edge e Firefox.
