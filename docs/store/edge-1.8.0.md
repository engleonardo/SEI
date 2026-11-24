# Microsoft Edge Add-ons - atualização 1.8.0

> A 1.8.0 é uma atualização da **1.7.0**. Ela **remove** a permissão `notifications` e o alarme de prazos; não adiciona permissões novas.
> O pacote pode ser enviado pelo site do Partner Center ou pelo workflow **Publish Edge (API)**.

## 1. Pacote

Partner Center → **Microsoft Edge** → SEI Flow → **Packages** → envie:

```
sei-flow-1.8.0-edge.zip
```

Confirme a versão **1.8.0**.

## 2. Listagem

- Nome: `SEI Flow`
- Resumo/descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity.
- Privacidade: `https://engleonardo.github.io/SEI/privacy.html`.
- Screenshots: `dashboard`, `options`, `destination`, `kanban`, `rules` (1280x800).
- Notas da versão: `docs/store/release-notes-1.8.0.md`.

## 3. Permissões e dados

Use os textos de `docs/store/chrome-1.8.0.md`:

- `storage`, `scripting`, `activeTab`, `alarms`.
- **Sem `notifications` e sem `identity`**.
- Host: `https://api.trello.com/*`, `https://auth.atlassian.com/*`, `https://engleonardo.github.io/SEI/oauth-callback.html` e o opcional `*://*/*`.
- Dados: Informações de autenticação + Conteúdo do site; sem servidor próprio.

## 4. Notes for certification

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

OAuth 2.0 (PKCE, public client) opens the Trello authorization page in a tab. The registered callback is https://engleonardo.github.io/SEI/oauth-callback.html. A content script restricted to that page reads the OAuth code/state and sends it to the extension background. No per-install redirect URL is used. Tokens stay in storage.local.

Version 1.8.0 removes the notifications permission and the daily due-date notification. Host permissions:
- https://api.trello.com/*: read/write cards, labels, checklists, attachments, due dates and boards on the user's own Trello account, only on user action.
- https://auth.atlassian.com/*: exchange the OAuth code for the user's own tokens (login/refresh), no client secret.
- https://engleonardo.github.io/SEI/oauth-callback.html: OAuth callback page only.
- Optional *://*/*: requested at runtime when the user enables SEI Flow on their SEI installation.

No identity permission. No analytics, no ads, no developer server.
```

## 5. Publicação automática pela API (Publish API)

O workflow `.github/workflows/publish-edge.yml` usa três segredos do GitHub Actions. Para gerá-los:

1. Entre em [partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge/) com a **mesma conta Microsoft** que gerencia a extensão.
2. Abra **Microsoft Edge** → **SEI Flow**.
3. Copie o **Product ID** em **Extension identity** (é um GUID, no formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). **Não use o Store ID** que aparece na URL da loja.
4. No menu da extensão/Partner Center, abra **Publish API** e clique em **Create API credentials** (ou **Add new key**).
5. Copie o **Client ID** (GUID) e a **API key** (o segredo; aparece uma única vez).
6. No GitHub: **Settings → Secrets and variables → Actions**, atualize:
   - `EDGE_PRODUCT_ID` = Product ID (GUID da identidade da extensão)
   - `EDGE_CLIENT_ID` = Client ID (GUID)
   - `EDGE_API_KEY` = API key (segredo)

Depois disso, o Edge pode ser publicado pelo workflow **Publish Edge (API)**. Ele aceita:

- `tag`: `v1.8.0` (ou vazio para a branch atual);
- `upload_only`: `true` só envia, `false` envia e publica;
- `notes`: texto para a certificação.

> O erro **HTTP 404** no upload normalmente é Product ID/Client ID de outra conta ou um Store ID no lugar do Product ID. O workflow valida o formato GUID, mas só a API confirma a conta.

## 6. Enviar

Revise **Properties**, **Privacy** e clique em **Publish / Submit for certification** (ou rode o workflow).
