import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../../ui/icons';
import { SectionCard, Spinner, type Notice } from './shared';

export function DiagnosticsSection({
  settings,
  notify,
}: {
  settings: Settings;
  notify: (notice: Notice) => void;
}) {
  const [busy, setBusy] = useState(false);
  const manifest = browser.runtime.getManifest();
  const permissions = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])];
  const optional = manifest.optional_host_permissions ?? [];

  const clearCache = async () => {
    setBusy(true);
    try {
      await callRpc('settings:clear-cache', undefined);
      notify({ kind: 'success', text: 'Cache local limpo. Os dados serão buscados novamente.' });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const diagnostics = [
    `SEI Flow v${manifest.version}`,
    `ID: ${browser.runtime.id}`,
    `Sites: ${settings.allSites ? 'todos' : settings.activatedOrigins.join(', ') || 'nenhum'}`,
    `Quadro padrão: ${settings.defaultBoardName || '(não configurado)'}`,
    `Lista padrão: ${settings.defaultListName || '(não configurado)'}`,
    `Permissões: ${permissions.join(', ')}`,
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      notify({ kind: 'success', text: 'Diagnóstico copiado.' });
    } catch {
      notify({ kind: 'error', text: 'Não foi possível copiar o diagnóstico.' });
    }
  };

  return (
    <>
      <SectionCard
        title="Diagnóstico"
        subtitle="Informações úteis para suporte e solução de problemas."
        icon="info"
        footer={
          <>
            <button type="button" className="sfo-btn" onClick={() => void copy()}>
              <Icon name="list" size={14} />
              Copiar diagnóstico
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--danger"
              onClick={() => void clearCache()}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Icon name="trash" size={14} />}
              Limpar cache local
            </button>
          </>
        }
      >
        <dl className="sfo-diagnostics">
          <dt>Versão</dt>
          <dd>{manifest.version}</dd>
          <dt>ID da extensão</dt>
          <dd>
            <code>{browser.runtime.id}</code>
          </dd>
          <dt>Permissões</dt>
          <dd>{permissions.join(', ') || '—'}</dd>
          <dt>Permissões opcionais</dt>
          <dd>{optional.join(', ') || '—'}</dd>
          <dt>Sites ativados</dt>
          <dd>{settings.allSites ? 'Todos os sites' : settings.activatedOrigins.join(', ') || 'Nenhum'}</dd>
          <dt>Quadro / lista padrão</dt>
          <dd>
            {settings.defaultBoardName || '—'} / {settings.defaultListName || '—'}
          </dd>
          <dt>Armazenamento</dt>
          <dd>
            Credenciais e preferências em <code>storage.local</code>; cache com TTL no mesmo local.
          </dd>
        </dl>
      </SectionCard>

      <SectionCard title="Links úteis" subtitle="Documentação, suporte e privacidade." icon="external">
        <div className="sfo-list">
          <div className="sfo-list-item">
            <Icon name="board" size={15} />
            <div className="sfo-list-item__main">
              <div className="sfo-list-item__title">Dashboard de prazos</div>
              <button
                type="button"
                className="sfo-btn sfo-btn--sm"
                style={{ marginTop: 6 }}
                onClick={() =>
                  void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') })
                }
              >
                Abrir dashboard
              </button>
            </div>
          </div>
          <div className="sfo-list-item">
            <Icon name="external" size={15} />
            <div className="sfo-list-item__main">
              <div className="sfo-list-item__title">Repositório no GitHub</div>
              <a
                className="sfo-list-item__meta"
                href="https://github.com/engleonardo/SEI"
                target="_blank"
                rel="noreferrer"
              >
                github.com/engleonardo/SEI
              </a>
            </div>
          </div>
          <div className="sfo-list-item">
            <Icon name="alert" size={15} />
            <div className="sfo-list-item__main">
              <div className="sfo-list-item__title">Reportar um problema</div>
              <a
                className="sfo-list-item__meta"
                href="https://github.com/engleonardo/SEI/issues"
                target="_blank"
                rel="noreferrer"
              >
                Abrir uma issue
              </a>
            </div>
          </div>
          <div className="sfo-list-item">
            <Icon name="info" size={15} />
            <div className="sfo-list-item__main">
              <div className="sfo-list-item__title">Política de privacidade</div>
              <a
                className="sfo-list-item__meta"
                href="https://github.com/engleonardo/SEI/blob/main/PRIVACY.md"
                target="_blank"
                rel="noreferrer"
              >
                Ler PRIVACY.md
              </a>
            </div>
          </div>
          <div className="sfo-list-item">
            <Icon name="board" size={15} />
            <div className="sfo-list-item__main">
              <div className="sfo-list-item__title">Chave e token do Trello</div>
              <a
                className="sfo-list-item__meta"
                href="https://trello.com/app-key"
                target="_blank"
                rel="noreferrer"
              >
                trello.com/app-key
              </a>
            </div>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
