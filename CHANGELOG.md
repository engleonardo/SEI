# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [SemVer](https://semver.org/lang/pt-BR/).

## [1.1.0] - 2026-10-27

Versão final aprovada com o layout A, painel redesenhado e ajustes de usabilidade.

### Adicionado

- Layout A nos cartões da lista: cartão inteiro arredondado, cabeçalho do processo, miolo centralizado, rodapé com ações centralizadas e 14 px de espaço entre processos.
- Usuário atribuído do SEI permanece visível no cabeçalho do processo, como `(leonardo.oliveira.15)`.
- Seletor inline de quadro/lista dentro do cartão, sem popup.
- Botão **Dashboard** no menu lateral das opções.
- Área de descrição com crescimento automático ao editar, mostrando o texto completo.
- Selo **Atualizado** no lugar de "SEI com novidade".
- Painel com visual mais moderno, métricas resumidas e filtros recolhíveis.
- Botão de exportação CSV na barra de busca do painel.
- Testes para seletor inline, descrição ampla e usuário atribuído.

### Alterado

- Página do processo: removida a barra de filtros do topo, removidos "SEI Flow" e a contagem de cartões, e painel ampliado para a largura da página.
- Cartões compactos com descrição em até 3 linhas e chips de prazo menores.
- Rodapé dos cartões com Etiquetas, Checklist, Prazo e Mover centralizados; desvincular/excluir à direita.
- Título do painel sem degradê.
- Travessões substituídos por hífen nos textos.
- Correção de mensagem quando o contexto da extensão é invalidado: agora orienta recarregar a página do SEI.

## [1.0.0] - 2026-10-27

Primeira versão estável preparada para publicação na Chrome Web Store.

### Adicionado

- **Painel SEI Flow como página inicial da extensão**, aberto pelo ícone da barra do navegador.
- Métricas de atrasados, vencendo hoje, próximos 7 dias, sem prazo, concluídos, atualizados nos últimos 7 dias, processos com novidade no SEI e total vinculado.
- Filtros do painel por busca, quadro, lista, tipo de processo, etiqueta, prazo, atualização no Trello e atualização no SEI.
- Agrupamento por prazo, quadro, lista, tipo de processo, etiqueta ou lista única, com ordenação configurável.
- Detalhes e edição completa dos cartões pelo painel (nome, descrição, etiquetas, checklist, prazo, quadro/lista, desvincular e excluir).
- Links dos processos no painel abrem a página correspondente do SEI.
- Catálogo local de processos com tipo, especificação, URL, origem e indicador de novidade.
- Filtro de atualizações no Trello (hoje, 7 dias, 30 dias e desde a última visita).
- Exportação CSV dos cartões filtrados.
- Notificações diárias de prazos e alarme periódico de verificação.
- Badge com a quantidade de **processos atualizados (não lidos) no SEI**.
- Ação em lote para vincular cartões a vários processos de uma vez.
- Barra de ferramentas fixa (sticky) em listas longas.
- Persistência dos filtros durante a sessão da aba.
- Atalhos `/` e `Ctrl+K`/`Cmd+K` para focar a busca.
- Renderização sob demanda dos cartões visíveis (IntersectionObserver).
- Envio automático para Chrome Web Store e AMO quando os segredos estiverem configurados.
- Documentação de publicação, loja e auto-publicação em `docs/store/`.
- Arquivo `CREDITS.md` e exigência de manutenção de créditos em cópias/derivados.
- Política de segurança e automações de segurança no GitHub.

### Alterado

- Versão estável 1.0.0.
- O popup foi removido; o painel é a página inicial e concentra ativação, status e cartões.
- Barra do SEI apenas com o logo, sem contagem de cartões ou horário.
- Cartões da lista ficam anexados à linha do processo, centralizados e com destaque vermelho para processos não lidos.
- Etiquetas usam as 30 cores oficiais do Trello (incluindo `_dark` e `_light`), com busca da cor real no quadro.
- Créditos atualizados para **Engenheiro Leonardo Almeida de Oliveira**.
- Links para GitHub ficaram restritos à seção **Diagnóstico** das opções, para suporte e relato de bugs.
- README e NOTICE mantêm os créditos do projeto inspirador e exigem crédito ao autor deste projeto em trabalhos derivados.

## [0.1.2] - 2026-10-26

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

## [0.1.1] - 2026-10-26

### Alterado

- Incorporada a logo oficial fornecida pelo projeto em `docs/brand/sei-flow.svg`.
- Ícones 16/32/48/128 e favicon regenerados a partir da logo oficial.
- `BrandMark` agora usa o ícone oficial via `runtime.getURL` e `web_accessible_resources`.
- Versão do pacote atualizada para 0.1.1.

## [0.1.0] - 2026-10-26

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
