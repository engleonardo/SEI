# SEI Flow — Plano de Implementação (Fase 1)

> **Para agentes:** use `superpowers:executing-plans` ou `superpowers:subagent-driven-development`. Passos com checkbox.

**Goal:** entregar a Fase 1 funcional da extensão SEI Flow para Chrome/Firefox/Edge.

**Architecture:** WXT + React 19 + TypeScript. Script não listado `sei-inject.js` injetado por `scripting.executeScript` em origens ativadas. Background centraliza API do Trello, cache e vínculos. UI em Shadow DOM.

**Tech Stack:** WXT 0.21, React 19, TypeScript 5.9, Vitest 5, Testing Library, Playwright (smoke), GitHub Actions.

---

## Task 1 — Scaffold e tooling

**Files:** `package.json`, `wxt.config.ts`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.prettierrc.json`, `.gitignore`, `scripts/generate-icons.mjs`, `public/icon-*.png`

- [x] Criar configurações base.
- [x] Gerar ícones 16/32/48/128.
- [x] Rodar `npm install`.
- [x] Rodar `npm run compile` para validar o setup.

## Task 2 — Domínio, marcador e detecção do SEI

**Files:** `src/core/domain/types.ts`, `src/core/link/marker.ts`, `src/core/sei/process-number.ts`, `src/core/sei/detect.ts`, `src/core/sei/rows.ts`, fixtures e testes.

- [x] Implementar `parseLinks`, `addLink`, `removeLink`, `stripLinks`, `sameLink`.
- [x] Implementar extração de número (scripts, seletores, regex).
- [x] Implementar detecção de página e linhas da lista.
- [x] Cobrir com testes e fixtures v3/v4/v5.

## Task 3 — Background: settings, Trello, cache, ativação

**Files:** `src/core/storage/settings.ts`, `src/core/trello/client.ts`, `src/core/trello/cache.ts`, `src/core/trello/repository.ts`, `src/core/messaging/contract.ts`, `src/entrypoints/background.ts`.

- [x] Settings tipadas em `storage.local` + migração leve do legado.
- [x] Client HTTP com URL/body corretos, erros tipados, retry/backoff e coalescência.
- [x] Cache com TTL e invalidação.
- [x] Repositório: boards, lists, cards, search, create/update/delete, labels, checklists, vínculos em lote.
- [x] Registro de origens ativadas, injeção via `scripting.executeScript`, `tabs.onUpdated`.
- [x] Handler de mensagens com envelope `{ok,data|error}`.

## Task 4 — UI base

**Files:** `src/ui/shadow.ts`, `src/ui/styles.css`, `src/ui/icons.tsx`, `src/ui/components/*`, `src/ui/store.ts`, `src/ui/toast.ts`.

- [x] Hosts com Shadow DOM + CSS compartilhado.
- [x] Store externa com `useSyncExternalStore`.
- [x] Componentes: botão, modal, toast, campos inline, etiquetas, prazo, checklist, localização, cartão, pilha, diálogo de vínculo, diálogo de criação, barra de filtros.
- [x] Tema claro/escuro e acessibilidade básica (foco, Esc, aria).

## Task 5 — Injeção no SEI

**Files:** `src/entrypoints/sei-inject.ts`, `src/core/sei/mount.ts`, `src/core/sei/controller.ts`.

- [x] Detectar página e montar painel do processo / lista.
- [x] Inserir linha de cartões após cada processo e botão de ação.
- [x] Toolbar de filtros na barra de comandos.
- [x] MutationObserver + reconciliação idempotente + troca de URL.
- [x] Fluxos criar, vincular (lote), desvincular, editar, excluir, refresh.

## Task 6 — Popup e opções

**Files:** `src/entrypoints/popup/*`, `src/entrypoints/options/*`, `src/ui/options/*`.

- [x] Popup: detectar SEI, ativar neste site/todos, status de conexão, abrir opções.
- [x] Opções: conexão, testar, quadro/lista em dropdown, sites ativados, preferências, diagnóstico, limpar cache.
- [x] Permissões opcionais solicitadas por gesto do usuário.
- [x] Onboarding no install.

## Task 7 — Testes e verificação

**Files:** `src/test/setup.ts`, `src/test/fixtures/*`, testes unitários/componentes, `playwright.config.ts`, `e2e/options.spec.ts`.

- [x] Testes unitários de marcador, número, detecção, client, cache.
- [x] Testes de componentes críticos.
- [x] `npm run compile`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:firefox`.
- [x] Smoke test Playwright (opcional, documentado).

## Task 8 — Publicação

**Files:** `README.md`, `PRIVACY.md`, `NOTICE`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `AGENTS.md`.

- [x] Documentação de uso, desenvolvimento e arquitetura.
- [x] Política de privacidade e créditos.
- [x] CI e release com artefatos.
- [x] Instruções de carregamento e publicação nas lojas.
- [x] Commit e push no repositório `engleonardo/SEI`.
