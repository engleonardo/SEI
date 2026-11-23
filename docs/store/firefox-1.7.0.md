# Firefox Add-ons (AMO) - atualização 1.7.0

> A 1.7.0 corrige o login no Firefox: a autorização abre em uma aba e a **página de callback** entrega o código por um content script. Não existe mais URL de retorno por instalação.
> A permissão `identity` foi removida.
>
> **Antes de enviar:** a página `https://engleonardo.github.io/SEI/oauth-callback.html` precisa estar publicada com o `oauth-callback.js` novo (modo `m: 'page'`). Isso acontece ao mergear a branch na `main` (workflow **Pages**). Sem esse deploy, o login conclui pelo content script, mas a aba mostra erro antes de fechar.
>
> **Firefox 128+:** a 1.7.0 exige Firefox 128 ou superior. A partir do 127 o Firefox concede as permissões de host de `content_scripts` na instalação, que é o que faz o content script da página de callback rodar sem liberação manual. No 115–126 o login poderia falhar sem aviso; por isso a versão mínima subiu.
>
> **Atualização:** a 1.7.0 adiciona esse host como permissão nova. O Firefox pode pedir aprovação (e desativar até aceitar) para quem já tem a 1.6.0.

## 1. Pacote

1. Em [addons.mozilla.org/developers](https://addons.mozilla.org/developers/), abra o SEI Flow.
2. **Manage versions** → envie `sei-flow-1.7.0-firefox.zip` e o `sei-flow-1.7.0-sources.zip`.
3. Confirme a versão **1.7.0** em revisão.

## 2. Trello

A URL de retorno do app continua sendo:

```
https://engleonardo.github.io/SEI/oauth-callback.html
```

Não é preciso cadastrar URL `extensions.allizom.org` por instalação. Se você adicionou a URL de teste anterior, pode removê-la.

## 3. Página do add-on

- Nome: `SEI Flow`
- Resumo/descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity.
- Política de privacidade: `https://github.com/engleonardo/SEI/blob/main/PRIVACY.md`.
- Screenshots: use as de `docs/store/screenshots-1280x800/`, incluindo `options-1280x800.png` e `destination-1280x800.png`.
- Notas da versão: `docs/store/release-notes-1.7.0.md`.

## 4. Notes to reviewer

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

The OAuth 2.0 login (PKCE, public client) opens the Trello authorization page in a tab. The registered redirect is https://engleonardo.github.io/SEI/oauth-callback.html. A content script restricted to that page reads the OAuth code/state and sends it to the extension background. No per-install redirect URL is used. Tokens stay in storage.local.

Host permissions:
- https://api.trello.com/*: read/write cards, labels, checklists, attachments, due dates and boards on the user's own Trello account, only on user action.
- https://auth.atlassian.com/*: exchange the OAuth code for the user's own tokens (login/refresh), no client secret.
- https://engleonardo.github.io/SEI/oauth-callback.html: OAuth callback page only.
- Optional *://*/*: requested at runtime when the user enables SEI Flow on their SEI installation; the script exits on non-SEI pages.

No identity permission. No analytics, no ads, no developer server.
```

## 5. Dados

Se a AMO pedir a declaração, mantenha o mesmo racional:

```
The extension does not collect or transmit data to the developer. Data is exchanged only with the user's own Trello account and the Atlassian OAuth endpoint, as requested by the user. Tokens stay in storage.local. The callback content script runs only on the OAuth callback page.
```

## 6. Enviar

Salve a página, confirme a 1.7.0 e acompanhe o e-mail da Mozilla.

> A página de callback precisa estar publicada antes da 1.7.0 ser enviada (veja o aviso no topo). O mesmo cadastro de redirect serve para todos os usuários.
