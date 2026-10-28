# Publicação na Chrome Web Store - checklist

## Antes de enviar

- [ ] Conta de desenvolvedor paga e verificada no Chrome Web Store.
- [ ] `npm ci && npm run verify` passando.
- [ ] `npm run build && npm run zip` gerando `.output/sei-flow-1.2.0-chrome.zip`.
- [ ] Ícone 128×128 correto (`public/icon-128.png`).
- [ ] Screenshots 1280×800 em `docs/store/screenshots-1280x800/`.
- [ ] Banner 440×280 em `docs/store/banner-440x280.png` (opcional, para destaque).
- [ ] Política de privacidade publicada e acessível em https://github.com/engleonardo/SEI/blob/main/PRIVACY.md.
- [ ] Descrição e justificativas de permissão copiadas de `docs/store/listing-pt-BR.md`.
- [ ] Testar o zip em um perfil limpo do Chrome antes de enviar.

## No formulário da loja

1. **Store listing**: nome, resumo, descrição, categoria, idioma, imagens.
2. **Privacy practices**: informe que não coleta dados, que as credenciais ficam locais e que a única comunicação é com `api.trello.com`.
3. **Permissions justification**: use os textos de `listing-pt-BR.md`.
4. **Single purpose**: integração Trello ↔ SEI.
5. **Distribution**: Brasil (ou todos os países), visibilidade pública.
6. **Review**: envie o zip de produção.

## Após publicar

- [ ] Criar uma tag `v1.2.0` (ou a versão publicada) no GitHub.
- [ ] Anexar o zip ao GitHub Release.
- [ ] Configurar os segredos da loja para o envio automático (veja `auto-publish.md`).
- [ ] Confirmar o link da loja no README.
- [ ] Acompanhar as avaliações e issues.

## Segurança do repositório

- [ ] Branch `main` protegida contra force push e exclusão.
- [ ] Tags `v*` protegidas.
- [ ] CI obrigatório para pull requests.
- [ ] Dependabot e CodeQL ativos.
- [ ] 2FA habilitado na conta do GitHub.
- [ ] Apenas o proprietário com permissão de administração.
