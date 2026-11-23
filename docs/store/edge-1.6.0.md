# Microsoft Edge Add-ons - atualização 1.6.0

> O pacote **não** é enviado automaticamente. Use o zip da Release.

## 1. Enviar o pacote

1. Abra o [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/) e entre no SEI Flow.
2. Vá em **Packages** (ou **Update**) e envie:
   ```
   sei-flow-1.6.0-edge.zip
   ```
3. Confirme que o manifest mostra a versão **1.6.0**.

## 2. Página da loja (listing)

Em **Store listing**:

- **Name:** `SEI Flow`
- **Summary:** copie o "Resumo" de `docs/store/listing-pt-BR.md`.
- **Description:** copie a "Descrição completa".
- **Category:** Productivity.
- **Privacy policy:** `https://engleonardo.github.io/SEI/privacy.html`
- **Support:** `https://github.com/engleonardo/SEI/issues`
- **Screenshots (1280x800):** envie as de `docs/store/screenshots-1280x800/`. Sugestão:
  1. `dashboard-1280x800.png`
  2. `options-1280x800.png`
  3. `kanban-1280x800.png`
  4. `dashboard-dark-1280x800.png`
  5. `process-1280x800.png`
  6. `rules-1280x800.png`

## 3. Permissões e privacidade

Use os mesmos textos do Chrome (`docs/store/chrome-1.6.0.md`), em especial:

- `storage`: credenciais (login OAuth ou APP-KEY/TOKEN), destino, regras, preferências, sites e cache.
- `identity`: abrir a tela de login do Trello (OAuth 2.0/PKCE).
- `https://api.trello.com/*`: cartões/etiquetas/checklists/anexos/prazos na conta do usuário.
- `https://auth.atlassian.com/*`: troca/renovação dos tokens do próprio usuário.
- Permissão opcional de host: ativar o SEI Flow no domínio do SEI escolhido pelo usuário.

**Declaração de dados:**

- ☑ Informações de autenticação
- ☑ Conteúdo do site
- ☐ Demais categorias
- Sem servidor próprio, sem analytics, sem anúncios.

## 4. Notes for certification (em inglês)

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

OAuth 2.0 (PKCE) uses a public client; no client secret is shipped. Access and refresh tokens are stored only in storage.local and never sent to the developer.

Host permissions:
- https://api.trello.com/*: read/write cards, labels, checklists, attachments and due dates on the user's own Trello account, only on user action.
- https://auth.atlassian.com/*: exchange the OAuth authorization code for the user's own tokens (login/refresh), no client secret.
- Optional *://*/*: requested at runtime when the user enables SEI Flow on their SEI installation; the script exits on non-SEI pages.

No analytics, no ads, no developer server. The extension contacts only the Trello API and the Atlassian OAuth endpoint on behalf of the signed-in user.
```

## 5. Enviar para certificação

1. Revise a lista de **Properties** e **Privacy**.
2. Clique em **Publish** / **Submit for certification**.
3. Acompanhe o e-mail da Microsoft. A revisão do Edge costuma ser mais rápida que a do Chrome.

> O ID do Edge é próprio. A página de callback do OAuth aceita qualquer `*.chromiumapp.org`, então **não** é preciso registrar uma nova URL no app do Trello.
