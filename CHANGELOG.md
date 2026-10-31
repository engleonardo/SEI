# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Corrigido

- No tema escuro, o SEI continua claro: apenas os cartões e a interface do SEI Flow ficam escuros. A linha do processo e o restante da página não são mais alterados.
- A faixa da tabela ao redor do cartão também permanece clara; só o cartão em si fica escuro.
- O tema não é mais aplicado ao documento das páginas do SEI; ele fica restrito ao Shadow DOM da extensão.
- Alternar o tema com uma página do SEI aberta atualiza os cartões sem recarregar.
- O manifest do Firefox declara suporte mínimo separado para Android (142+), removendo o aviso da AMO sobre `data_collection_permissions`.

## [1.3.0] - 2026-10-30

### Adicionado

- **Modo escuro** no painel e nas opções, com alternância instantânea e preferência sincronizada entre abas e painéis abertos no SEI.
- Filtro **Sem vínculo** no painel para ver cartões do quadro que ainda não estão vinculados a processos do SEI.
- Botão **Novo cartão** no painel para criar cartões no Trello sem abrir o Trello (com etiquetas, quadro/lista e datas).
- **Vincular cartões desvinculados** (Opções -> Diagnóstico): procura cartões sem vínculo que citam um número de processo SEI, mostra os candidatos e vincula somente após confirmação, sem alterar o comentário.
- **Exportar regras** na aba Regras, com opção de copiar o JSON ou baixar um arquivo.
- **Importar regras** na aba Regras, colando o JSON ou selecionando um arquivo, com opção de adicionar às regras atuais ou substituir todas.
- **Ativação automática de sites que começam com “sei”** nas Opções, cobrindo endereços como `sei.ufsc.br` sem cadastrar um por um.

### Alterado

- Listas do painel aparecem em cartões grandes, no mesmo estilo dos indicadores de prazo, com a contagem de cartões por lista.
- O seletor de **Quadro** ficou visível na barra de busca do painel (e continua nos filtros).
- **Todas as listas** e **Sem vínculo** saíram do meio das listas e ficaram como controles discretos no cabeçalho da seção.
- Listas do painel (chips e filtro) seguem a **ordem do Trello**.
- A ordenação **Por lista** no painel agora segue exatamente a posição das listas no Trello e passou a ser a ordenação padrão.
- O cartão **Total vinculado** mostra o total do quadro selecionado e o nome do quadro (ou "Todos os quadros"); clicar nele limpa os filtros sem sair do quadro.
- **Limpar filtros** mantém o quadro atual; para ver todos os quadros, use o seletor de quadro.
- No modo escuro, listas suspensas nativas, barras de rolagem e campos de arquivo também seguem o tema.
- Clicar em **Todas as listas** também remove o filtro **Sem vínculo**.
- Indicadores de prazo e atalhos do painel alternam o filtro ao clicar de novo, e cada filtro ativo pode ser removido individualmente.
- Regras ganharam botão **Salvar regras** com indicação de salvamento automático.
- Diagnóstico usa seções recolhíveis; **Links úteis** passou para o rodapé de todas as páginas de opções.
- A aba **Destino** agora se chama **Destino principal**.
- O campo de site do SEI aceita o endereço sem `https://`.

### Corrigido

- Respostas de filtros anteriores não sobrescrevem mais a lista atual do painel.
- Ao criar um cartão sem vínculo em outro quadro, o painel acompanha o quadro do cartão criado.
- Cartões criados pela extensão disparam as regras de entrada em lista.

Versões anteriores: consulte as releases em https://github.com/engleonardo/SEI/releases.

