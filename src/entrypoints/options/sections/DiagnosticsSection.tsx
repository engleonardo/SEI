import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { openDashboard } from '../../../core/messaging/actions';
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
          <dd>{permissions.join(', ') || '-'}</dd>
          <dt>Permissões opcionais</dt>
          <dd>{optional.join(', ') || '-'}</dd>
          <dt>Sites ativados</dt>
          <dd>{settings.allSites ? 'Todos os sites' : settings.activatedOrigins.join(', ') || 'Nenhum'}</dd>
          <dt>Quadro / lista padrão</dt>
          <dd>
            {settings.defaultBoardName || '-'} / {settings.defaultListName || '-'}
          </dd>
          <dt>Armazenamento</dt>
          <dd>
            Credenciais e preferências em <code>storage.local</code>; cache com TTL no mesmo local.
          </dd>
        </dl>
      </SectionCard>

      <SectionCard title="Links úteis" subtitle="Documentação, suporte e privacidade." icon="external">
        <div className="sfo-links">
          <button type="button" className="sfo-link" onClick={() => void openDashboard()}>
            <Icon name="board" size={13} />
            Abrir dashboard
          </button>
          <a
            className="sfo-link"
            href="https://github.com/engleonardo/SEI/issues"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="alert" size={13} />
            Reportar um problema
          </a>
          <a
            className="sfo-link"
            href="https://github.com/engleonardo/SEI/blob/main/PRIVACY.md"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="info" size={13} />
            Privacidade
          </a>
          <a className="sfo-link" href="https://trello.com/app-key" target="_blank" rel="noreferrer">
            <Icon name="settings" size={13} />
            Chave e token do Trello
          </a>
        </div>
      </SectionCard>
    </>
  );
}
