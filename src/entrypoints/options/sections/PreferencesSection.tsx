import { useEffect, useState } from 'react';
import type { Settings, ThemePreference } from '../../../core/domain/types';
import { Icon } from '../../../ui/icons';
import { setThemePreference } from '../../../ui/theme';
import { SectionCard, Spinner, type Notice } from './shared';

export function PreferencesSection({
  settings,
  save,
  notify,
}: {
  settings: Settings;
  save: (patch: Partial<Settings>) => Promise<Settings>;
  notify: (notice: Notice) => void;
}) {
  const [theme, setTheme] = useState<ThemePreference>(settings.theme);
  const [compact, setCompact] = useState(settings.compact);
  const [notifications, setNotifications] = useState(settings.notificationsEnabled);
  const [autoRefresh, setAutoRefresh] = useState(String(settings.autoRefreshMinutes));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTheme(settings.theme);
    setCompact(settings.compact);
    setNotifications(settings.notificationsEnabled);
    setAutoRefresh(String(settings.autoRefreshMinutes));
  }, [settings]);

  const dirty =
    theme !== settings.theme ||
    compact !== settings.compact ||
    notifications !== settings.notificationsEnabled ||
    Number(autoRefresh) !== settings.autoRefreshMinutes;

  const savePreferences = async () => {
    const minutes = Math.max(0, Math.min(120, Number(autoRefresh) || 0));
    setBusy(true);
    try {
      await save({
        theme,
        compact,
        notificationsEnabled: notifications,
        autoRefreshMinutes: minutes,
      });
      notify({ kind: 'success', text: 'Preferências salvas.' });
    } catch (cause) {
      notify({ kind: 'error', text: cause instanceof Error ? cause.message : 'Erro ao salvar.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Preferências da interface"
      subtitle="Ajustes visuais e de sincronização do SEI Flow."
      icon="tag"
      footer={
        <>
          <button
            type="button"
            className="sfo-btn sfo-btn--primary"
            onClick={() => void savePreferences()}
            disabled={busy || !dirty}
          >
            {busy ? <Spinner /> : <Icon name="check" size={14} />}
            Salvar preferências
          </button>
          <span style={{ flex: 1 }} />
          <span className="sfo-hint">Aplicado ao recarregar as páginas do SEI.</span>
        </>
      }
    >
      <div className="sfo-grid-2">
        <div className="sfo-field">
          <label htmlFor="sfo-theme">Tema</label>
          <select
            id="sfo-theme"
            className="sfo-select"
            value={theme === 'dark' ? 'dark' : 'light'}
            onChange={(event) => {
              const next = event.target.value as ThemePreference;
              setTheme(next);
              setThemePreference(next);
              void save({ theme: next })
                .then(() => notify({ kind: 'success', text: 'Tema atualizado.' }))
                .catch((cause) => {
                  setTheme(settings.theme);
                  setThemePreference(settings.theme);
                  notify({
                    kind: 'error',
                    text: cause instanceof Error ? cause.message : 'Erro ao salvar o tema.',
                  });
                });
            }}
          >
            <option value="light">Claro (padrão)</option>
            <option value="dark">Escuro</option>
          </select>
          <span className="sfo-hint">
            Aplicado ao painel, a estas opções e aos painéis dentro do SEI, sem alterar o SEI.
          </span>
        </div>

        <div className="sfo-field">
          <label htmlFor="sfo-refresh">Atualização automática (minutos)</label>
          <input
            id="sfo-refresh"
            className="sfo-input"
            type="number"
            min={0}
            max={120}
            value={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.value)}
          />
          <span className="sfo-hint">
            Use <code>0</code> para atualizar apenas manualmente. Valores maiores reduzem o consumo
            da API do Trello.
          </span>
        </div>
      </div>

      <label className="sfo-toggle-row">
        <input
          type="checkbox"
          checked={compact}
          onChange={(event) => setCompact(event.target.checked)}
        />
        <span className="sfo-toggle-row__body">
          <span className="sfo-toggle-row__title">Cartões compactos na lista de processos</span>
          <span className="sfo-toggle-row__text">
            Mostra os cartões em versão reduzida abaixo de cada processo, com ações por ícone.
            Desmarque para usar cartões completos também na lista.
          </span>
        </span>
      </label>

      <label className="sfo-toggle-row">
        <input
          type="checkbox"
          checked={notifications}
          onChange={(event) => setNotifications(event.target.checked)}
        />
        <span className="sfo-toggle-row__body">
          <span className="sfo-toggle-row__title">Notificações de prazos</span>
          <span className="sfo-toggle-row__text">
            Envia um aviso por dia quando houver cartões atrasados ou vencendo hoje.
          </span>
        </span>
      </label>
    </SectionCard>
  );
}
