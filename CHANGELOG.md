# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [SemVer](https://semver.org/lang/pt-BR/).

## [1.5.3] - 2026-11-09

### Corrigido

- **Firefox 115 ESR**: o mínimo do desktop passou de 140 para **115.0** (Android continua 142+), removendo o aviso de incompatibilidade.
- O selo vermelho **Atualizado** (novidade do processo no SEI) agora é limpo quando o processo é aberto, quando o cartão é concluído e também ao clicar no próprio selo.
- A regra **Quando o processo SEI for atualizado** passou a ler o estado atual dos cartões, evitando usar cache antigo na condição de lista.
- Quando uma regra move para uma lista **e** para o topo ao mesmo tempo, o cartão agora vai para o topo da lista de destino (antes ia para o fim).

### Alterado

- O selo **Atualizado** virou um botão **Marcar processo como lido**.

## [1.5.2] - 2026-11-07

### Adicionado

- Botão **Excluir cartão** no painel, com confirmação antes de enviar o cartão para a lixeira do Trello.
- O diálogo **Prazo** agora edita **início e vencimento**, com validação e botão **Limpar datas**.
- Pacote com locale **pt_BR** (`_locales/pt_BR/messages.json` e `default_locale: pt_BR`), com nome e descrição do manifest em português.

### Alterado

- O painel agora carrega somente o **quadro selecionado** ao abrir/atualizar, em vez de buscar todos os cartões vinculados de todos os quadros. Isso reduz bastante o tempo de sincronização em quadros secundários.
- Na primeira carga, o painel usa direto o quadro padrão, evitando uma busca global desnecessária antes de aplicar o filtro.
- Os textos de exclusão no SEI e no painel agora informam que o cartão vai para a lixeira do Trello, em vez de dizer que é removido permanentemente.

## [1.5.1] - 2026-11-03

### Corrigido

- As regras são reconciliadas também ao abrir o quadro (filtro **Sem vínculo**), e não apenas ao carregar a lista de cartões vinculados.
- Cartões criados ou movidos fora da extensão, em um quadro já sincronizado, passam a ser tratados como **entrada na lista atual** na próxima atualização.
- Cartões sem vínculo agora podem ser alvo de regras quando a opção **Aplicar somente a cartões vinculados ao SEI** é desmarcada.
- Cartões criados pela extensão sem vínculo e alterações feitas pela extensão em cartões sem vínculo também passam pelas regras.
- O tema **automático** é preservado ao importar um backup (antes era convertido em claro).
- O cache e o snapshot de sincronização são limpos após importar configurações, evitando estado antigo de outro quadro/conta.

### Adicionado

- Opção por regra para incluir cartões sem vínculo com o SEI.
- Setas para cima/baixo no cabeçalho de cada regra para reordenar; a ordem define a sequência de execução.
- Nova aba **Backup** nas opções para exportar e importar configurações gerais, regras e preferências, com resumo antes da importação, opção de incluir/importar regras e de incluir credenciais do Trello.
- Botão para **duplicar regra** (a cópia nasce desativada).
- Aviso na tela de que as regras são avaliadas na próxima atualização do painel, do quadro ou da lista do SEI.

### Notas

- Na primeira atualização após esta versão, o estado do quadro é apenas registrado. Para aplicar uma regra aos cartões que já existem, use **Aplicar agora**.

## [1.5.0] - 2026-11-03

### Adicionado

- Novo gatilho de regra **Ao criar o cartão**, disparado quando o cartão é criado pela extensão (pelo SEI ou pelo painel).
- Novas ações de regra: **definir data de início**, **definir data de término** (hoje, em N dias ou há N dias), **limpar início e término**, **adicionar comentário**, **marcar como concluído** e **reabrir cartão**.
- Comentários de regra aceitam os marcadores `{processo}`, `{cartao}`, `{data}`, `{hora}`, `{lista}`, `{quadro}` e `{regra}`.
- **Desfazer** a última aplicação agora reverte datas e conclusão e remove os comentários criados pela regra.
- Seis modelos de regra iniciais para novas instalações, incluindo datas ao criar e comentário ao concluir.
- Script `npm run check:package` e comando `npm run unpacked` para detectar e remover nomes reservados pelo Chrome (`_metadata`/`__MACOSX`).

### Alterado

- O **Aplicar agora** ignora cartões que já estão com as datas e a conclusão definidas pela regra.
- Regras de criação não entram no **Aplicar agora**, porque não têm condição retroativa.
- Documentação de instalação no Chrome com a explicação do erro `_metadata`.

### Segurança

- Números de processo reais e o usuário de exemplo do SEI foram substituídos por dados fictícios nos fixtures, testes, documentação e capturas de tela.
- Capturas da loja regeneradas sem dados da organização.

## [1.4.0] - 2026-11-02

### Adicionado

- O painel se atualiza sozinho ao voltar para a aba/janela e quando o SEI sinaliza que os dados mudaram, sem polling contínuo. O botão **Atualizar** continua disponível.
- Botões **SEI** e **Trello** no cabeçalho do painel para abrir os dois sistemas diretamente.
- Ao clicar em **Concluir**, o cartão grava no prazo do Trello a data e hora do clique. Ao reabrir, o prazo é limpo para o cartão não aparecer atrasado.

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
