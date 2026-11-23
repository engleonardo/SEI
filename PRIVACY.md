# Política de Privacidade - SEI Flow

**Última atualização:** 26 de outubro de 2026

O SEI Flow é uma extensão de navegador que integra o SEI ao Trello. Esta política descreve quais dados a extensão trata e como eles são usados.

## Resumo

- **Não coletamos dados pessoais.**
- **Não temos servidor próprio.**
- **Não vendemos, alugamos ou compartilhamos dados com terceiros.**
- **Não usamos telemetria, analytics ou publicidade.**

## Dados armazenados no navegador

A extensão armazena localmente, em `chrome.storage.local` (ou equivalente no Firefox/Edge):

1. **Credenciais do Trello**: APP-KEY/TOKEN informados por você ou os tokens do login OAuth 2.0 (access e refresh), quando você escolhe “Entrar com Trello”.
2. **Preferências**: quadro e lista padrão, tema, atualização automática, sites do SEI autorizados e opções de interface.
3. **Cache**: cópias temporárias de quadros, listas, etiquetas e cartões para acelerar a interface.

Esses dados permanecem no seu navegador. As credenciais são usadas exclusivamente para autenticar chamadas à API oficial do Trello (`https://api.trello.com`).

Para manter as mesmas regras e o mesmo destino em Chrome, Edge e Firefox, a extensão grava um JSON com **regras e quadro/lista padrão** em um quadro privado chamado **“SEI Flow - Configurações (não excluir)”**, na sua própria conta do Trello. Tokens, sites autorizados e cache não são sincronizados. Se você apagar esse quadro, a extensão o recria na próxima sincronização.

## Permissões do navegador

- **`storage`**: salvar credenciais, preferências e cache localmente.
- **`scripting`**: injetar a interface do SEI Flow nas páginas do SEI que você autorizar.
- **`activeTab`**: identificar a aba atual quando você clica no ícone da extensão, para oferecer a ativação do site correto no Painel SEI Flow.
- **`https://engleonardo.github.io/SEI/oauth-callback.html`**: página de callback do login. Um content script restrito a essa página lê o código e o estado do OAuth e entrega à extensão; não acessa outras páginas.
- **Permissão opcional de sites**: concedida por você, site a site, ou para todos os sites. Serve apenas para inserir a interface no SEI. Em páginas que não são do SEI, o script é encerrado sem alterar nada.
- **`https://api.trello.com/*`**: necessário para ler e gravar cartões na sua conta do Trello.
- **`https://auth.atlassian.com/*`**: necessário para trocar o código de autorização pelos tokens da sua própria sessão (login e renovação).

## Compartilhamento

Não compartilhamos dados com terceiros. A única comunicação externa é com a API do Trello, usando as credenciais que você forneceu, para as operações que você solicita (listar quadros, criar/editar cartões, etiquetas, checklists e prazos).

## Retenção e exclusão

- Você pode remover as credenciais e preferências limpando os dados da extensão nas configurações do navegador.
- Ao usar **Sair**, o login, as credenciais manuais e os dados locais (regras, destino, cache, catálogo de processos, espelhos e fixados) são apagados deste navegador. As regras e o destino permanecem no quadro privado da sua conta do Trello e voltam no próximo login.
- O cache pode ser limpo em **Opções → Diagnóstico → Limpar cache local**.
- Para revogar o acesso ao Trello, remova o token em [trello.com/app-key](https://trello.com/app-key).

## Segurança

- Nenhum token é enviado para servidores nossos (não temos servidores).
- Nenhum token é registrado em logs da extensão.
- A interface é isolada em Shadow DOM para não interferir no SEI.

## Uso e responsabilidade

O SEI Flow é uma ferramenta de apoio. Ele **não salva dados de usuários em servidores do criador** e não tem ingerência sobre o conteúdo do SEI ou do Trello.

Os dados de processos, documentos, cartões e informações pessoais pertencem aos sistemas SEI e Trello e às instituições responsáveis por eles. **O uso da extensão é de responsabilidade exclusiva do usuário.** O criador não controla, valida, corrige ou se responsabiliza por informações inseridas, exibidas, alteradas ou armazenadas nesses sistemas, nem por decisões administrativas, jurídicas ou de qualquer natureza tomadas com base nelas.

## Crianças

A extensão é destinada a servidores públicos e profissionais que usam SEI e Trello. Não é direcionada a crianças.

## Alterações

Mudanças nesta política serão publicadas neste arquivo e refletidas na data de atualização acima.

## Contato

Abra uma issue em [github.com/engleonardo/SEI/issues](https://github.com/engleonardo/SEI/issues).

---

# Privacy Policy - SEI Flow (English)

SEI Flow is a browser extension that integrates SEI with Trello. It does **not** collect personal data, has **no backend**, and does **not** sell or share data. Trello APP-KEY/TOKEN, preferences, and temporary cache are stored locally in the browser and used only to call the official Trello API (`https://api.trello.com`). Host permissions are optional and granted by the user per site or for all sites; the injected script exits on pages that are not SEI. To revoke access, remove the token at [trello.com/app-key](https://trello.com/app-key) or clear the extension data in your browser. Contact: GitHub issues.
