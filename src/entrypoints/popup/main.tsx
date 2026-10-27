import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { Settings } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { looksLikeSeiUrl } from '../../core/sei/url';
import { normalizeOrigin, originPermissionPattern } from '../../core/storage/settings';
import { BrandMark } from '../../ui/BrandMark';
import { Icon } from '../../ui/icons';
import './style.css';

type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;

function App() {
  const [tab, setTab] = useState<{ id?: number; url?: string } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activated, setActivated] = useState(false);
  const [allSites, setAllSites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const version = browser.runtime.getManifest().version;

  const load = async () => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const active = tabs[0];
      setTab(active ? { id: active.id, url: active.url } : null);

      const nextSettings = await callRpc('settings:get', undefined);
      setSettings(nextSettings);

      if (active?.url) {
        const status = await callRpc('activation:status', { url: active.url });
        setActivated(status.activated);
        setAllSites(status.allSites);
      } else {
        setActivated(false);
        setAllSites(nextSettings.allSites);
      }
    } catch (cause) {
      setNotice({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const currentUrl = tab?.url ?? '';
  const origin = normalizeOrigin(currentUrl);
  const isSei = looksLikeSeiUrl(currentUrl);
  const connected = Boolean(settings?.appKey && settings?.appToken);

  const activateThisSite = async () => {
    if (!origin) {
      setNotice({ kind: 'error', text: 'Não foi possível identificar o site desta aba.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const granted = await browser.permissions.request({
        origins: [originPermissionPattern(origin)],
      });
      if (!granted) {
        setNotice({ kind: 'error', text: 'Permissão não concedida para este site.' });
        return;
      }
      await callRpc('activation:add-origin', { origin });
      if (tab?.id) await callRpc('activation:inject-tab', { tabId: tab.id });
      setActivated(true);
      setAllSites(false);
      setNotice({
        kind: 'success',
        text: 'SEI Flow ativado neste site. Se o painel não aparecer, recarregue a página.',
      });
    } catch (cause) {
      setNotice({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const activateAllSites = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const granted = await browser.permissions.request({ origins: ['*://*/*'] });
      if (!granted) {
        setNotice({ kind: 'error', text: 'Permissão para todos os sites não concedida.' });
        return;
      }
      await callRpc('activation:set-all-sites', { enabled: true });
      if (tab?.id) await callRpc('activation:inject-tab', { tabId: tab.id });
      setActivated(true);
      setAllSites(true);
      setNotice({
        kind: 'success',
        text: 'SEI Flow ativado em todos os sites. Funciona em qualquer instalação do SEI.',
      });
    } catch (cause) {
      setNotice({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const reinject = async () => {
    if (!tab?.id) return;
    setBusy(true);
    setNotice(null);
    try {
      await callRpc('activation:inject-tab', { tabId: tab.id });
      setNotice({
        kind: 'success',
        text: 'Injeção solicitada. Se o painel não aparecer, recarregue a página.',
      });
    } catch (cause) {
      setNotice({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sfp-app">
      <header className="sfp-header">
        <BrandMark size={34} />
        <div>
          <div className="sfp-title">SEI Flow</div>
          <div className="sfp-subtitle">Trello dentro do SEI</div>
        </div>
        <span className="sfp-version">v{version}</span>
      </header>

      {loading ? (
        <div className="sfp-card">
          <span className="sfp-spinner" />
        </div>
      ) : (
        <>
          <section className="sfp-card">
            <div className="sfp-card__head">
              <Icon name="search" size={14} />
              Página atual
              <span
                className={`sfp-pill ${isSei ? 'sfp-pill--success' : 'sfp-pill--warning'}`}
                style={{ marginLeft: 'auto' }}
              >
                {isSei ? 'SEI detectado' : 'Não identificado'}
              </span>
            </div>
            <div className="sfp-card__text" title={currentUrl}>
              {origin ?? 'URL indisponível'}
            </div>
            {!isSei && (
              <div className="sfp-card__text">
                Você pode ativar mesmo assim: o SEI Flow só exibe a interface em páginas compatíveis
                com o SEI.
              </div>
            )}

            <div className="sfp-row">
              {activated ? (
                <>
                  <span className="sfp-pill sfp-pill--success" style={{ minHeight: 34 }}>
                    <Icon name="check" size={12} />
                    {allSites ? 'Ativo em todos os sites' : 'Ativo neste site'}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button className="sfp-btn sfp-btn--ghost" onClick={() => void reinject()} disabled={busy}>
                    <Icon name="refresh" size={13} />
                    Reinjetar
                  </button>
                </>
              ) : (
                <button
                  className="sfp-btn sfp-btn--primary"
                  onClick={() => void activateThisSite()}
                  disabled={busy || !origin}
                >
                  {busy ? <span className="sfp-spinner" /> : <Icon name="plus" size={14} />}
                  Ativar neste site
                </button>
              )}
            </div>

            {!activated && (
              <button className="sfp-btn" onClick={() => void activateAllSites()} disabled={busy}>
                <Icon name="board" size={14} />
                Ativar em todos os sites
              </button>
            )}
          </section>

          <section className="sfp-card">
            <div className="sfp-card__head">
              <Icon name="columns" size={14} />
              Trello
              <span
                className={`sfp-pill ${connected ? 'sfp-pill--success' : 'sfp-pill--warning'}`}
                style={{ marginLeft: 'auto' }}
              >
                {connected ? 'Conectado' : 'Configurar'}
              </span>
            </div>
            <div className="sfp-card__text">
              {connected
                ? 'Credenciais salvas neste navegador. Os cartões são sincronizados direto com o Trello.'
                : 'Informe a APP-KEY e o TOKEN do Trello para começar.'}
            </div>
            <button
              className={connected ? 'sfp-btn' : 'sfp-btn sfp-btn--primary'}
              onClick={() => void browser.runtime.openOptionsPage()}
            >
              <Icon name="settings" size={14} />
              {connected ? 'Abrir configurações' : 'Conectar ao Trello'}
            </button>
          </section>

          {notice && <div className={`sfp-alert sfp-alert--${notice.kind}`}>{notice.text}</div>}
        </>
      )}

      <footer className="sfp-footer">
        <a
          className="sfp-link"
          href="https://github.com/engleonardo/SEI"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        <a
          className="sfp-link"
          href="https://github.com/engleonardo/SEI/blob/main/PRIVACY.md"
          target="_blank"
          rel="noreferrer"
        >
          Privacidade
        </a>
        <span>Feito para o SEI</span>
      </footer>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
