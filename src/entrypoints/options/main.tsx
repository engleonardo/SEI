import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { Settings, TrelloBoard } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { BrandMark } from '../../ui/BrandMark';
import { Icon, type IconName } from '../../ui/icons';
import { ConnectionSection } from './sections/ConnectionSection';
import { DestinationSection } from './sections/DestinationSection';
import { DiagnosticsSection } from './sections/DiagnosticsSection';
import { PreferencesSection } from './sections/PreferencesSection';
import { SitesSection } from './sections/SitesSection';
import { Spinner, type Notice } from './sections/shared';
import './style.css';

type Tab = 'connection' | 'destination' | 'sites' | 'preferences' | 'diagnostics';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'connection', label: 'Conexão', icon: 'settings' },
  { id: 'destination', label: 'Destino', icon: 'board' },
  { id: 'sites', label: 'Sites do SEI', icon: 'link' },
  { id: 'preferences', label: 'Preferências', icon: 'tag' },
  { id: 'diagnostics', label: 'Diagnóstico', icon: 'info' },
];

const PAGE_TITLES: Record<Tab, { title: string; subtitle: string }> = {
  connection: {
    title: 'Conexão',
    subtitle: 'Autorize o SEI Flow a falar com a sua conta do Trello.',
  },
  destination: {
    title: 'Destino dos cartões',
    subtitle: 'Defina o quadro e a lista usados ao criar cartões pelo SEI.',
  },
  sites: {
    title: 'Sites do SEI',
    subtitle: 'Escolha em quais instalações do SEI a extensão pode aparecer.',
  },
  preferences: {
    title: 'Preferências',
    subtitle: 'Aparência e comportamento da interface dentro do SEI.',
  },
  diagnostics: {
    title: 'Diagnóstico',
    subtitle: 'Versão, permissões, cache e canais de suporte.',
  },
};

function App() {
  const [tab, setTab] = useState<Tab>('connection');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const noticeTimer = useRef<number | null>(null);
  const version = browser.runtime.getManifest().version;

  const notify = useCallback((next: Notice) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(next);
    if (next) {
      noticeTimer.current = window.setTimeout(() => setNotice(null), 7_000);
    }
  }, []);

  const applySettings = useCallback((next: Settings) => {
    setSettings(next);
  }, []);

  const save = useCallback(async (patch: Partial<Settings>) => {
    const next = await callRpc('settings:save', patch);
    setSettings(next);
    return next;
  }, []);

  const reloadBoards = useCallback(async () => {
    try {
      const current = await callRpc('settings:get', undefined);
      setSettings(current);
      if (!current.appKey || !current.appToken) {
        setBoards([]);
        return;
      }
      const value = await callRpc('trello:boards', undefined);
      setBoards(value);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    }
  }, [notify]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const current = await callRpc('settings:get', undefined);
        if (active) setSettings(current);
      } catch (cause) {
        if (active) notify({ kind: 'error', text: errorMessage(cause) });
      } finally {
        if (active) setLoading(false);
        if (active) void reloadBoards();
      }
    })();
    return () => {
      active = false;
    };
  }, [notify, reloadBoards]);

  const page = PAGE_TITLES[tab];

  if (loading || !settings) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <Spinner />
        <span style={{ color: 'var(--muted)' }}>Carregando configurações…</span>
      </div>
    );
  }

  return (
    <div className="sfo-shell">
      <aside className="sfo-sidebar">
        <div className="sfo-brand">
          <BrandMark size={40} />
          <div>
            <div className="sfo-brand__name">SEI Flow</div>
            <div className="sfo-brand__tag">Trello dentro do SEI</div>
          </div>
        </div>

        <nav className="sfo-nav" aria-label="Seções das opções">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sfo-nav__item ${tab === item.id ? 'sfo-nav__item--active' : ''}`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sfo-sidebar__footer">
          <span>Versão {version}</span>
          <span>
            <a href="https://github.com/engleonardo/SEI" target="_blank" rel="noreferrer">
              GitHub
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/engleonardo/SEI/blob/main/PRIVACY.md"
              target="_blank"
              rel="noreferrer"
            >
              Privacidade
            </a>
          </span>
        </div>
      </aside>

      <main className="sfo-content">
        <header className="sfo-page-head">
          <div>
            <h1 className="sfo-page-title">{page.title}</h1>
            <p className="sfo-page-sub">{page.subtitle}</p>
          </div>
        </header>

        {notice && <div className={`sfo-alert sfo-alert--${notice.kind}`}>{notice.text}</div>}

        {!settings.appKey && (
          <div className="sfo-onboarding">
            <span className="sfo-logo" style={{ width: 36, height: 36, borderRadius: 10 }}>
              <Icon name="arrowRight" size={18} />
            </span>
            <div className="sfo-onboarding__body">
              <p className="sfo-onboarding__title">Comece conectando o Trello</p>
              <p className="sfo-onboarding__text">
                Informe sua APP-KEY e gere um TOKEN. Depois escolha o quadro e a lista padrão e
                ative o site do seu órgão.
              </p>
            </div>
            <button
              type="button"
              className="sfo-btn sfo-btn--primary"
              onClick={() => setTab('connection')}
            >
              Conectar Trello
            </button>
          </div>
        )}

        {tab === 'connection' && (
          <ConnectionSection
            settings={settings}
            save={save}
            notify={notify}
            reloadBoards={reloadBoards}
          />
        )}

        {tab === 'destination' && (
          <DestinationSection
            settings={settings}
            boards={boards}
            reloadBoards={reloadBoards}
            save={save}
            notify={notify}
          />
        )}

        {tab === 'sites' && (
          <SitesSection settings={settings} applySettings={applySettings} notify={notify} />
        )}

        {tab === 'preferences' && (
          <PreferencesSection settings={settings} save={save} notify={notify} />
        )}

        {tab === 'diagnostics' && <DiagnosticsSection settings={settings} notify={notify} />}

        <div className="sfo-alert sfo-alert--warning">
          <Icon name="alert" size={16} />
          <div>
            <strong>Privacidade e responsabilidade:</strong> o SEI Flow não mantém servidor próprio
            e não salva dados de usuários fora do seu navegador. Os dados de processos e cartões
            pertencem ao SEI e ao Trello. O uso é de responsabilidade exclusiva do usuário; o
            criador não tem ingerência sobre as informações desses sistemas.
          </div>
        </div>

        <footer className="sfo-footer">
          SEI Flow · projeto independente · licença MIT · não afiliado ao Trello ou ao SEI
        </footer>
      </main>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
