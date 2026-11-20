# Chrome Web Store - atualização 1.6.0

> Situação: a 1.5.5 está publicada; o pacote 1.6.0 foi **enviado**, mas a publicação foi recusada pelo Developer Dashboard.
> O motivo mais comum é a justificativa de permissão de host incompleta (a nova permissão `identity` e o host `https://auth.atlassian.com/*`).
> Não é preciso reenviar o zip se o pacote 1.6.0 já aparece em **Pacote**.

## 1. Corrigir a página Privacidade

Abra o item **SEI Flow** no [Developer Dashboard](https://chrome.google.com/webstore/devconsole) e vá em **Privacidade**.

### Único propósito

```
Integrar cartões do Trello a processos do SEI, permitindo criar, vincular, visualizar, editar e automatizar cartões sem sair do SEI.
```

### Justificativa de `storage`

```
Salvar localmente as credenciais do Trello (login OAuth ou APP-KEY/TOKEN), o quadro e a lista padrão, as regras, as preferências, os sites autorizados e o cache de cartões. Nenhum dado é enviado ao criador.
```

### Justificativa de `scripting`

```
Injetar a interface do SEI Flow somente nas páginas do SEI que o usuário autorizou, para exibir e editar os cartões vinculados ao processo.
```

### Justificativa de `activeTab`

```
Identificar a URL da aba atual quando o usuário clica no ícone, para oferecer a ativação do site correto no painel inicial.
```

### Justificativa de `alarms`

```
Verificar periodicamente prazos e processos atualizados para manter as notificações e sincronizar as configurações entre navegadores.
```

### Justificativa de `notifications`

```
Avisar o usuário, no máximo uma vez por dia, sobre cartões atrasados ou que vencem hoje.
```

> Remova deste campo o texto do `https://api.trello.com/*` que estava junto. Ele vai no campo de host abaixo.

### Justificativa de `identity`

```
Abrir a tela oficial de login do Trello (OAuth 2.0 com PKCE) quando o usuário escolhe "Conectar com Trello". Não lê a identidade do navegador nem de outros serviços.
```

### Justificativa de Permissão do host

**Este é o campo mais importante para liberar o envio.** Coloque os três hosts:

```
https://api.trello.com/* - ler e gravar cartões, etiquetas, checklists, anexos e prazos na conta do próprio usuário.

https://auth.atlassian.com/* - trocar o código de autorização do Trello pelos tokens da própria sessão do usuário (login e renovação), sem client secret.

*://*/* (opcional) - ativar o SEI Flow em instalações do SEI de qualquer órgão/domínio. É solicitada em tempo de execução, por gesto do usuário; o script encerra sem alterar páginas que não sejam do SEI. A mesma permissão permite ativar automaticamente apenas endereços cujo host começa com "sei".
```

### Uso de dados

Marque **somente**:

- ☑ **Informações de autenticação** (login/credenciais do Trello)
- ☑ **Conteúdo do site** (textos e dados dos cartões/páginas do SEI)

Deixe **desmarcados**: identificação pessoal, saúde, finanças, comunicações pessoais, local, histórico da Web e atividade do usuário.

Mantenha as três declarações marcadas (não vender, não usar para fins não relacionados, não usar para crédito).

### Política de Privacidade

```
https://github.com/engleonardo/SEI/blob/main/PRIVACY.md
```

Clique em **Salvar rascunho**.

## 2. Conferir o pacote

Vá em **Pacote** e confirme que a versão **1.6.0** está lá. Se não estiver, envie manualmente:

```
.output/sei-flow-1.6.0-chrome.zip
```

(ou rode o workflow `Publish to stores` com `store=chrome`).

## 3. Página "Detalhes do app"

- **Descrição:** copie de `docs/store/listing-pt-BR.md` (bloco "Descrição completa").
- **Categoria:** Productivity.
- **Idioma:** Português (Brasil).
- **Screenshots:** até 5. Ordem sugerida para a 1.6.0:
  1. `dashboard-1280x800.png`
  2. `options-1280x800.png` (Conexão/login)
  3. `process-1280x800.png`
  4. `kanban-1280x800.png`
  5. `rules-1280x800.png`

  A imagem escura (`dashboard-dark-1280x800.png`) pode ficar de fora do Chrome (limite de 5); use no Firefox/Edge, que aceitam mais.
- **Imagem promocional:** `docs/store/banner-440x280.png`.

Salve.

## 4. Enviar para análise

1. Volte para **Status**.
2. Se o botão **Enviar para análise** continuar desabilitado, clique em **Por que não consigo enviar?** e veja o item pendente.
3. Envie e acompanhe o e-mail de revisão.

> A permissão de host nova pode exigir revisão detalhada; isso é normal e pode levar alguns dias.

## 5. Depois da aprovação

- A 1.6.0 substitui a 1.5.5 na loja.
- Confira a página pública: resumo, prints, versão 1.6.0.
- O Firefox e o Edge seguem os guias próprios.
