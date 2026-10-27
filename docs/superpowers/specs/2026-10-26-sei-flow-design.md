# SEI Flow — Design (Fase 1)

**Data:** 2026-10-26
**Status:** aprovado para implementação

## Objetivo

Criar uma extensão para Chrome, Firefox e Edge que integra cartões do Trello ao SEI (Sistema Eletrônico de Informações), com foco em:

- compatibilidade ampla com instalações e versões do SEI;
- vínculo de mão dupla: criar cartão a partir do processo **e** vincular um cartão existente do Trello a um processo;
- edição completa do cartão dentro do SEI (nome, descrição, etiquetas, quadro, lista, prazo, checklist);
- vinculação de vários cartões de uma vez;
- experiência isolada do CSS do SEI (Shadow DOM), acessível e responsiva;
- publicação nas lojas desde o primeiro release.

## Fora de escopo na Fase 1

- dashboard de prazos, notificações e badge (Fase 2);
- ações em lote entre vários processos (Fase 3);
- backend próprio, banco de dados ou sincronização offline com fila de mutações;
- provedores além do Trello.

## Stack

- **WXT** para manifest único, builds multiplataforma e empacotamento;
- **Vite + React 19 + TypeScript**;
- **CSS próprio** escopado em Shadow DOM (sem framework de UI);
- **Vitest + Testing Library** para unidade/componentes;
- **Playwright** para smoke test da extensão empacotada (opcional no CI).

Alternativas descartadas: Webpack + React 17 (dívida técnica), Vite + CRXJS (mais manual), Plasmo (mais pesado).

## Marca

- Fonte vetorial: `public/logo.svg` (quadro branco com barras azuis e pétalas coloridas).
- Ícones PNG 16/32/48/128 gerados por `scripts/generate-icons.mjs` com `sharp`.
- Componente `src/ui/BrandMark.tsx` replica a marca na UI injetada, popup e opções.
- Favicon das páginas de extensão aponta para `icon-128.png`.

## Conexão com o Trello

O Trello não oferece OAuth 2.0 para extensões sem servidor. O fluxo oficial client-side é **APP-KEY + TOKEN**, e é o que a extensão usa:

1. O usuário informa a APP-KEY (obtida em `trello.com/app-key`).
2. A extensão monta a URL de autorização com `scope=read,write`.
3. O Trello exibe o token; o usuário cola no campo TOKEN.
4. “Testar conexão” valida as credenciais e carrega os quadros.

As credenciais ficam em `chrome.storage.local` e são enviadas apenas para `api.trello.com`. Um fluxo OAuth de três pernas exigiria um servidor para assinar as requisições (consumer secret), o que contraria a decisão de não manter backend.

## Arquitetura

```
src/
  entrypoints/
    background.ts          # service worker: Trello, cache, ativação, injeção
    popup/                 # status + ativar neste site
    options/               # conexão, destino, sites, preferências
    sei-inject.ts          # script não listado injetado por scripting.executeScript
  core/
    messaging/             # contrato tipado content <-> background
    trello/                # client HTTP, cache, erros, repositório
    sei/                   # detecção de página, número do processo, linhas
    link/                  # marcador SEI <processo> (parse/adicionar/remover)
    domain/                # tipos Card, Board, List, Label, Checklist
    storage/               # settings tipadas
  ui/
    shadow.ts              # hosts com Shadow DOM + CSS compartilhado
    components/            # Card, CardStack, dialogs, pickers, toast
    styles.css             # tema claro/escuro, tudo prefixado sf-
    icons.tsx              # ícones SVG inline
  test/                    # setup e fixtures HTML do SEI
```

### Ativação por origem

Não há `content_scripts` no manifest. O usuário ativa o SEI em um site (ou em todos) pelo popup/opções. A permissão é opcional (`optional_host_permissions: ["*://*/*"]`), solicitada por gesto do usuário. O background guarda as origens ativadas e injeta `sei-inject.js` via `scripting.executeScript` em `tabs.onUpdated` (status `complete`) e imediatamente após a ativação.

Benefícios: funciona em qualquer domínio, pasta (`/sei/`, `/sip/`, `/web/sei/`) e versão; evita o aviso de "todos os sites" na instalação; reduz risco de rejeição na loja.

### Isolamento visual

Cada UI é montada em um host com Shadow DOM e uma `CSSStyleSheet` compartilhada (construída a partir do CSS importado com `?inline`). Nenhum estilo global é injetado na página.

