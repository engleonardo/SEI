import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'SEI Flow',
    short_name: 'SEI Flow',
    description:
      'Vincule cartões do Trello a processos do SEI, crie cartões e edite etiquetas, prazos e checklists sem sair do SEI.',
    author: 'Leonardo Oliveira',
    homepage_url: 'https://github.com/engleonardo/SEI',
    permissions: ['storage', 'scripting', 'activeTab'],
    optional_host_permissions: ['*://*/*'],
    host_permissions: ['https://api.trello.com/*'],
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
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
                optional: [],
              },
            },
          },
        }
      : {}),
  }),
});
