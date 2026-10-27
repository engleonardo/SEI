# SEI Flow

<p align="center">
  <img src="docs/brand/sei-flow.svg" width="112" alt="Logo do SEI Flow" />
</p>

Extensão para **Chrome, Firefox e Edge** que integra o **Trello** ao **SEI (Sistema Eletrônico de Informações)**. Crie, vincule e edite cartões diretamente na árvore e na lista de processos, sem alternar de aba. O **Painel SEI Flow** é a página inicial da extensão: reúne prazos, etiquetas, tipos de processo, atualizações e edição completa dos cartões.

> Projeto independente, sem afiliação ao Trello/Atlassian ou ao SEI. Licença MIT.

## Baixar e instalar

- **Chrome / Edge:** [sei-flow-1.0.0-chrome.zip](https://github.com/engleonardo/SEI/releases/download/v1.0.0/sei-flow-1.0.0-chrome.zip)
- **Firefox:** [sei-flow-1.0.0-firefox.zip](https://github.com/engleonardo/SEI/releases/download/v1.0.0/sei-flow-1.0.0-firefox.zip)
- **Todas as versões:** [Releases](https://github.com/engleonardo/SEI/releases)

Depois de baixar, **extraia o zip** e carregue a pasta em `chrome://extensions` (ou `edge://extensions`) com o **Modo desenvolvedor** ativado. No Firefox, use `about:debugging` → **Carregar extensão temporária** e selecione o `manifest.json` da pasta extraída.

## Por que o SEI Flow?

A extensão original SEI+Trello só sabia **criar** cartões a partir do SEI. O SEI Flow nasceu para resolver isso e modernizar a experiência:

- **Vínculo de mão dupla**: crie um cartão novo **ou vincule um cartão que já existe no Trello** ao processo do SEI.
- **Vários cartões por processo**, empilhados e visíveis de uma vez (sem “existe mais de um cartão” escondido).
- **Edição completa no SEI**: nome, descrição, etiquetas, checklist, prazo, quadro e lista.
- **Vinculação em lote**: selecione vários cartões do Trello e vincule ao processo de uma vez.
- **Compatibilidade ampla**: funciona em qualquer domínio, pasta (`/sei/`, `/sip/`, `/web/sei/`) e versão do SEI (3.x, 4.x e 5.x), com seletores resilientes e fallbacks por texto.
- **Ativação por site**: nada de permissão em todos os sites por padrão. Você autoriza apenas as instalações do SEI que usa — ou opta por todos, se preferir.
- **Interface isolada**: React + Shadow DOM, sem quebrar o CSS do SEI e sem conflito com o tema.
- **Cache local**: menos chamadas à API do Trello e carregamento mais rápido.
- **Acessibilidade**: ações visíveis, navegação por teclado, foco gerenciado e contraste.

## Capturas de tela

<p align="center">
  <img src="docs/screenshots/dashboard.png" width="100%" alt="Painel SEI Flow com métricas, filtros, etiquetas e cartões" />
</p>
<p align="center">
  <img src="docs/screenshots/list.png" width="48%" alt="Lista de processos com cartões do Trello" />
  <img src="docs/screenshots/filter.png" width="48%" alt="Filtros por quadro, lista, etiqueta, prazo e cartão" />
</p>
<p align="center">
  <img src="docs/screenshots/process.png" width="48%" alt="Processo aberto com o painel do SEI Flow" />
  <img src="docs/screenshots/link-dialog.png" width="48%" alt="Vincular cartões existentes em lote" />
</p>
<p align="center">
  <img src="docs/screenshots/create-dialog.png" width="48%" alt="Criar cartão a partir do processo" />
  <img src="docs/screenshots/options.png" width="48%" alt="Página de opções" />
</p>

## Funcionalidades

| Recurso | SEI Flow |
| --- | --- |
| Criar cartão a partir do processo | ✅ |
| Vincular cartão existente do Trello | ✅ |
| Vincular vários cartões de uma vez | ✅ |
| Vincular cartões a vários processos em lote | ✅ |
| Vários cartões por processo | ✅ |
| Editar nome e descrição | ✅ |
| Criar, aplicar e remover etiquetas | ✅ |
| Editar checklist (itens, concluir, remover) | ✅ |
| Definir/remover prazo e conclusão | ✅ |
| Mover cartão entre quadro/lista | ✅ |
| Desvincular sem excluir do Trello | ✅ |
| Excluir cartão do Trello | ✅ |
| Filtros por quadro, lista, etiqueta, prazo e cartão | ✅ |
| Tema claro/escuro (claro padrão) | ✅ |
| Cache e retry/backoff em 429/5xx | ✅ |
| Painel SEI Flow como página inicial da extensão | ✅ |
| Filtros do painel por etiqueta, tipo de processo, prazo, quadro, lista e atualização | ✅ |
| Edição completa dos cartões pelo painel (nome, descrição, etiquetas, checklist, prazo e destino) | ✅ |
| Links dos processos abrem a página correspondente no SEI | ✅ |
| Badge com processos atualizados (não lidos no SEI) | ✅ |
| Atualizações do Trello (7/30 dias e desde a última visita) | ✅ |
| Notificações diárias de prazos | ✅ |
| Barra fixa, atalho de busca e filtros persistidos | ✅ |
| Exportação CSV dos cartões filtrados | ✅ |

## Instalação (desenvolvimento)

Requisitos: **Node.js 22+** e npm.

```bash
npm install
npm run dev
```

O WXT abre o navegador de desenvolvimento. Para carregar manualmente:

```bash
npm run build
```

- **Chrome/Edge**: `chrome://extensions` → Modo desenvolvedor → *Carregar sem compactação* → selecione `.output/chrome-mv3`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Carregar extensão temporária* → selecione `.output/firefox-mv3/manifest.json`.
- **Edge**: `edge://extensions` → Modo desenvolvedor → *Carregar sem compactação* → `.output/edge-mv3`.

### Primeiro uso

1. Clique no ícone da extensão: o **Painel SEI Flow** abre como página inicial.
2. Clique em **Conectar ao Trello** (ou abra **Opções**).
3. Informe a **APP-KEY** do Trello ([trello.com/app-key](https://trello.com/app-key)).
4. Gere e cole o **TOKEN** pelo link exibido na própria página.
5. Clique em **Testar conexão** e salve.
6. Escolha o **quadro** e a **lista** padrão.
7. Em **Sites do SEI**, ative o domínio da sua instituição (ou “todos os sites”).
8. Abra o SEI e recarregue a página.

> **Por que APP-KEY + TOKEN?** O Trello não oferece OAuth 2.0 para extensões sem servidor. O fluxo oficial client-side é a APP-KEY + TOKEN gerado em `trello.com/1/authorize`. A extensão monta essa URL para você e valida a conexão. Não é necessário criar backend nem configurar outro método.

## Como o vínculo funciona

O vínculo é gravado na descrição do cartão como uma linha:

```
SEI 08660.018176/2014-60
```

- É pesquisável no próprio Trello.
- Um cartão pode ter vários vínculos (vários processos).
- O texto existente da descrição é preservado.
- Desvincular remove **apenas** a linha do processo atual; o cartão continua no Trello.
- O vínculo é compatível com cartões criados pela extensão original.

## Privacidade, uso e responsabilidade

- O SEI Flow **não mantém servidor próprio e não salva dados de usuários fora do navegador**.
- APP-KEY, TOKEN e preferências ficam em `chrome.storage.local`, no seu navegador.
- Nenhuma informação de processo ou cartão é enviada ao criador da extensão. As únicas requisições externas vão para `api.trello.com`.
- Os dados de processos e cartões pertencem aos sistemas **SEI** e **Trello**. O uso da extensão é de **responsabilidade exclusiva do usuário**. O criador **não tem ingerência, controle ou responsabilidade** sobre informações inseridas, exibidas ou armazenadas nesses sistemas, nem sobre decisões tomadas a partir delas.
- Leia a [política de privacidade completa](PRIVACY.md).

## Desenvolvimento

### Scripts

```bash
npm run dev            # WXT em modo desenvolvimento (Chrome)
npm run dev:firefox    # WXT em modo desenvolvimento (Firefox)
npm run compile        # TypeScript (tsc --noEmit)
npm run lint           # ESLint
npm run test           # Vitest (unidade + componentes)
npm run test:e2e       # build + Playwright (UI e extensão real)
npm run build          # build Chrome
npm run build:firefox  # build Firefox
npm run build:edge     # build Edge
npm run zip            # pacote Chrome
npm run zip:firefox    # pacote Firefox
npm run zip:edge       # pacote Edge
npm run icons          # regenera os ícones PNG
npm run verify         # compile + lint + test + build
```

### Arquitetura

```
src/
  entrypoints/
    background.ts        # service worker: Trello, cache, ativação, injeção, badge
    dashboard/           # página inicial: métricas, filtros, edição e links do SEI
    options/             # conexão, destino, sites, preferências, diagnóstico
    sei-inject.ts        # script injetado por scripting.executeScript
  core/
    messaging/           # contrato RPC tipado content <-> background
    trello/              # client HTTP, cache, normalização, repositório
    sei/                 # detecção de página, número do processo, linhas, mount
    link/                # marcador SEI <processo>
    storage/             # settings, catálogo de processos e última aba
  ui/
    shadow.ts            # Shadow DOM + CSS compartilhado
    components/          # cartões, diálogos, pickers
    list/                # store e reconciliação da lista de processos
    styles.css           # tema claro/escuro
```

- O **background** concentra a API do Trello e o cache; o content script nunca fala direto com o Trello.
- O script é injetado **apenas** em origens autorizadas, via `scripting.executeScript`.
- A UI é montada em **Shadow DOM**; os diálogos usam um host global em overlay.
- O marcador de vínculo é a fonte de verdade; o cache é descartável.

### Testes

- **Vitest**: marcador, número do processo, detecção do SEI, client HTTP, filtros, catálogo de processos, modelo do painel e componentes.
- **Playwright**: UI injetada em fixtures de SEI 3.x/4.x, extensão real no Chromium (injeção, opções e painel) e painel com dados reais em cache (filtros, etiquetas, links do SEI, edição e badge).

```bash
npm test
npx playwright install chromium   # primeira vez
npm run test:e2e
```

## Publicação

Os passos para Chrome Web Store, Firefox Add-ons e Edge Add-ons estão em [docs/publicacao.md](docs/publicacao.md). Para publicar automaticamente a cada release, veja [docs/store/auto-publish.md](docs/store/auto-publish.md).

```bash
npm run build && npm run zip
npm run build:firefox && npm run zip:firefox
npm run build:edge && npm run zip:edge
```

Os arquivos ficam em `.output/`.

## Roadmap

- **Próximas melhorias**: i18n (pt-BR/en), importação de CSV, modelos de cartão e automações por etiqueta.
- **Melhorias futuras**: suporte a múltiplas contas do Trello e relatórios por tipo de processo.

## Créditos e atribuição

Este projeto é inspirado e compatível com o [SEI+Trello](https://github.com/luiscrjunior/sei-trello), criado por **Luís Carlos Reischak Júnior**, e com o fork comunitário [awlmdnitce/sei-trello](https://github.com/awlmdnitce/sei-trello). O marcador `SEI <processo>` foi mantido para interoperabilidade. Veja [NOTICE](NOTICE) e [CREDITS.md](CREDITS.md).

O SEI Flow é de **uso livre** (MIT), mas quem copiar, modificar ou redistribuir deve **manter os créditos** ao autor original deste projeto, **Engenheiro Leonardo Almeida de Oliveira**, e um link para https://github.com/engleonardo/SEI, além dos créditos do projeto que o inspirou. Os créditos não podem ser removidos de trabalhos derivados.

## Licença

MIT — veja [LICENSE](LICENSE).
