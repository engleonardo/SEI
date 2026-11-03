import { useState } from 'react';
import type { Settings } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../../ui/icons';
import { ConfirmDialog } from '../../../ui/components/Modal';
import { SectionCard, Spinner, type Notice } from './shared';

interface BackupPreview {
  data: unknown;
  exportedAt: number | null;
  rules: number;
  board: string;
  list: string;
  sites: string[];
  allSites: boolean;
  credentials: boolean;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Lê o envelope do backup sem alterar nada. A validação profunda continua no
 * background (`importBackup`), que também reconcilia permissões e credenciais.
 */
function parseBackup(text: string): BackupPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON inválido. Confira o conteúdo colado ou o arquivo selecionado.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup inválido. Use um arquivo gerado pelo SEI Flow.');
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope.app !== 'sei-flow') {
    throw new Error('Backup inválido. Use um arquivo gerado pelo SEI Flow.');
  }
  if (envelope.kind !== undefined && envelope.kind !== 'settings-backup') {
    throw new Error('Este arquivo não é um backup de configurações do SEI Flow.');
  }
  if (envelope.version !== undefined && envelope.version !== 1) {
    throw new Error('Versão de backup não suportada. Atualize o SEI Flow.');
  }
  if (!envelope.settings || typeof envelope.settings !== 'object') {
    throw new Error('O backup não contém configurações.');
  }

  const settings = envelope.settings as Record<string, unknown>;
  const rules = Array.isArray(envelope.rules) ? envelope.rules.length : 0;
  const origins = Array.isArray(settings.activatedOrigins)
    ? settings.activatedOrigins.filter((origin): origin is string => typeof origin === 'string')
    : [];

  return {
    data: envelope,
    exportedAt: typeof envelope.exportedAt === 'number' ? envelope.exportedAt : null,
    rules,
    board: asString(settings.defaultBoardName),
    list: asString(settings.defaultListName),
    sites: origins,
    allSites: settings.allSites === true,
    credentials: Boolean(asString(settings.appKey)),
  };
}

function previewLines(preview: BackupPreview, importRules: boolean): string[] {
  return [
    preview.exportedAt
      ? `Exportado em ${new Date(preview.exportedAt).toLocaleString('pt-BR')}.`
      : 'Backup sem data de exportação.',
    `Quadro/lista: ${preview.board || '(não configurado)'} / ${preview.list || '(não configurada)'}.`,
    preview.allSites
      ? 'Sites: todos os sites.'
      : `Sites: ${preview.sites.length ? preview.sites.join(', ') : 'nenhum'}.`,
    `Regras: ${preview.rules}${preview.rules > 0 && !importRules ? ' (as atuais serão mantidas)' : ''}.`,
    preview.credentials
      ? 'Credenciais do Trello: incluídas no backup.'
      : 'Credenciais do Trello: não incluídas (as atuais serão mantidas).',
  ];
}

