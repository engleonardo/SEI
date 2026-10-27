# Publicação — SEI Flow

Guia para publicar na Chrome Web Store, Firefox Add-ons (AMO) e Edge Add-ons.

## Pré-requisitos

- Conta de desenvolvedor na loja de destino.
- Build de produção atualizado.
- Política de privacidade publicada (este repositório já contém `PRIVACY.md`).
- Ícones 16/32/48/128 em `public/`.
- Capturas de tela em `docs/store/screenshots-1280x800/`.
- Texto e justificativas de permissão em `docs/store/listing-pt-BR.md`.

## Gerar os pacotes

```bash
npm ci
npm run verify
npm run build && npm run zip
npm run build:firefox && npm run zip:firefox
npm run build:edge && npm run zip:edge
```

Os arquivos ficam em `.output/`:

- `.output/sei-flow-<versao>-chrome.zip`
- `.output/sei-flow-<versao>-firefox.zip`
- `.output/sei-flow-<versao>-edge.zip`

> O nome exato pode variar conforme a versão do WXT. Use o zip gerado em `.output/`.

## Texto da listagem (pt-BR)

**Nome:** SEI Flow

**Resumo (até 132 caracteres):**
> Crie, vincule e edite cartões do Trello direto no SEI. Vários cartões por processo, etiquetas, prazos e checklists.

**Descrição:**

```
O SEI Flow conecta o Trello ao SEI (Sistema Eletrônico de Informações) para você trabalhar sem alternar de aba.

• Crie cartões no Trello a partir de um processo do SEI.
• Vincule cartões que já existem no Trello a um ou vários processos — inclusive em lote.
• Veja todos os cartões de um processo, sem esconder os adicionais.
• Edite nome, descrição, etiquetas, checklist, prazo, quadro e lista dentro do SEI.
• Painel SEI Flow como página inicial, com prazos, etiquetas, tipos de processo e atualizações.
• Filtre o painel por etiqueta, tipo de processo, prazo, quadro, lista e atualização no Trello/SEI.
• Abra os detalhes e edite qualquer cartão direto pelo painel.
• Clique no processo para abrir a página correspondente no SEI.
• Notificações diárias de prazos e badge com processos atualizados no SEI.
• Desvincule sem excluir o cartão do Trello.
• Filtre a lista de processos por quadro, lista, situação, etiqueta, prazo e busca.
• Funciona em qualquer domínio e versão do SEI (3.x, 4.x e 5.x).
• Ative apenas os sites que você usa; sem permissão global obrigatória.
• Tema claro/escuro e interface isolada do CSS do SEI.

Privacidade: sem servidor próprio, sem telemetria e sem anúncios. Suas credenciais do Trello ficam apenas no seu navegador. Saiba mais: https://github.com/engleonardo/SEI/blob/main/PRIVACY.md

O SEI Flow é um projeto independente, sem afiliação ao Trello/Atlassian ou ao SEI. Licença MIT.
```

## Justificativa de permissões (Chrome Web Store)

Copie e adapte no formulário de revisão:

- **`storage`**: salvar localmente a APP-KEY/TOKEN do Trello, o quadro/lista padrão, as preferências e o cache de cartões. Nenhum dado sai do navegador.
- **`scripting`**: injetar a interface do SEI Flow nas páginas do SEI que o usuário autorizou explicitamente.
- **`activeTab`**: identificar a URL da aba atual quando o usuário clica no ícone, para oferecer a ativação do site correto no painel inicial.
- **`alarms`**: verificar periodicamente prazos e processos atualizados para manter badge e notificações.
- **`notifications`**: avisar uma vez por dia sobre cartões atrasados ou vencendo hoje.
- **`https://api.trello.com/*`**: ler e gravar cartões, etiquetas, checklists e prazos na conta do Trello do próprio usuário, usando as credenciais fornecidas por ele.
- **Permissão opcional de host (`*://*/*`)**: permitir que o usuário ative o SEI Flow em instalações do SEI de qualquer órgão/domínio. A permissão é solicitada em tempo de execução, por gesto do usuário, e o script encerra sem alterar páginas que não sejam do SEI.

### Single purpose

> Integrar cartões do Trello a processos do SEI, permitindo criar, vincular, visualizar e editar cartões sem sair do SEI.

### Uso de dados

- A extensão **não coleta** dados pessoais.
- Credenciais e preferências são armazenadas localmente.
- A única transferência externa é para `api.trello.com`, por solicitação do usuário.
- Não há analytics, anúncios ou venda de dados.

## Checklist de capturas de tela

Os arquivos finais em 1280×800 estão em [`docs/store/screenshots-1280x800/`](store/screenshots-1280x800/), com banner em `docs/store/banner-440x280.png`.

Sugestão de imagens:

1. Painel SEI Flow com métricas, filtros por etiqueta/tipo e cartões.
2. Lista de processos com cartões compactos e filtros.
3. Filtros por quadro, lista, etiqueta, prazo e situação.
4. Processo aberto com o painel SEI Flow.
5. Diálogo “Vincular cartões existentes” com seleção múltipla.
6. Ação em lote entre processos.
7. Página de opções (conexão/quadro/lista/sites).

Evite dados reais de processos: use números fictícios e nomes genéricos.

## Atualização automática

O workflow **Publish to stores** envia o pacote à Chrome Web Store e à AMO
sempre que uma release é publicada, desde que os segredos estejam configurados.
Passo a passo em [`store/auto-publish.md`](store/auto-publish.md).

## Firefox Add-ons (AMO)

- O manifest gerado inclui `browser_specific_settings.gecko` com ID `sei-flow@engleonardo` e `strict_min_version`.
- Envie o zip do Firefox em [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
- Informe a política de privacidade e marque “nenhuma coleta de dados”.
- O código-fonte está neste repositório; a AMO pode solicitar link do fonte.

## Edge Add-ons

- Use o zip do Chrome/Edge.
- Envie em [partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge).
- As justificativas de permissão são semelhantes às da Chrome Web Store.

## Versionamento e release

1. Atualize a versão em `package.json` (ex.: `1.0.0` → `1.0.1`).
2. Atualize o `CHANGELOG.md` (se existir) ou as notas da release.
3. Rode `npm run verify`.
4. Commit e tag:

```bash
git add .
git commit -m "chore(release): v0.1.1"
git tag v0.1.1
git push origin main --tags
```

O workflow `.github/workflows/release.yml` gera os zips e anexa ao GitHub Release.

## Marca

“Trello” é marca da Atlassian. O nome do produto usa “SEI Flow” para reduzir risco de rejeição; o texto descritivo pode mencionar Trello de forma nominativa. Se a loja solicitar, troque o nome exibido para **SEI Flow** e mantenha a descrição explicando a integração.
