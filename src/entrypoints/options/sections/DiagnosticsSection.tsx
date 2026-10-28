import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { openDashboard } from '../../../core/messaging/actions';
import { Icon } from '../../../ui/icons';
import { ConfirmDialog } from '../../../ui/components/Modal';
import { SectionCard, Spinner, type Notice } from './shared';

export function DiagnosticsSection({
  settings,
  notify,
}: {
  settings: Settings;
  notify: (notice: Notice) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ data: unknown; rules: number } | null>(
    null,
  );
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

  const exportSettings = async (mode: 'clipboard' | 'file') => {
    try {
      const backup = await callRpc('settings:export', { includeCredentials });
      const json = JSON.stringify(backup, null, 2);

      if (mode === 'clipboard') {
        await navigator.clipboard.writeText(json);
        notify({ kind: 'success', text: 'Configurações copiadas para a área de transferência.' });
        return;
      }

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sei-flow-config-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify({ kind: 'success', text: 'Arquivo de configurações gerado.' });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    }
  };

  const prepareImport = () => {
    if (!importText.trim()) {
      notify({ kind: 'error', text: 'Cole o conteúdo do backup ou selecione um arquivo.' });
      return;
    }
    try {
      const parsed = JSON.parse(importText) as { app?: string; rules?: unknown[] };
      if (parsed.app !== 'sei-flow') {
        notify({ kind: 'error', text: 'Backup inválido. Use um arquivo gerado pelo SEI Flow.' });
        return;
      }
      const rules = Array.isArray(parsed.rules) ? parsed.rules.length : 0;
      setPendingImport({ data: parsed, rules });
    } catch {
      notify({ kind: 'error', text: 'JSON inválido. Confira o conteúdo colado.' });
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const result = await callRpc('settings:import', { data: pendingImport.data });
      setPendingImport(null);
      notify({
        kind: 'success',
        text: `Configurações importadas (${result.rules} regras). Recarregando a página…`,
      });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setImporting(false);
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

      <SectionCard
        title="Backup das configurações"
        subtitle="Leve regras, destino, preferências e sites para outro computador."
        icon="link"
      >
        <label className="sfo-toggle-row">
          <input
            type="checkbox"
            checked={includeCredentials}
            onChange={(event) => setIncludeCredentials(event.target.checked)}
          />
          <div className="sfo-toggle-row__body">
            <div className="sfo-toggle-row__title">Incluir credenciais do Trello</div>
            <div className="sfo-toggle-row__text">
              A APP-KEY e o TOKEN vão junto no arquivo/cópia. Use apenas em local seguro.
            </div>
          </div>
        </label>

        <div className="sfo-actions">
          <button type="button" className="sfo-btn" onClick={() => void exportSettings('clipboard')}>
            <Icon name="list" size={14} />
            Copiar configurações
          </button>
          <button type="button" className="sfo-btn" onClick={() => void exportSettings('file')}>
            <Icon name="external" size={14} />
            Baixar arquivo .json
          </button>
        </div>

        <div className="sfo-field">
          <label htmlFor="sfo-backup-import">Importar backup</label>
          <input
            id="sfo-backup-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => setImportText(text));
            }}
          />
          <textarea
            id="sfo-backup-import"
            className="sfo-input"
            style={{ minHeight: 96, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Cole aqui o conteúdo do backup ou selecione o arquivo acima."
          />
        </div>

        <div className="sfo-actions">
          <button
            type="button"
            className="sfo-btn sfo-btn--primary"
            onClick={prepareImport}
            disabled={!importText.trim()}
          >
            <Icon name="check" size={14} />
            Importar configurações
          </button>
          <span className="sfo-hint">
            Substitui regras, destino, preferências e sites. As permissões de site precisam ser
            concedidas novamente no navegador.
          </span>
        </div>
      </SectionCard>

      {pendingImport && (
        <ConfirmDialog
          title="Importar configurações"
          message={`Serão substituídas as configurações atuais e ${pendingImport.rules} regra(s) serão importadas. Deseja continuar?`}
          confirmLabel="Importar"
          busy={importing}
          onConfirm={() => void confirmImport()}
          onClose={() => setPendingImport(null)}
        />
      )}
    </>
  );
}
