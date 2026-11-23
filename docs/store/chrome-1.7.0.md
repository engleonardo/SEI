# Chrome Web Store - atualização 1.7.0

> A 1.7.0 **remove a permissão `identity`** e muda o login: a autorização abre em uma aba e a página de callback entrega o código por um content script restrito a ela.
> O pacote 1.7.0 substitui a 1.6.0 publicada.
>
> **Atenção (atualização de quem já tem a 1.6.0):** a 1.7.0 adiciona o host `https://engleonardo.github.io/SEI/oauth-callback.html` em `content_scripts.matches`. O Chrome trata isso como nova permissão de host e **desativa a extensão para os usuários atuais até eles aceitarem** ("Ler e alterar seus dados em engleonardo.github.io"). Remover `identity` não desativa. Avise no release notes e no aviso interno; o usuário precisa reativar uma vez.
>
> **Situação:** enviado em 2026-11-23 pelo workflow; a Chrome Web Store respondeu **Pending review**.

## 1. Pacote

Em **Pacote**, envie (ou confirme) a versão **1.7.0**:

```
.output/sei-flow-1.7.0-chrome.zip
```

## 2. Privacidade

Abra **Privacidade** e ajuste:

### Único propósito

```
Integrar cartões do Trello a processos do SEI, permitindo criar, vincular, visualizar, editar e automatizar cartões sem sair do SEI.
```

### Justificativas

- **`storage`**
```
Salvar localmente as credenciais do Trello (login OAuth ou APP-KEY/TOKEN), o quadro e a lista padrão, as regras, as preferências, os sites autorizados e o cache de cartões. Nenhum dado é enviado ao criador.
```

- **`scripting`**
```
Injetar a interface do SEI Flow somente nas páginas do SEI que o usuário autorizou, para exibir e editar os cartões vinculados ao processo.
```

- **`activeTab`**
```
Identificar a URL da aba atual quando o usuário clica no ícone, para oferecer a ativação do site correto no painel inicial.
```

- **`alarms`**
```
Verificar periodicamente prazos e processos atualizados para manter as notificações e sincronizar as configurações entre navegadores.
```

- **`notifications`**
```
Avisar o usuário, no máximo uma vez por dia, sobre cartões atrasados ou que vencem hoje.
```

- **`identity`**: não existe mais na 1.7.0. Se o campo ainda aparecer no rascunho antigo, o pacote 1.7.0 não a solicita.

### Permissão de host

```
https://api.trello.com/* - ler e gravar cartões, etiquetas, checklists, anexos, prazos e quadros na conta do próprio usuário.

https://auth.atlassian.com/* - trocar o código de autorização do Trello pelos tokens da própria sessão do usuário (login e renovação), sem client secret.

https://engleonardo.github.io/SEI/oauth-callback.html - página de callback do login; o content script lê apenas o código e o estado do OAuth e entrega à extensão. Não acessa outras páginas.

*://*/* (opcional) - ativar o SEI Flow em instalações do SEI de qualquer órgão/domínio. É solicitada em tempo de execução, por gesto do usuário; o script encerra sem alterar páginas que não sejam do SEI.
```

### Uso de dados

- ☑ Informações de autenticação
- ☑ Conteúdo do site
- ☐ Demais categorias
- As três declarações de rodapé marcadas.
- Política: `https://engleonardo.github.io/SEI/privacy.html`

Clique em **Salvar rascunho**.

## 3. Página "Detalhes do app"

- Descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity; idioma Português (Brasil).
- Screenshots (até 5). Sugestão para a 1.7.0:
  1. `dashboard-1280x800.png`
  2. `options-1280x800.png` (login)
  3. `destination-1280x800.png` (criar/renomear quadro)
  4. `kanban-1280x800.png`
  5. `rules-1280x800.png`
- Imagem promocional: `docs/store/banner-440x280.png`.

## 4. Enviar

1. Salve.
2. **Status → Enviar para análise**.
3. Se o botão continuar desabilitado, clique em **Por que não consigo enviar?** e me mande a mensagem.

> A 1.7.0 tem menos permissões que a 1.6.0; isso costuma acelerar a revisão.
