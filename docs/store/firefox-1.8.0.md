# Firefox Add-ons (AMO) - atualização 1.8.0

> A 1.8.0 é uma atualização da **1.7.0**. Ela **remove** a permissão `notifications` e o alarme de prazos; não adiciona permissões novas.
> O login continua igual: autorização em uma aba + página de callback com content script restrito.
> Firefox mínimo: **128** (o host do content script da página de callback é concedido na instalação a partir do 127; o 128 é a versão mínima adotada).

## 1. Pacote

1. Em [addons.mozilla.org/developers](https://addons.mozilla.org/developers/), abra o SEI Flow.
2. **Manage versions** → envie `sei-flow-1.8.0-firefox.zip` e `sei-flow-1.8.0-sources.zip`.
3. Confirme a versão **1.8.0**.

## 2. Trello

A URL de retorno do app continua sendo:

```
https://engleonardo.github.io/SEI/oauth-callback.html
```

Não é preciso cadastrar URL por instalação. O redirect antigo `*.extensions.allizom.org` pode ser mantido enquanto existirem usuários na 1.6.0 do Firefox; a 1.7.0/1.8.0 não o utiliza.

## 3. Página do add-on

- Nome: `SEI Flow`
- Resumo/descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity.
- Política de privacidade: `https://engleonardo.github.io/SEI/privacy.html`.
- Screenshots: `docs/store/screenshots-1280x800/`, incluindo `options-1280x800.png`, `destination-1280x800.png` e `kanban-1280x800.png`.
- Notas da versão: `docs/store/release-notes-1.8.0.md`.

## 4. Notes to reviewer

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

The OAuth 2.0 login (PKCE, public client) opens the Trello authorization page in a tab. The registered redirect is https://engleonardo.github.io/SEI/oauth-callback.html. A content script restricted to that page reads the OAuth code/state and sends it to the extension background. No per-install redirect URL is used. Tokens stay in storage.local.

Version 1.8.0 removes the notifications permission and the daily due-date notification. The remaining host permissions are:
- https://api.trello.com/*: read/write cards, labels, checklists, attachments, due dates and boards on the user's own Trello account, only on user action.
- https://auth.atlassian.com/*: exchange the OAuth code for the user's own tokens (login/refresh), no client secret.
- https://engleonardo.github.io/SEI/oauth-callback.html: OAuth callback page only.
- Optional *://*/*: requested at runtime when the user enables SEI Flow on their SEI installation; the script exits on non-SEI pages.

No identity permission. No analytics, no ads, no developer server.
```

## 5. Dados

Se a AMO pedir a declaração:

```
The extension does not collect or transmit data to the developer. Data is exchanged only with the user's own Trello account and the Atlassian OAuth endpoint, as requested by the user. Tokens stay in storage.local. The callback content script runs only on the OAuth callback page.
```

## 6. Enviar

Salve a página, confirme a 1.8.0 e acompanhe o e-mail da Mozilla.
