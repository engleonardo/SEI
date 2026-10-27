# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] — 2026-10-26

### Adicionado

- Base moderna com WXT, Vite, React 19 e TypeScript.
- Injeção do SEI Flow por origem autorizada, sem `content_scripts` globais no manifest.
- Detecção de páginas do SEI 3.x/4.x/5.x com fallbacks para número do processo e linhas da lista.
- Painel no processo aberto e cartões compactos na lista de processos.
- Criação de cartões no Trello a partir do SEI.
- Vinculação de cartões existentes do Trello a um processo, com seleção múltipla.
- Edição de nome, descrição, etiquetas, checklist, prazo, quadro e lista.
- Desvinculação sem excluir o cartão e exclusão definitiva no Trello.
- Filtros por busca, sem cartão, atrasados, com prazo, etiqueta e quadro/lista.
- Cache local com TTL, coalescência de requisições e retry/backoff em 429/5xx.
- Popup de ativação, opções completas e diagnóstico.
- Tema claro/escuro em Shadow DOM.
- Testes unitários/componentes (Vitest) e testes de UI/extensão (Playwright).
- CI e release automatizados, política de privacidade e guia de publicação.
- Compatibilidade com o marcador legado `SEI <processo>` da extensão original.

### Limitações conhecidas

- Dashboard de prazos, notificações e badge ficam para a Fase 2.
- Ações em lote entre vários processos ficam para a Fase 3.
- A busca do Trello pode ter atraso de indexação; o cache do quadro padrão cobre os cartões recém-criados.
