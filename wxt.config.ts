import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: '__MSG_extensionName__',
    short_name: 'SEI Flow',
    description: '__MSG_extensionDescription__',
    default_locale: 'pt_BR',
    author: 'Engenheiro Leonardo Almeida de Oliveira',
    homepage_url: 'https://github.com/engleonardo/SEI',
    permissions: ['storage', 'scripting', 'activeTab', 'alarms'],
    // O Firefox mantém `optional_permissions` para hosts opcionais; o mínimo
    // agora é 128 (Android 142+), mas o formato antigo segue compatível.
    ...(browser === 'firefox'
      ? { optional_permissions: ['*://*/*'] }
      : { optional_host_permissions: ['*://*/*'] }),
    host_permissions: ['https://api.trello.com/*', 'https://auth.atlassian.com/*'],
    web_accessible_resources: [
      {
        resources: ['icon-128.png'],
        matches: ['*://*/*'],
      },
    ],
    action: {
      default_title: 'SEI Flow',
    },
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'sei-flow@engleonardo',
              // O login depende do content script da página de callback. Do
              // Firefox 127 em diante as permissões de host de content_scripts
              // são concedidas na instalação; versões anteriores exigiriam uma
              // liberação manual do site e o login falharia sem aviso.
              strict_min_version: '128.0',
              data_collection_permissions: {
                required: ['none'],
                optional: [],
              },
            },
            gecko_android: {
              strict_min_version: '142.0',
            },
          },
        }
      : {}),
  }),
});
