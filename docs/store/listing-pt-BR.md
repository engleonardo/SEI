# SEI Flow - listagem para a Chrome Web Store

## Nome

SEI Flow

## Resumo (até 132 caracteres)

Crie, vincule e edite cartões do Trello no SEI. Painel com regras, prazos, etiquetas e atualizações.

## Descrição completa

```
O SEI Flow conecta o Trello ao SEI (Sistema Eletrônico de Informações) para você trabalhar sem alternar de aba.

• Crie cartões no Trello a partir de um processo do SEI, escolhendo etiquetas, quadro, lista, início e término.
• Vincule cartões que já existem no Trello a um ou vários processos - inclusive em lote.
• Veja todos os cartões de um processo, sem esconder os adicionais.
• Edite nome, descrição, etiquetas, checklist, prazo, quadro e lista dentro do SEI.
• Conclua ou reabra o cartão com um clique, sem exigir prazo.
• Regras automáticas por quadro: ao concluir, ao entrar em uma lista, ao entrar em qualquer lista e quando o processo do SEI recebe novidade.
• Várias ações por regra (mover, mover para o topo, adicionar ou remover etiqueta), execução em cadeia, contador de aplicações, "Aplicar agora" com confirmação e "Desfazer" a última aplicação.
• Sincronização nos dois sentidos: ao atualizar, o Trello é relido e as regras reagem também às mudanças feitas fora da extensão.
• Painel SEI Flow como página inicial, com métricas, chips de lista com contagem, busca e ordenação por prazo, nome, lista, etiqueta ou tipo de processo.
• Filtre por etiqueta (inclusive clicando na etiqueta do cartão), tipo de processo, prazo, quadro, lista, atualização no Trello e atualização no SEI.
• Edite o cartão direto no painel, sem abrir outra tela.
• Clique no número do processo para abrir a página correspondente no SEI.
• Notificações diárias de prazos e badge com processos atualizados no SEI.
• Desvincule sem excluir o cartão do Trello.
• Exporte os cartões filtrados em CSV.
• Funciona em qualquer domínio e versão do SEI (3.x, 4.x e 5.x).
• Ative apenas os sites que você usa; sem permissão global obrigatória.
• Tema claro (padrão) ou escuro, com interface isolada do CSS do SEI.

Privacidade: sem servidor próprio, sem telemetria e sem anúncios. As credenciais do Trello ficam apenas no seu navegador. O SEI Flow não salva dados de usuários fora do navegador. O uso é de responsabilidade exclusiva do usuário; o criador não tem ingerência sobre informações do SEI ou do Trello.

Desenvolvido por Engenheiro Leonardo Almeida de Oliveira.

Saiba mais: https://github.com/engleonardo/SEI/blob/main/PRIVACY.md
```

## Categoria

Productivity

## Idioma

Português (Brasil)

## URLs

- Página inicial: https://github.com/engleonardo/SEI
- Suporte: https://github.com/engleonardo/SEI/issues
- Política de privacidade: https://github.com/engleonardo/SEI/blob/main/PRIVACY.md

## Single purpose

Integrar cartões do Trello a processos do SEI, permitindo criar, vincular, visualizar, editar e automatizar cartões sem sair do SEI.

## Justificativa de permissões

- **`storage`**: salvar localmente a APP-KEY/TOKEN do Trello, preferências, sites autorizados e cache de cartões. Nenhum dado é enviado ao criador.
- **`scripting`**: injetar a interface do SEI Flow nas páginas do SEI que o usuário autorizou.
- **`activeTab`**: identificar a aba atual quando o usuário clica no ícone, para oferecer a ativação do site correto no painel inicial.
- **`alarms`**: verificar periodicamente prazos e processos atualizados para manter badge e notificações.
- **`notifications`**: avisar o usuário, uma vez por dia, sobre cartões atrasados ou vencendo hoje.
- **`https://api.trello.com/*`**: ler e gravar cartões, etiquetas, checklists e prazos na conta do próprio usuário.
- **Permissão opcional de host (`*://*/*`)**: ativar o SEI Flow em instalações do SEI de qualquer órgão/domínio. É solicitada em tempo de execução, por gesto do usuário; o script encerra sem alterar páginas que não sejam do SEI.

## Práticas de dados (Chrome Web Store)

- O SEI Flow não envia dados ao desenvolvedor e não mantém servidor próprio.
- Credenciais e preferências ficam em `chrome.storage.local`.
- Para funcionar, as credenciais e os dados dos cartões são processados no navegador e transmitidos apenas à API do Trello, por ação do usuário.
- Não há analytics, anúncios, venda ou compartilhamento de dados.
- O uso é de responsabilidade exclusiva do usuário; o criador não tem ingerência sobre informações do SEI/Trello.

## Screenshots

Os arquivos estão em `docs/store/screenshots-1280x800/` (gerados por `node scripts/store-screenshots.mjs`). A Chrome Web Store aceita até 5 imagens; a ordem recomendada é:

1. `dashboard-1280x800.png` - painel inicial com métricas, chips de lista e ordenação.
2. `process-1280x800.png` - processo aberto com cartões, caminho do quadro/lista e ações.
3. `rules-1280x800.png` - regras automáticas com contador e desfazer.
4. `list-1280x800.png` - cartões anexados à lista de processos, com etiquetas e destaque de novidade.
5. `create-dialog-1280x800.png` - criação de cartão com etiquetas, quadro/lista e datas.

Imagens adicionais para documentação: `filter-1280x800.png`, `bulk-1280x800.png`, `link-dialog-1280x800.png` e `options-1280x800.png`.

Para regerar: `npm run build` e depois `node scripts/store-screenshots.mjs`. As capturas usam dados fictícios.

## Banner promocional

`docs/store/banner-440x280.png`
