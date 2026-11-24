# Firefox Add-ons (AMO) - atualização 1.6.0

> O workflow **Publish to stores** já assinou e enviou o pacote 1.6.0 para a AMO.
> O que falta é revisar a **página do add-on** (textos e prints) e, se o envio não aparecer, subir o pacote manualmente.

## 1. Conferir a versão

1. Abra [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) e entre no SEI Flow.
2. Em **Manage versions**, confirme a versão **1.6.0** em revisão.
3. Se não estiver lá, use **Upload a new version** com:
   - pacote: `sei-flow-1.6.0-firefox.zip` (da Release `v1.6.0`);
   - **source code**: `sei-flow-1.6.0-sources.zip`.

## 2. Página do add-on (listing)

Em **Edit product page**:

- **Name:** `SEI Flow`
- **Summary:** copie do `docs/store/listing-pt-BR.md` (bloco "Resumo").
- **Description:** copie o bloco "Descrição completa" inteiro.
- **Categories:** Productivity.
- **Tags sugeridas:** `trello`, `sei`, `processos`, `produtividade`, `governo`.
- **Privacy policy:** `https://engleonardo.github.io/SEI/privacy.html`
- **Homepage / Support:** `https://github.com/engleonardo/SEI`
- **Screenshots:** envie as de `docs/store/screenshots-1280x800/`. Sugestão de ordem:
  1. `dashboard-1280x800.png`
  2. `options-1280x800.png`
  3. `kanban-1280x800.png`
  4. `dashboard-dark-1280x800.png`
  5. `process-1280x800.png`
  6. `rules-1280x800.png`
  7. `filter-1280x800.png`

## 3. Notas para o revisor (Notes to reviewer)

Cole em inglês:

```
SEI Flow connects Trello to SEI (Brazilian public administration process system).

OAuth 2.0 (PKCE) uses a public client registered by the developer; no client secret is shipped.
Access and refresh tokens are stored only in browser storage (storage.local) and are never sent to the developer.

Host permissions:
- https://api.trello.com/*: read/write cards, labels, checklists, attachments and due dates on the user's own Trello account, only when the user performs an action.
- https://auth.atlassian.com/*: exchange the OAuth authorization code for the user's own tokens (login/refresh). No client secret.
- Optional *://*/*: requested at runtime when the user chooses to enable SEI Flow on their SEI installation. The script exits on pages that are not SEI.

No analytics, no ads, no developer server. The extension only contacts the Trello API and the Atlassian OAuth endpoint on behalf of the signed-in user.

The "SEI Flow - Configurações (não excluir)" private board belongs to the user's own Trello account and stores only their rules and default board/list for cross-browser sync.
```

## 4. Notas da versão (Release notes)

Copie de `docs/store/release-notes-1.6.0.md`.

## 5. Declaração de dados (se aparecer)

O manifest declara `data_collection_permissions.required: ["none"]` (sem coleta pelo desenvolvedor).
Se a AMO pedir justificativa, use:

```
The extension does not collect or transmit data to the developer. Data is exchanged only with the user's own Trello account and the Atlassian OAuth endpoint, as requested by the user. Tokens stay in storage.local.
```

## 6. Enviar para revisão

1. Salve a página do add-on.
2. Confirme a versão 1.6.0 em revisão.
3. Acompanhe o e-mail da Mozilla. Se pedirem ajustes, responda no mesmo thread.

> O ID do Firefox é diferente do Chrome/Edge; a página de callback do OAuth aceita o domínio `*.extensions.allizom.org`, então não é preciso registrar nada novo.
