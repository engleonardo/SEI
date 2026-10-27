# Atualização automática após publicar no GitHub

O GitHub não instala nem atualiza extensões diretamente. Quem faz a atualização
dos usuários é a loja (Chrome Web Store, Edge Add-ons ou AMO). O fluxo abaixo
automatiza o **envio e a publicação** na loja sempre que uma release é publicada
no GitHub.

## O que já está pronto

- Tag `v*` → workflow **Release** cria o GitHub Release com os zips.
- Release concluída com sucesso → workflow **Publish to stores** envia o pacote
  para a loja.
- Se os segredos da loja não estiverem configurados, o workflow apenas avisa e
  termina com sucesso; nada quebra.

## Chrome Web Store (automático)

### 1. Publique a primeira versão manualmente

A Chrome Web Store precisa do item criado e do `extension ID` antes de aceitar
envios pela API.

1. Acesse o [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Envie o `sei-flow-1.1.0-chrome.zip` e preencha a listagem.
3. Publique e copie o **ID da extensão** exibido no painel.

### 2. Crie as credenciais OAuth

1. No [Google Cloud Console](https://console.cloud.google.com/), crie/selecione
   um projeto e ative a **Chrome Web Store API**.
2. Em **APIs e serviços > Tela de consentimento OAuth**, configure o app
   (público externo). Publique o app em **Produção**; em modo de teste o
   refresh token expira em 7 dias.
3. Em **Credenciais**, crie um **ID do cliente OAuth** do tipo **App para
   computador**.
4. Gere o `refresh token` pelo OAuth 2.0 Playground:
   1. Abra https://developers.google.com/oauthplayground
   2. Clique na engrenagem no canto superior direito e marque **Use your own
      OAuth credentials**.
   3. Informe o **Client ID** e o **Client Secret**.
   4. No campo de escopos, informe:
      `https://www.googleapis.com/auth/chromewebstore`
   5. Clique em **Authorize APIs** e entre com a conta Google que é dona do
      item na Chrome Web Store.
   6. Clique em **Exchange authorization code for tokens**.
   7. Copie o **Refresh token** exibido.

> O Client Secret é uma credencial sensível. Se ele foi exposto em conversa,
> issue tracker ou repositório, regenere-o no Google Cloud Console antes de
> gerar o refresh token. O refresh token também é sensível e nunca deve ir
> para o Git.

### 3. Configure os segredos no GitHub

No repositório, em **Settings → Secrets and variables → Actions**, crie:

| Segredo | Onde encontrar |
| --- | --- |
| `CWS_EXTENSION_ID` | ID da extensão no Developer Dashboard |
| `CWS_PUBLISHER_ID` | ID do publicador no Developer Dashboard |
| `CWS_CLIENT_ID` | Client ID do OAuth |
| `CWS_CLIENT_SECRET` | Client Secret do OAuth |
| `CWS_REFRESH_TOKEN` | Refresh token gerado no passo anterior |

Ou via `gh`:

```bash
gh secret set CWS_EXTENSION_ID
gh secret set CWS_PUBLISHER_ID
gh secret set CWS_CLIENT_ID
gh secret set CWS_CLIENT_SECRET
gh secret set CWS_REFRESH_TOKEN
```

> A **chave pública** do pacote não é usada no upload nem no GitHub Actions.
> Não é preciso cadastrá-la e ela não deve ser adicionada ao repositório.

### 4. Publique uma nova versão

1. Atualize `version` em `package.json`.
2. Rode `npm run verify`.
3. Faça commit, crie a tag e envie:

```bash
git tag v1.0.1
git push origin v1.0.1
```

O workflow **Release** cria o release e o **Publish to stores** envia para a
Chrome Web Store e publica. A revisão da Google é assíncrona (normalmente de
algumas horas a alguns dias). Depois de aprovada, o Chrome atualiza os usuários
automaticamente.

## Firefox Add-ons (AMO) - opcional

1. Crie as credenciais em [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/).
2. Adicione os segredos:
   - `AMO_JWT_ISSUER`
   - `AMO_JWT_SECRET`
3. O workflow envia `.output/firefox-mv3` com o código-fonte para revisão.

O Firefox também atualiza os usuários automaticamente depois que a Mozilla
aprova a versão.

## Microsoft Edge Add-ons

O Edge usa um portal e uma API próprios (Azure AD). O envio continua manual:

1. Acesse o [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview).
2. Envie o `sei-flow-1.1.0-edge.zip`.
3. Após aprovação, o Edge atualiza os usuários automaticamente.

## Observações

- **Nunca** coloque tokens no repositório. Use apenas GitHub Secrets.
- A extensão carregada por “Carregar sem compactação” **não** se atualiza
  sozinha; isso só acontece quando instalada pela loja.
- Se você quiser apenas testar, use `workflow_dispatch` no workflow
  **Publish to stores** e informe a tag.
