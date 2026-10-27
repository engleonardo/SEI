# Política de Privacidade — SEI Flow

**Última atualização:** 26 de outubro de 2026

O SEI Flow é uma extensão de navegador que integra o SEI ao Trello. Esta política descreve quais dados a extensão trata e como eles são usados.

## Resumo

- **Não coletamos dados pessoais.**
- **Não temos servidor próprio.**
- **Não vendemos, alugamos ou compartilhamos dados com terceiros.**
- **Não usamos telemetria, analytics ou publicidade.**

## Dados armazenados no navegador

A extensão armazena localmente, em `chrome.storage.local` (ou equivalente no Firefox/Edge):

1. **Credenciais do Trello**: APP-KEY e TOKEN informados por você.
2. **Preferências**: quadro e lista padrão, tema, atualização automática, sites do SEI autorizados e opções de interface.
3. **Cache**: cópias temporárias de quadros, listas, etiquetas e cartões para acelerar a interface.

Esses dados permanecem no seu navegador. As credenciais são usadas exclusivamente para autenticar chamadas à API oficial do Trello (`https://api.trello.com`).

## Permissões do navegador

- **`storage`**: salvar credenciais, preferências e cache localmente.
- **`scripting`**: injetar a interface do SEI Flow nas páginas do SEI que você autorizar.
- **`activeTab`**: identificar a aba atual quando você abre o popup da extensão.
- **Permissão opcional de sites**: concedida por você, site a site, ou para todos os sites. Serve apenas para inserir a interface no SEI. Em páginas que não são do SEI, o script é encerrado sem alterar nada.
- **`https://api.trello.com/*`**: necessário para ler e gravar cartões na sua conta do Trello.

## Compartilhamento

Não compartilhamos dados com terceiros. A única comunicação externa é com a API do Trello, usando as credenciais que você forneceu, para as operações que você solicita (listar quadros, criar/editar cartões, etiquetas, checklists e prazos).

## Retenção e exclusão

- Você pode remover as credenciais e preferências limpando os dados da extensão nas configurações do navegador.
- O cache pode ser limpo em **Opções → Diagnóstico → Limpar cache local**.
- Para revogar o acesso ao Trello, remova o token em [trello.com/app-key](https://trello.com/app-key).

## Segurança

- Nenhum token é enviado para servidores nossos (não temos servidores).
- Nenhum token é registrado em logs da extensão.
- A interface é isolada em Shadow DOM para não interferir no SEI.

## Crianças

A extensão é destinada a servidores públicos e profissionais que usam SEI e Trello. Não é direcionada a crianças.

## Alterações

Mudanças nesta política serão publicadas neste arquivo e refletidas na data de atualização acima.

## Contato

Abra uma issue em [github.com/engleonardo/SEI/issues](https://github.com/engleonardo/SEI/issues).

---

# Privacy Policy — SEI Flow (English)

SEI Flow is a browser extension that integrates SEI with Trello. It does **not** collect personal data, has **no backend**, and does **not** sell or share data. Trello APP-KEY/TOKEN, preferences, and temporary cache are stored locally in the browser and used only to call the official Trello API (`https://api.trello.com`). Host permissions are optional and granted by the user per site or for all sites; the injected script exits on pages that are not SEI. To revoke access, remove the token at [trello.com/app-key](https://trello.com/app-key) or clear the extension data in your browser. Contact: GitHub issues.
