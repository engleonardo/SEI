import type { Settings } from '../../../core/domain/types';
import { Icon } from '../../../ui/icons';

/**
 * Guia pós-login: mostra o que falta para o SEI Flow funcionar no SEI
 * e leva direto para a aba certa. Some quando tudo está configurado.
 */
export function SetupChecklist({
  settings,
  connected,
  sitePermission,
  onActivateSites,
  onGo,
}: {
  settings: Settings;
  connected: boolean;
  sitePermission: boolean | null;
  onActivateSites: () => Promise<boolean>;
  onGo: (tab: 'connection' | 'destination' | 'sites') => void;
}) {
  if (!connected) return null;

  const destinationDone = Boolean(settings.defaultBoardId && settings.defaultListId);
  const siteDone =
    settings.allSites ||
    (settings.autoSeiHosts && sitePermission === true) ||
    settings.activatedOrigins.length > 0;

  const steps = [
    {
      id: 'destination' as const,
      label: 'Escolher o quadro e a lista padrão',
      done: destinationDone,
      action: 'Escolher destino',
      run: () => onGo('destination'),
    },
    {
      id: 'sites' as const,
      label: 'Ativar o site do SEI',
      done: siteDone,
      action: 'Ativar site',
      run: () => {
        void onActivateSites();
      },
    },
  ];

  const doneCount = 1 + steps.filter((step) => step.done).length;
  const pending = steps.filter((step) => !step.done);
  if (pending.length === 0) return null;

  return (
    <div className="sfo-onboarding">
      <span className="sfo-logo" style={{ width: 36, height: 36, borderRadius: 10 }}>
        <Icon name="arrowRight" size={18} />
      </span>
      <div className="sfo-onboarding__body">
        <p className="sfo-onboarding__title">Concluir configuração ({doneCount} de 3)</p>
        <ul className="sfo-setup-list">
          <li className="sfo-setup-list__item sfo-setup-list__item--done">
            <Icon name="check" size={13} />
            Conectar ao Trello
          </li>
          {steps.map((step) => (
            <li
              key={step.id}
              className={`sfo-setup-list__item${step.done ? ' sfo-setup-list__item--done' : ''}`}
            >
              <Icon name={step.done ? 'check' : 'arrowRight'} size={13} />
              {step.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="sfo-setup-actions">
        {pending.map((step) => (
          <button
            key={step.id}
            type="button"
            className="sfo-btn sfo-btn--primary"
            onClick={step.run}
          >
            {step.action}
          </button>
        ))}
      </div>
    </div>
  );
}
