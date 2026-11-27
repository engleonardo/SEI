# Microsoft Edge Add-ons - atualização 1.8.1

> A 1.8.1 é uma atualização da **1.8.0** e **não adiciona permissões novas**.
> O pacote é enviado e publicado pelo workflow **Publish Edge (API)** após a tag `v1.8.1`; o Partner Center pode ser usado como alternativa.
>
> **Situação:** pacote preparado para a tag `v1.8.1`. A 1.8.0 continua publicada até a aprovação.

## 1. Pacote

Partner Center → **Microsoft Edge** → SEI Flow → **Packages** → envie:

```
sei-flow-1.8.1-edge.zip
```

Confirme a versão **1.8.1**.

## 2. Listagem

- Nome: `SEI Flow`
- Resumo/descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity.
- Privacidade: `https://engleonardo.github.io/SEI/privacy.html`.
- Screenshots: `dashboard`, `options`, `destination`, `kanban`, `rules` (1280x800).
- Notas da versão: `docs/store/release-notes-1.8.1.md`.

## 3. Permissões e dados

As mesmas da 1.8.0 (`docs/store/chrome-1.8.1.md`):

- `storage`, `scripting`, `activeTab`, `alarms`.
- **Sem `notifications` e sem `identity`**.
- Host: `https://api.trello.com/*`, `https://auth.atlassian.com/*`, `https://engleonardo.github.io/SEI/oauth-callback.html` e o opcional `*://*/*`.
- Dados: Informações de autenticação + Conteúdo do site; sem servidor próprio.

## 4. Notes for certification

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

Version 1.8.1 is a feature and bug-fix update over 1.8.0. It does not add or change permissions. OAuth 2.0 (PKCE, public client) opens the Trello authorization page in a tab and completes at https://engleonardo.github.io/SEI/oauth-callback.html. A content script restricted to that page reads the OAuth code/state and sends it to the extension background. Tokens stay in storage.local.

Host permissions remain:
- https://api.trello.com/*: read/write cards, labels, checklists, comments, attachments, due dates and boards on the user's own Trello account, only on user action.
- https://auth.atlassian.com/*: exchange the OAuth code for the user's own tokens (login/refresh), no client secret.
- https://engleonardo.github.io/SEI/oauth-callback.html: OAuth callback page only.
- Optional *://*/*: requested at runtime when the user enables SEI Flow on their SEI installation.

No identity permission. No analytics, no ads, no developer server.
```

## 5. Publicação automática pela API (Publish API)

O workflow `.github/workflows/publish-edge.yml` usa `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID` e `EDGE_API_KEY`. Após o Release da tag `v1.8.1`, ele roda sozinho.

Diagnóstico:

- **HTTP 404 `Resource not found`**: o caminho correto é `/v1/products/...`; `/v1.1/...` não existe.
- **HTTP 403 `Client ID is Invalid`**: `EDGE_CLIENT_ID` não é o Client ID da página **Publish API** ou a API key não pertence a ele.
- **`InProgressSubmission`**: já existe submissão em análise; o workflow trata como aviso e termina verde.

## 6. Enviar

Revise **Properties**, **Privacy** e clique em **Publish / Submit for certification** (ou aguarde o workflow).
