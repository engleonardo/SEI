# SEI Flow - listagem para a Chrome Web Store

## Nome

SEI Flow

## Resumo (até 132 caracteres)

Crie, vincule e edite cartões do Trello no SEI. Painel com regras, prazos, etiquetas, modo escuro e atualizações.

## Descrição completa

```
O SEI Flow conecta o Trello ao SEI (Sistema Eletrônico de Informações) para você trabalhar sem alternar de aba.

• Crie cartões no Trello a partir de um processo do SEI, escolhendo etiquetas, quadro, lista, início e término.
• Crie cartões também pelo painel, sem abrir o Trello.
• Vincule cartões que já existem no Trello a um ou vários processos - inclusive em lote.
• Encontre cartões sem vínculo que já citam o número do processo no comentário e vincule com confirmação, sem alterar o texto do cartão.
• Veja todos os cartões de um processo, sem esconder os adicionais.
• Edite nome, descrição, etiquetas, checklist, prazo, quadro e lista dentro do SEI.
• Conclua ou reabra o cartão com um clique, sem exigir prazo.
• Regras automáticas por quadro: ao concluir, ao entrar em uma lista, ao entrar em qualquer lista e quando o processo do SEI recebe novidade.
• Várias ações por regra (mover, mover para o topo, adicionar ou remover etiqueta), execução em cadeia, contador de aplicações, "Aplicar agora" com confirmação e "Desfazer" a última aplicação.
• Importe e exporte regras em JSON, copiando o conteúdo ou usando um arquivo.
• Sincronização nos dois sentidos: ao atualizar, o Trello é relido e as regras reagem também às mudanças feitas fora da extensão.
• Painel SEI Flow como página inicial, com métricas, total do quadro, busca e ordenação por lista, prazo, nome, etiqueta ou tipo de processo.
• As listas aparecem na mesma ordem do Trello, com contagem de cartões.
• Filtre por etiqueta (inclusive clicando na etiqueta do cartão), tipo de processo, prazo, quadro, lista, vínculo com o SEI, atualização no Trello e atualização no SEI.
• Filtro "Sem vínculo" para localizar cartões que ainda não estão ligados a um processo.
• Edite o cartão direto no painel, sem abrir outra tela.
• Clique no número do processo para abrir a página correspondente no SEI.
• Notificações diárias de prazos.
• Desvincule sem excluir o cartão do Trello.
• Exporte os cartões filtrados em CSV.
• Modo escuro no painel, nas opções e nos painéis dentro do SEI, com alternância a qualquer momento e sincronização entre abas.
• Funciona em qualquer domínio e versão do SEI (3.x, 4.x e 5.x).
• Ative apenas os sites que você usa, com opção de ativar automaticamente endereços que começam com "sei"; sem permissão global obrigatória.
• Backup das configurações e regras para levar a outro computador.

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
- **`alarms`**: verificar periodicamente prazos e processos atualizados para manter as notificações.
- **`notifications`**: avisar o usuário, uma vez por dia, sobre cartões atrasados ou vencendo hoje.
- **`https://api.trello.com/*`**: ler e gravar cartões, etiquetas, checklists e prazos na conta do próprio usuário.
- **Permissão opcional de host (`*://*/*`)**: ativar o SEI Flow em instalações do SEI de qualquer órgão/domínio. É solicitada em tempo de execução, por gesto do usuário; o script encerra sem alterar páginas que não sejam do SEI. A mesma permissão permite a opção de ativar automaticamente apenas endereços cujo host começa com "sei".

## Práticas de dados (Chrome Web Store)

- O SEI Flow não envia dados ao desenvolvedor e não mantém servidor próprio.
- Credenciais e preferências ficam em `chrome.storage.local`.
- Para funcionar, as credenciais e os dados dos cartões são processados no navegador e transmitidos apenas à API do Trello, por ação do usuário.
- Não há analytics, anúncios, venda ou compartilhamento de dados.
- O uso é de responsabilidade exclusiva do usuário; o criador não tem ingerência sobre informações do SEI/Trello.

## Screenshots

Os arquivos estão em `docs/store/screenshots-1280x800/` (gerados por `node scripts/store-screenshots.mjs`). A Chrome Web Store aceita até 5 imagens; a ordem recomendada é:

1. `dashboard-1280x800.png` - painel inicial com métricas, total do quadro, listas na ordem do Trello e ordenação por lista.
2. `dashboard-dark-1280x800.png` - o mesmo painel no modo escuro.
3. `process-1280x800.png` - processo aberto com cartões, caminho do quadro/lista e ações.
4. `rules-1280x800.png` - regras automáticas com contador, aplicar agora e desfazer.
5. `list-1280x800.png` - cartões anexados à lista de processos, com etiquetas e destaque de novidade.

Imagens adicionais para documentação: `rules-dark-1280x800.png`, `filter-1280x800.png`, `create-dialog-1280x800.png`, `bulk-1280x800.png`, `link-dialog-1280x800.png` e `options-1280x800.png`.

Para regerar: `npm run build` e depois `node scripts/store-screenshots.mjs`. As capturas usam dados fictícios.

## Banner promocional

`docs/store/banner-440x280.png`
