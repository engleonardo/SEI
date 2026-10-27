# SEI Flow - listagem para a Chrome Web Store

## Nome

SEI Flow

## Resumo (até 132 caracteres)

Crie, vincule e edite cartões do Trello no SEI. Painel com prazos, etiquetas, tipos de processo e atualizações.

## Descrição completa

```
O SEI Flow conecta o Trello ao SEI (Sistema Eletrônico de Informações) para você trabalhar sem alternar de aba.

• Crie cartões no Trello a partir de um processo do SEI.
• Vincule cartões que já existem no Trello a um ou vários processos - inclusive em lote.
• Veja todos os cartões de um processo, sem esconder os adicionais.
• Edite nome, descrição, etiquetas, checklist, prazo, quadro e lista dentro do SEI.
• Painel SEI Flow como página inicial: prazos, etiquetas, tipos de processo e atualizações.
• Filtre por etiqueta, tipo de processo, prazo, quadro, lista, atualização no Trello e atualização no SEI.
• Abra os detalhes e edite o cartão completo pelo painel.
• Clique no número do processo para abrir a página correspondente no SEI.
• Notificações diárias de prazos e badge com processos atualizados no SEI.
• Desvincule sem excluir o cartão do Trello.
• Filtre a lista de processos por quadro, lista, etiqueta, prazo e situação do cartão.
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

Integrar cartões do Trello a processos do SEI, permitindo criar, vincular, visualizar e editar cartões sem sair do SEI.

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

Os arquivos estão em `docs/store/screenshots-1280x800/`. A Chrome Web Store aceita até 5 imagens; a ordem recomendada é:

1. `dashboard-1280x800.png` - painel inicial com métricas e filtros.
2. `list-1280x800.png` - cartões anexados à lista de processos.
3. `filter-1280x800.png` - filtros por quadro, lista, etiqueta e prazo.
4. `process-1280x800.png` - processo aberto com o painel completo.
5. `bulk-1280x800.png` - vinculação em lote entre processos.

Imagens adicionais para documentação: `link-dialog-1280x800.png`, `create-dialog-1280x800.png` e `options-1280x800.png`.

## Banner promocional

`docs/store/banner-440x280.png`
