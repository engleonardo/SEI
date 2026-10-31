# Notas para o revisor - Firefox Add-ons (AMO)

Copie o texto abaixo no campo **Notes to reviewer** ao enviar a extensão.

```
SEI Flow - integração entre Trello e SEI.

O código-fonte completo está anexado (sei-flow-<versao>-sources.zip) e o build é:
  npm ci
  npm run build:firefox

Sobre os avisos "Unsafe assignment to innerHTML":
- Eles vêm do React DOM, biblioteca usada para renderizar a interface.
- A extensão NÃO usa dangerouslySetInnerHTML e não injeta HTML de usuário.
- Todo conteúdo de cartão, etiqueta e processo é renderizado como texto/JSX.
- O aviso é um falso positivo do bundle de produção do React.

Sobre permissões:
- storage: guarda credenciais e preferências localmente.
- scripting: injeta a interface apenas nas páginas do SEI autorizadas.
- activeTab: identifica a aba ao clicar no ícone.
- alarms/notifications: avisos diários de prazos.
- api.trello.com: leitura/gravação dos cartões do próprio usuário.
- Permissão opcional de host: solicitada em tempo de execução para ativar o SEI
  no domínio do órgão; o script encerra em páginas que não são do SEI.

Privacidade:
- Não há servidor próprio, telemetria, anúncios ou venda de dados.
- Credenciais e cache ficam no navegador.
- A extensão não coleta dados (data_collection_permissions: none).

Teste:
- A extensão pode ser testada em uma instalação do SEI acessível ao revisor.
- Sem acesso ao SEI, o painel e as opções abrem e exibem a interface normalmente;
  a integração com o Trello exige uma conta e credenciais próprias.
```
