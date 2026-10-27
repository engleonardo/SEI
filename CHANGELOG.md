# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] — 2026-10-27

Primeira versão estável preparada para publicação na Chrome Web Store.

### Adicionado

- Dashboard de prazos com resumo de atrasados, vencendo hoje, próximos 7 dias, sem prazo e total.
- Filtros de busca, quadro e somente atrasados no dashboard.
- Notificações diárias de prazos e badge com contagem de atrasados/vencendo hoje.
- Alarm periódico de verificação de prazos.
- Ação em lote para vincular cartões a vários processos de uma vez.
- Barra de ferramentas fixa (sticky) em listas longas.
- Persistência dos filtros durante a sessão da aba.
- Atalhos `/` e `Ctrl+K`/`Cmd+K` para focar a busca.
- Renderização sob demanda dos cartões visíveis (IntersectionObserver).
- Documentação de publicação e arquivos de loja em `docs/store/`.
- Arquivo `CREDITS.md` e exigência de manutenção de créditos em cópias/derivados.
- Política de segurança e automações de segurança no GitHub.

### Alterado

- Versão estável 1.0.0.
- Página de opções inclui a preferência de notificações.
- Dashboard acessível pelo popup, barra do SEI e opções.
- README e NOTICE mantêm os créditos do projeto inspirador e exigem crédito ao autor deste projeto em trabalhos derivados.

## [0.1.2] — 2026-10-26

### Adicionado

- Filtros hierárquicos: primeiro o quadro, depois a lista, sem misturar as opções.
- Filtros de data de entrega: em aberto, atrasados, concluídos e sem prazo.
- Filtros de processos: com cartão e sem cartão.
- Chips de filtros ativos na barra de ferramentas, com botão de limpar.
- Destaque com contorno vermelho para cartões de processos com informação nova/não lidos.
- Aviso de privacidade e responsabilidade nas opções, README, PRIVACY e NOTICE.

### Alterado

- Tema claro agora é o padrão para todos; preferências antigas em “automático” migram para claro.
- Cartões da lista ficaram compactos, com fundo cinza, sombra e aparência anexada ao processo.
- Botão de ação do processo agora é apenas um ícone discreto, com contador quando há cartões.
- Etiquetas do filtro usam as cores reais do Trello.
- Busca e filtros foram alinhados à esquerda na barra de ferramentas.
- Corrigido o foco do campo de busca no modal de filtros (não pula mais para o “X” a cada letra).
- Logo atualizada para usar melhor a área útil do ícone.
- Página de opções sempre em tema claro, independentemente do sistema.
- Cartão usa sombra mais suave e contorno vermelho apenas quando há novidade.

## [0.1.1] — 2026-10-26

### Alterado

- Incorporada a logo oficial fornecida pelo projeto em `docs/brand/sei-flow.svg`.
- Ícones 16/32/48/128 e favicon regenerados a partir da logo oficial.
- `BrandMark` agora usa o ícone oficial via `runtime.getURL` e `web_accessible_resources`.
- Versão do pacote atualizada para 0.1.1.

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
