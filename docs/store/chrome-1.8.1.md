# Chrome Web Store - atualização 1.8.1

> A 1.8.1 é uma atualização da **1.8.0** e **não adiciona permissões novas**. O conjunto continua: `storage`, `scripting`, `activeTab`, `alarms`, hosts do Trello/Atlassian/callback e o host opcional `*://*/*`.
> O login e a política de privacidade continuam iguais.
>
> **Situação:** pacote preparado para a tag `v1.8.1`; o workflow **Publish to stores** envia e publica automaticamente após o Release, se os segredos `CWS_*` estiverem configurados.

## 1. Pacote

Em **Pacote**, envie (ou confirme) a versão **1.8.1**:

```
.output/sei-flow-1.8.1-chrome.zip
```

## 2. Privacidade

As respostas de **Privacidade** são as mesmas da 1.8.0 (`docs/store/chrome-1.8.0.md`):

- Único propósito: integrar cartões do Trello a processos do SEI, permitindo criar, vincular, visualizar, editar e automatizar cartões sem sair do SEI.
- Permissões: `storage`, `scripting`, `activeTab`, `alarms`; sem `notifications` e sem `identity`.
- Hosts: `https://api.trello.com/*`, `https://auth.atlassian.com/*`, `https://engleonardo.github.io/SEI/oauth-callback.html` e o opcional `*://*/*`.
- Uso de dados: Informações de autenticação + Conteúdo do site; sem servidor próprio.
- Política: `https://engleonardo.github.io/SEI/privacy.html`.

> Não há mudança de permissão nesta versão; o rascunho da 1.8.0 pode ser reaproveitado.

## 3. Página "Detalhes do app"

- Descrição: `docs/store/listing-pt-BR.md`.
- Categoria: Productivity; idioma Português (Brasil).
- Screenshots (até 5): as mesmas da 1.8.0 (`dashboard`, `options`, `destination`, `kanban`, `rules`, 1280x800).
- Imagem promocional: `docs/store/banner-440x280.png`.
- Notas da versão: `docs/store/release-notes-1.8.1.md`.

## 4. Enviar

1. Salve o rascunho e confirme a versão **1.8.1**.
2. **Status → Enviar para análise**.
3. Se o botão continuar desabilitado, clique em **Por que não consigo enviar?** e registre a mensagem.

> Sem permissões novas, a revisão tende a ser mais simples. A 1.8.0 continua publicada até a aprovação da 1.8.1.
