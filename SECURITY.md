# Política de Segurança

## Versões suportadas

Apenas a versão mais recente publicada recebe correções de segurança.

## Como reportar

Não abra uma issue pública para vulnerabilidades. Use o canal privado de **Security Advisories** do GitHub:

https://github.com/engleonardo/SEI/security/advisories/new

Inclua:

- versão da extensão e navegador;
- passos para reproduzir;
- impacto esperado;
- se possível, uma prova de conceito sem dados reais.

Você receberá uma confirmação e um prazo estimado de correção. Créditos serão dados ao pesquisador, se desejado.

## Escopo

Estão no escopo:

- execução indevida de código ou injeção em páginas do SEI;
- vazamento de APP-KEY/TOKEN do Trello;
- bypass de permissões de host;
- manipulação indevida de cartões/processos;
- falhas no content script ou no service worker.

Fora do escopo:

- problemas no SEI ou no Trello;
- engenharia social;
- dados de exemplo/fictícios;
- configuração incorreta do navegador ou da conta do usuário.

## Boas práticas para usuários

- Mantenha o navegador e a extensão atualizados.
- Use 2FA na conta do Trello e do GitHub.
- Revogue tokens que não usa em https://trello.com/app-key.
- Ative o SEI Flow apenas nos domínios do seu órgão.
