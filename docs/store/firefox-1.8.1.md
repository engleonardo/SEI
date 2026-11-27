# Firefox Add-ons (AMO) - atualização 1.8.1

> A 1.8.1 é uma atualização da **1.8.0** e **não adiciona permissões novas**.
> O login continua por aba + página de callback com content script restrito.
> Firefox mínimo: **128**.

## 1. Pacote

1. Em [addons.mozilla.org/developers](https://addons.mozilla.org/developers/), abra o SEI Flow.
2. **Manage versions** → envie `sei-flow-1.8.1-firefox.zip` e `sei-flow-1.8.1-sources.zip`.
3. Confirme a versão **1.8.1**.

> O workflow **Publish to stores** assina e envia automaticamente após o Release, se os segredos `AMO_*` estiverem configurados.

## 2. Trello

A URL de retorno do app continua sendo:

```
https://engleonardo.github.io/SEI/oauth-callback.html
```

Não é preciso cadastrar URL por instalação.

## 3. Página do add-on

- Nome: `SEI Flow`
- Resumo/descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity.
- Política de privacidade: `https://engleonardo.github.io/SEI/privacy.html`.
- Screenshots: `docs/store/screenshots-1280x800/`.
- Notas da versão: `docs/store/release-notes-1.8.1.md`.

## 4. Notes to reviewer

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

Version 1.8.1 is a feature and bug-fix update over 1.8.0. It does not add or change permissions. The OAuth 2.0 login (PKCE, public client) opens the Trello authorization page in a tab and completes at https://engleonardo.github.io/SEI/oauth-callback.html. A content script restricted to that page reads the OAuth code/state and sends it to the extension background. Tokens stay in storage.local.

Host permissions remain:
- https://api.trello.com/*: read/write cards, labels, checklists, comments, attachments, due dates and boards on the user's own Trello account, only on user action.
- https://auth.atlassian.com/*: exchange the OAuth code for the user's own tokens (login/refresh), no client secret.
- https://engleonardo.github.io/SEI/oauth-callback.html: OAuth callback page only.
- Optional *://*/*: requested at runtime when the user enables SEI Flow on their SEI installation; the script exits on non-SEI pages.

No identity permission. No analytics, no ads, no developer server.
```

## 5. Dados

```
The extension does not collect or transmit data to the developer. Data is exchanged only with the user's own Trello account and the Atlassian OAuth endpoint, as requested by the user. Tokens stay in storage.local. Checklist templates and preferences stay in browser storage. The callback content script runs only on the OAuth callback page.
```

## 6. Enviar

Salve a página, confirme a 1.8.1 e acompanhe o e-mail da Mozilla.
