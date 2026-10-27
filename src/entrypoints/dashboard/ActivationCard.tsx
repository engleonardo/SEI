import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { looksLikeSeiUrl } from '../../core/sei/url';
import {
  isOriginActivated,
  normalizeOrigin,
  originPermissionPattern,
} from '../../core/storage/settings';
import type { LastActionTab } from '../../core/storage/last-tab';
import { Icon } from '../../ui/icons';

export interface ActivationCardProps {
  settings: Settings;
  lastTab: LastActionTab | null;
  onChanged: (settings: Settings) => void;
}

type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;

export function ActivationCard({ settings, lastTab, onChanged }: ActivationCardProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const origin = useMemo(() => normalizeOrigin(lastTab?.url ?? ''), [lastTab?.url]);
  const isSei = looksLikeSeiUrl(lastTab?.url ?? '');
  const activated = lastTab?.url ? isOriginActivated(lastTab.url, settings) : false;

  const refresh = async () => {
    const next = await callRpc('settings:get', undefined);
    onChanged(next);
  };

  const activateThisSite = async () => {
    if (!origin) return;
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
      if (lastTab?.id) await callRpc('activation:inject-tab', { tabId: lastTab.id });
      await refresh();
      setNotice({
        kind: 'success',
        text: 'Site ativado. Se o painel não aparecer no SEI, recarregue a página.',
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
      if (lastTab?.id) await callRpc('activation:inject-tab', { tabId: lastTab.id });
      await refresh();
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
    if (!lastTab?.id) return;
    setBusy(true);
    setNotice(null);
    try {
      await callRpc('activation:inject-tab', { tabId: lastTab.id });
      setNotice({
        kind: 'success',
        text: 'Injeção solicitada. Se o painel não aparecer, recarregue a página do SEI.',
      });
    } catch (cause) {
      setNotice({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sdo-status-card">
      <div className="sdo-status-card__head">
        <Icon name={isSei ? 'check' : 'info'} size={15} />
        <strong>Site do SEI</strong>
        <span
          className={`sdo-pill ${
            activated ? 'sdo-pill--success' : isSei ? 'sdo-pill--warning' : 'sdo-pill--neutral'
          }`}
        >
          {activated ? 'Ativado' : isSei ? 'Pronto para ativar' : 'Aguardando'}
        </span>
      </div>

      {lastTab?.url ? (
        <p className="sdo-status-card__text" title={lastTab.url}>
          {origin ?? lastTab.url}
          {lastTab.title ? ` · ${lastTab.title}` : ''}
        </p>
      ) : (
        <p className="sdo-status-card__text">
          Abra o site do SEI e clique no ícone do SEI Flow para ativar a extensão naquele domínio.
        </p>
      )}

      {lastTab?.url && !isSei && (
        <p className="sdo-status-card__text">
          A aba registrada não parece ser do SEI. Você pode ativar mesmo assim; a interface só
          aparece em páginas compatíveis.
        </p>
      )}

      <div className="sdo-status-card__actions">
        {activated ? (
          <>
            <span className="sdo-pill sdo-pill--success">
              <Icon name="check" size={12} />
              {settings.allSites ? 'Ativo em todos os sites' : 'Ativo neste site'}
            </span>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm"
              onClick={() => void reinject()}
              disabled={busy || !lastTab?.id}
            >
              <Icon name="refresh" size={14} />
              Reinjetar
            </button>
            {lastTab?.url && (
              <a
                className="sfo-btn sfo-btn--sm"
                href={lastTab.url}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="external" size={14} />
                Abrir no SEI
              </a>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--primary"
              onClick={() => void activateThisSite()}
              disabled={busy || !origin}
            >
              <Icon name="plus" size={14} />
              Ativar neste site
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm"
              onClick={() => void activateAllSites()}
              disabled={busy}
            >
              <Icon name="board" size={14} />
              Ativar em todos os sites
            </button>
          </>
        )}
        <button
          type="button"
          className="sfo-btn sfo-btn--sm sfo-btn--ghost"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <Icon name="settings" size={14} />
          Gerenciar sites
        </button>
      </div>

      {notice && <div className={`sdo-notice sdo-notice--${notice.kind}`}>{notice.text}</div>}
    </section>
  );
}