### Fluxo de dados

1. O script injetado detecta a página (`process-list` ou `process-content`).
2. Lê o número do processo e os metadados do DOM.
3. Pede dados ao background via mensagens tipadas.
4. O background fala com `api.trello.com` (host permission), aplica cache e retry/backoff.
5. Mutações invalidam o cache e atualizam os stores locais; a UI reconcilia sem recarregar a página.

### Vínculo

O marcador canônico continua sendo uma linha `SEI <número-do-processo>` na descrição do cartão, compatível com a extensão legada e pesquisável no Trello. Um cartão pode ter vários vínculos.

- **Vincular**: lê o cartão atual, adiciona a linha sem tocar no texto, grava e devolve o cartão atualizado. Se já existir, é no-op.
- **Desvincular**: remove apenas a linha do processo atual; o cartão permanece no Trello.
- **Em lote**: o background processa N cartões com concorrência limitada e devolve sucesso/falha por cartão.
- A UI exibe a descrição sem as linhas de vínculo.

## Modelo de dados

```ts
type TrelloCard = {
  id: string;
  name: string;
  desc: string;
  shortUrl: string;
  due: string | null;
  dueComplete: boolean;
  idBoard: string;
  idList: string;
  idChecklists: string[];
  labels: TrelloLabel[];
  board: { id: string; name: string } | null;
  list: { id: string; name: string } | null;
  links: string[]; // processos extraídos da descrição
  description: string; // descrição sem os marcadores SEI
};
```

Configurações (chrome.storage.local): `appKey`, `appToken`, `defaultBoardId/Name`, `defaultListId/Name`, `activatedOrigins`, `allSites`, `theme`, `compact`, `autoRefreshMinutes`.

## Interface

### Visualização do processo
Painel no topo, com todos os cartões empilhados, contagem, refresh, "Novo cartão" e "Vincular cartões". Estado vazio com atalhos. Cartão completo com edição inline.

### Lista de processos
Uma linha extra após cada processo com cartões vinculados. Na célula de ações, um botão compacto "Cartão" abre criar/vincular. Barra de comandos com "SEI Flow", refresh e filtros (busca, sem cartão, atrasados, com prazo, etiquetas, localização).

### Cartão
- nome e descrição com edição inline;
- etiquetas: adicionar/remover/criar;
- checklist: criar lista, adicionar/marcar/remover itens;
- prazo: data + concluído/limpar;
- localização: quadro e lista;
- atualizar, abrir no Trello, desvincular do processo, excluir;
- estados de carregamento, erro, atrasado e vencendo.

### Vincular existentes
Modal com quadro, busca, filtro "somente sem vínculo", seleção múltipla, prévia do vínculo e confirmação. Resultado por cartão, com toast.

## Erros e limites

- Erros tipados: autenticação, permissão, não encontrado, validação, rate limit, rede, servidor.
- Backoff exponencial em 429/5xx com `Retry-After`, até 3 tentativas.
- Requisições GET idênticas em voo são coalescidas.
- Cache: quadros/listas 10 min; cartões do quadro 60 s; cartões por processo 60 s; tudo invalidado em mutações.
- Nenhum token é logado. Credenciais ficam só em `chrome.storage.local`.

## Testes

- Unidade: marcador (parse/adicionar/remover, múltiplos, legado), extração do número do processo, detecção de páginas (fixtures v3/v4/v5), client HTTP (URL, erros, retry), cache.
- Componentes: cartão, diálogo de vínculo, filtros, estados de erro.
- Smoke E2E (opcional): carregar a extensão no Chromium e abrir a página de opções.

## Publicação

- `npm run zip`, `zip:firefox`, `zip:edge`.
- Ícones 16/32/48/128, política de privacidade, README com instruções.
- CI no GitHub Actions: typecheck, lint, testes, build e artefatos.
- Release por tag `v*` com os zips anexados.
- Licença MIT + NOTICE com créditos ao projeto original SEI+Trello (Luís Carlos Reischak Júnior e fork comunitário).

## Roadmap

- **Fase 2**: dashboard de prazos (página própria), notificações, badge, visão por quadro/lista.
- **Fase 3**: ações em lote entre processos, modelos de cartão, importação/exportação CSV.
- **Fase 4**: internacionalização (pt-BR/en), métricas anônimas opt-in (se necessário), melhorias de acessibilidade contínuas.
