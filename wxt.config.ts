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
    permissions: ['storage', 'scripting', 'activeTab', 'alarms', 'notifications'],
    // O Firefox 115 ainda usa optional_permissions para hosts opcionais;
    // optional_host_permissions só passou a existir no Firefox 128.
    ...(browser === 'firefox'
      ? { optional_permissions: ['*://*/*'] }
      : { optional_host_permissions: ['*://*/*'] }),
    host_permissions: ['https://api.trello.com/*'],
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
              strict_min_version: '115.0',
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
