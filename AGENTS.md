# AGENTS.md

Guia para agentes e pessoas que forem manter o SEI Flow.

## Visão geral

Extensão WXT + React 19 + TypeScript que integra o Trello ao SEI. A UI é injetada em Shadow DOM por um script não listado (`sei-inject.js`), executado via `scripting.executeScript` apenas em origens autorizadas. O background concentra a API do Trello e o cache.

## Comandos

```bash
npm install          # instala e roda wxt prepare
npm run dev          # dev Chrome
npm run dev:firefox  # dev Firefox
npm run compile      # tsc --noEmit
npm run lint         # ESLint
npm run test         # Vitest
npm run test:e2e     # build + Playwright
npm run build        # Chrome
npm run build:firefox
npm run build:edge
npm run zip / zip:firefox / zip:edge
npm run verify       # compile + lint + test + build
```

Antes de concluir qualquer mudança, rode `npm run verify`. Para mudanças de UI/injeção, rode também `npm run test:e2e`.

## Estrutura

- `src/entrypoints/background.ts`: service worker, mensagens, ativação e injeção.
- `src/entrypoints/sei-inject.ts`: script não listado injetado nas páginas.
- `src/entrypoints/dashboard/`: página inicial com métricas, filtros, edição e links do SEI.
- `src/entrypoints/options/`: conexão, destino, sites, preferências e diagnóstico.
- `src/core/trello/`: client HTTP, cache, normalização e repositório.
- `src/core/sei/`: detecção de página, número do processo, linhas e mount.
- `src/core/storage/processes.ts`: catálogo de processos (tipo, especificação, URL e novidade).
- `src/core/link/marker.ts`: fonte de verdade do vínculo `SEI <processo>`.
- `src/ui/`: componentes React, Shadow DOM, estilos e store da lista.

## Convenções

- TypeScript estrito; evite `any` (o lint avisa).
- UI sempre dentro de Shadow DOM; não injete CSS global no SEI.
- Não use `alert`, `confirm` ou `prompt` nativos; use `Modal`/`ConfirmDialog` e toasts.
- Mantenha textos de interface em português (pt-BR), com tom direto.
- Todo acesso ao Trello passa pelo background; content script não faz `fetch` direto.
- Preserve o marcador `SEI <processo>` para compatibilidade com o projeto original.
- Não logue tokens nem URLs completas da API.
- Novas permissões exigem justificativa na documentação de publicação e revisão do manifest.
- Componentes e funções devem ter uma responsabilidade clara; prefira arquivos focados.

## Testes

- Unidade: `src/**/*.test.ts` (Vitest + jsdom).
- Fixtures do SEI: `src/test/fixtures/`.
- E2E: `e2e/ui.spec.ts` (UI real com mock de extensão) e `e2e/extension.spec.ts` (extensão carregada no Chromium).
- Ao alterar seletores do SEI, adicione/ajuste fixtures e testes.

## Publicação

- A versão vem de `package.json`; o WXT gera o manifest.
- Zips em `.output/` após `npm run zip*`.
- CI em `.github/workflows/ci.yml`; release por tag `v*` em `release.yml`.
- Envio automático à Chrome Web Store/AMO em `publish-store.yml` quando os segredos existirem.
- Passos de loja, justificativa de permissões e auto-publicação em `docs/publicacao.md` e `docs/store/`.

## Git

- Commits Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Não commite `node_modules`, `.output`, `.wxt`, zips, traces ou segredos.
