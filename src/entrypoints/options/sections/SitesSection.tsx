import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { isSeiHost, normalizeOrigin, originPermissionPattern } from '../../../core/storage/settings';
import { Icon } from '../../../ui/icons';
import {
  CollapsibleCard,
  SectionCard,
  Spinner,
  StatusPill,
  type Notice,
} from './shared';

export function SitesSection({
  settings,
  applySettings,
  save,
  notify,
}: {
  settings: Settings;
  applySettings: (settings: Settings) => void;
  save: (patch: Partial<Settings>) => Promise<Settings>;
  notify: (notice: Notice) => void;
}) {
  const [originInput, setOriginInput] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleAllSites = async () => {
    const next = !settings.allSites;
    setBusy(true);
    try {
      if (next) {
        const granted = await browser.permissions.request({ origins: ['*://*/*'] });
        if (!granted) {
          notify({ kind: 'error', text: 'Permissão para todos os sites não concedida.' });
          return;
        }
      }
      const updated = await callRpc('activation:set-all-sites', { enabled: next });
      applySettings(updated);
      notify({
        kind: 'success',
        text: next
          ? 'Ativação em todos os sites habilitada.'
          : 'Ativação em todos os sites desabilitada.',
      });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoSei = async () => {
    const next = !settings.autoSeiHosts;
    setBusy(true);
    try {
      if (next) {
        const granted = await browser.permissions.request({ origins: ['*://*/*'] });
        if (!granted) {
          notify({
            kind: 'error',
            text: 'Permissão para ativar sites que começam com “sei” não concedida.',
          });
          return;
        }
      }
      const updated = await save({ autoSeiHosts: next });
      applySettings(updated);
      notify({
        kind: 'success',
        text: next
          ? 'Sites que começam com “sei” serão ativados automaticamente.'
          : 'Ativação automática dos sites “sei” desabilitada.',
      });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const addOrigin = async () => {
    const raw = originInput.includes('://') ? originInput : `https://${originInput.trim()}`;
    const origin = normalizeOrigin(raw);
    if (!origin) {
      notify({ kind: 'error', text: 'Informe uma URL válida, começando com https:// ou http://.' });
      return;
    }
    if (settings.activatedOrigins.includes(origin)) {
      notify({ kind: 'info', text: 'Este site já está ativado.' });
      return;
    }

    setBusy(true);
    try {
      const granted = await browser.permissions.request({
        origins: [originPermissionPattern(origin)],
      });
      if (!granted) {
        notify({ kind: 'error', text: 'Permissão de acesso a este site não concedida.' });
        return;
      }
      const updated = await callRpc('activation:add-origin', { origin });
      applySettings(updated);
      setOriginInput('');
      notify({
        kind: 'success',
        text: `${origin} ativado. Recarregue as abas abertas do SEI para aplicar.`,
      });

      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const active = tabs[0];
      if (active?.id && normalizeOrigin(active.url) === origin) {
        await callRpc('activation:inject-tab', { tabId: active.id }).catch(() => undefined);
      }
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const removeOrigin = async (origin: string) => {
    setBusy(true);
    try {
      const updated = await callRpc('activation:remove-origin', { origin });
      applySettings(updated);
      notify({ kind: 'success', text: `${origin} removido.` });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionCard
        title="Onde o SEI Flow deve aparecer"
        subtitle="A extensão só injeta a interface nos sites que você autorizar. Funciona em qualquer domínio, pasta e versão do SEI."
        icon="link"
        footer={
          <>
            <span style={{ flex: 1 }} />
            <StatusPill
              tone={
                settings.allSites ||
                settings.autoSeiHosts ||
                settings.activatedOrigins.length > 0
                  ? 'success'
                  : 'warning'
              }
            >
              {settings.allSites
                ? 'Todos os sites'
                : settings.autoSeiHosts
                  ? 'Sites “sei” automáticos'
                  : `${settings.activatedOrigins.length} site(s) ativado(s)`}
            </StatusPill>
          </>
        }
      >
        <label className="sfo-toggle-row">
          <input
            type="checkbox"
            checked={settings.allSites}
            onChange={() => void toggleAllSites()}
            disabled={busy}
          />
          <span className="sfo-toggle-row__body">
            <span className="sfo-toggle-row__title">Ativar em todos os sites</span>
            <span className="sfo-toggle-row__text">
              Recomendado para quem usa várias instalações do SEI. Concede permissão de leitura e
              alteração em todos os sites, mas o script só age quando detecta o SEI.
            </span>
          </span>
        </label>

        <label
          className={`sfo-toggle-row${settings.allSites ? ' sfo-toggle-row--disabled' : ''}`}
        >
          <input
            type="checkbox"
            checked={settings.autoSeiHosts}
            onChange={() => void toggleAutoSei()}
            disabled={busy || settings.allSites}
          />
          <span className="sfo-toggle-row__body">
            <span className="sfo-toggle-row__title">
              Ativar automaticamente sites que começam com “sei”
            </span>
            <span className="sfo-toggle-row__text">
              Cobre endereços como <code>https://sei.ufsc.br</code>,{' '}
              <code>http://seiprocesos.orgao.gov.br</code> e similares sem cadastrar um por um. Pede
              a permissão ampla uma única vez; a interface continua aparecendo apenas em páginas do
              SEI.
            </span>
          </span>
        </label>

        <div className="sfo-field">
          <label htmlFor="sfo-add-origin">Adicionar site do SEI</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="sfo-add-origin"
              className="sfo-input"
              style={{ flex: '1 1 260px' }}
              value={originInput}
              onChange={(event) => setOriginInput(event.target.value)}
              placeholder="https://sei.suaorgao.gov.br"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addOrigin();
                }
              }}
              disabled={busy}
            />
            <button
              type="button"
              className="sfo-btn sfo-btn--primary"
              onClick={() => void addOrigin()}
              disabled={busy || !originInput.trim()}
            >
              {busy ? <Spinner /> : <Icon name="plus" size={14} />}
              Ativar site
            </button>
          </div>
          <span className="sfo-hint">
            Informe apenas a origem, sem caminho. Ex.: <code>sei.exemplo.gov.br</code> ou{' '}
            <code>https://sei.exemplo.gov.br</code>. O navegador pedirá permissão para esse
            domínio.
          </span>
        </div>

        {settings.activatedOrigins.length === 0 ? (
          <div className="sfo-empty">
            {settings.allSites
              ? 'Todos os sites estão ativados.'
              : settings.autoSeiHosts
                ? 'Nenhum site específico cadastrado. Sites que começam com “sei” já são ativados automaticamente.'
                : 'Nenhum site específico ativado. Use o campo acima ou o painel da extensão.'}
          </div>
        ) : (
          <div className="sfo-list">
            {settings.activatedOrigins.map((origin) => (
              <div key={origin} className="sfo-list-item">
                <Icon name="link" size={15} />
                <div className="sfo-list-item__main">
                  <div className="sfo-list-item__title">{origin}</div>
                  <div className="sfo-list-item__meta">
                    {settings.allSites
                      ? 'Coberto pela ativação em todos os sites'
                      : settings.autoSeiHosts && isSeiHost(origin)
                        ? 'Coberto pela ativação automática de sites “sei”'
                        : 'Permissão concedida para este domínio'}
                  </div>
                </div>
                <button
                  type="button"
                  className="sfo-btn sfo-btn--danger sfo-btn--sm"
                  onClick={() => void removeOrigin(origin)}
                  disabled={busy}
                >
                  <Icon name="trash" size={13} />
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <CollapsibleCard
        title="Como funciona a injeção"
        subtitle="Sem content scripts globais no manifest."
        icon="info"
      >
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-soft)', fontSize: 13 }}>
          <li>
            Ao abrir uma aba em um site autorizado, o service worker injeta o script do SEI Flow
            apenas naquele frame.
          </li>
          <li>
            O script detecta se a página é do SEI. Se não for, ele não altera nada e encerra.
          </li>
          <li>
            Depois de ativar um site, recarregue as abas já abertas do SEI. Abas novas funcionam
            automaticamente.
          </li>
          <li>
            Para revogar o acesso, remova o site aqui ou pelas configurações de extensões do
            navegador.
          </li>
        </ul>
      </CollapsibleCard>
    </>
  );
}