export function BackupSection({
  settings,
  notify,
}: {
  settings: Settings;
  notify: (notice: Notice) => void;
}) {
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [includeRules, setIncludeRules] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importRules, setImportRules] = useState(true);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const exportSettings = async (mode: 'clipboard' | 'file') => {
    setExporting(true);
    try {
      const backup = await callRpc('settings:export', { includeCredentials, includeRules });
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
    } finally {
      setExporting(false);
    }
  };

  const prepareImport = () => {
    if (!importText.trim()) {
      notify({ kind: 'error', text: 'Cole o conteúdo do backup ou selecione um arquivo.' });
      return;
    }
    try {
      setPreview(parseBackup(importText));
    } catch (cause) {
      setPreview(null);
      notify({ kind: 'error', text: errorMessage(cause) });
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const result = await callRpc('settings:import', { data: preview.data, importRules });
      setPreview(null);
      notify({
        kind: 'success',
        text: `Configurações importadas${result.rules ? ` com ${result.rules} regra(s)` : ''}. Recarregando a página…`,
      });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <SectionCard
        title="Exportar configurações"
        subtitle="Gere um backup para levar regras, destino, sites e preferências a outro navegador ou computador."
        icon="download"
        footer={
          <div className="sfo-actions">
            <button
              type="button"
              className="sfo-btn"
              onClick={() => void exportSettings('clipboard')}
              disabled={exporting}
            >
              {exporting ? <Spinner /> : <Icon name="list" size={14} />}
              Copiar JSON
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--primary"
              onClick={() => void exportSettings('file')}
              disabled={exporting}
            >
              {exporting ? <Spinner /> : <Icon name="download" size={14} />}
              Baixar arquivo .json
            </button>
          </div>
        }
      >
        <p className="sfo-hint" style={{ margin: 0 }}>
          O backup inclui quadro/lista padrão, sites autorizados, tema, notificações, atualização automática
          e, se marcado, <strong>todas as regras na ordem atual</strong>. Os dados de cartões e processos não
          entram no arquivo.
        </p>

        <div className="sfo-backup-summary">
          <span>
            <strong>Quadro:</strong> {settings.defaultBoardName || 'não configurado'}
          </span>
          <span>
            <strong>Lista:</strong> {settings.defaultListName || 'não configurada'}
          </span>
          <span>
            <strong>Sites:</strong>{' '}
            {settings.allSites ? 'todos' : settings.activatedOrigins.length || 'nenhum'}
          </span>
          <span>
            <strong>Tema:</strong>{' '}
            {settings.theme === 'dark' ? 'escuro' : settings.theme === 'auto' ? 'automático' : 'claro'}
          </span>
        </div>

        <label className="sfo-toggle-row">
          <input
            type="checkbox"
            checked={includeRules}
            onChange={(event) => setIncludeRules(event.target.checked)}
          />
          <div className="sfo-toggle-row__body">
            <div className="sfo-toggle-row__title">Incluir regras automáticas</div>
            <div className="sfo-toggle-row__text">
              Leva todas as regras, na ordem atual, junto com as demais configurações.
            </div>
          </div>
        </label>

        <label className="sfo-toggle-row">
          <input
            type="checkbox"
            checked={includeCredentials}
            onChange={(event) => setIncludeCredentials(event.target.checked)}
          />
          <div className="sfo-toggle-row__body">
            <div className="sfo-toggle-row__title">Incluir credenciais do Trello</div>
            <div className="sfo-toggle-row__text">
              A APP-KEY e o TOKEN vão junto no arquivo/cópia. Use apenas em local seguro e evite compartilhar
              o backup.
            </div>
          </div>
        </label>
      </SectionCard>

      <SectionCard
        title="Importar configurações"
        subtitle="Restaure um backup gerado pelo SEI Flow. As configurações atuais serão substituídas."
        icon="upload"
        footer={
          <div className="sfo-actions">
            <button
              type="button"
              className="sfo-btn sfo-btn--primary"
              onClick={prepareImport}
              disabled={!importText.trim() || importing}
            >
              <Icon name="check" size={14} />
              Revisar importação
            </button>
            <span className="sfo-hint">
              As permissões de site precisam ser concedidas novamente pelo navegador.
            </span>
          </div>
        }
      >
        <div className="sfo-field">
          <label htmlFor="sfo-backup-file">Arquivo JSON</label>
          <input
            id="sfo-backup-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => {
                setImportText(text);
                setPreview(null);
              });
            }}
          />
        </div>

        <div className="sfo-field">
          <label htmlFor="sfo-backup-text">Ou cole o conteúdo do backup</label>
          <textarea
            id="sfo-backup-text"
            className="sfo-input"
            style={{ minHeight: 130, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setPreview(null);
            }}
            placeholder="Cole aqui o JSON gerado em Exportar configurações."
          />
        </div>

        <label className="sfo-toggle-row">
          <input
            type="checkbox"
            checked={importRules}
            onChange={(event) => setImportRules(event.target.checked)}
          />
          <div className="sfo-toggle-row__body">
            <div className="sfo-toggle-row__title">Importar as regras do backup</div>
            <div className="sfo-toggle-row__text">
              Desmarque para trocar apenas as configurações e manter as regras atuais.
            </div>
          </div>
        </label>

        {preview && (
          <div className="sfo-backup-preview">
            <strong>Confira o que será importado</strong>
            <ul>
              {previewLines(preview, importRules).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {preview && (
        <ConfirmDialog
          title="Importar configurações"
          message={`${previewLines(preview, importRules).join(' ')} As configurações atuais serão substituídas. Deseja continuar?`}
          confirmLabel="Importar"
          busy={importing}
          onConfirm={() => void confirmImport()}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
