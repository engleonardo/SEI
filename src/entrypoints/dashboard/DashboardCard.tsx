import type { TrelloCard } from '../../core/domain/types';
import type { ProcessCatalog } from '../../core/storage/processes';
import { Icon } from '../../ui/icons';
import {
  classNames,
  formatDue,
  labelColorHex,
  labelTextColor,
  locationLabel,
} from '../../ui/utils';
import {
  cardHasUnreadProcess,
  formatActivity,
  processRecordsFor,
  processTypesFor,
} from './model';

export interface DashboardCardProps {
  card: TrelloCard;
  catalog: ProcessCatalog;
  onEdit: () => void;
  onToggleLabel: (labelId: string) => void;
}

export function DashboardCard({ card, catalog, onEdit, onToggleLabel }: DashboardCardProps) {
  const due = formatDue(card.due, card.dueComplete);
  const unread = cardHasUnreadProcess(card, catalog);
  const types = processTypesFor(card, catalog);
  const activity = formatActivity(card);
  const processes = processRecordsFor(card, catalog);
  const processByNumber = new Map(processes.map((process) => [process.number, process]));

  return (
    <article className={classNames('sdo-card', unread && 'sdo-card--unread')}>
      <div className="sdo-card__main">
        <div className="sdo-card__title-row">
          <h3>{card.name}</h3>
          {unread && (
            <span className="sdo-badge sdo-badge--danger" title="Processo atualizado no SEI">
              <Icon name="alert" size={11} />
              Atualizado
            </span>
          )}
          {card.hasChecklist && (
            <span className="sdo-badge" title="Possui checklist">
              <Icon name="checklist" size={11} />
              Checklist
            </span>
          )}
        </div>

        {card.labels.length > 0 && (
          <div className="sdo-card__labels">
            {card.labels.map((label) => (
              <button
                type="button"
                key={label.id}
                className="sdo-label"
                style={{
                  backgroundColor: labelColorHex(label.color),
                  color: labelTextColor(label.color),
                }}
                onClick={() => onToggleLabel(label.id)}
                title={`Filtrar por ${label.name || label.color || 'etiqueta'}`}
              >
                {label.name || label.color || 'Etiqueta'}
              </button>
            ))}
          </div>
        )}

        {card.description && <p className="sdo-card__desc">{card.description}</p>}

        <div className="sdo-card__meta">
          <span>
            <Icon name="board" size={12} /> {locationLabel(card)}
          </span>

          {card.links.map((processNumber) => {
            const record = processByNumber.get(processNumber);
            const label = (
              <>
                <Icon name="link" size={11} /> {processNumber}
              </>
            );
            return record?.url ? (
              <a
                key={processNumber}
                className="sdo-process"
                href={record.url}
                target="_blank"
                rel="noreferrer"
                title={record.specification || 'Abrir processo no SEI'}
              >
                {label}
                <Icon name="external" size={10} />
              </a>
            ) : (
              <span key={processNumber} className="sdo-process" title="Abra a lista do SEI para registrar o link">
                {label}
              </span>
            );
          })}

          {types.map((type) => (
            <span key={type} className="sdo-type">
              <Icon name="tag" size={11} /> {type}
            </span>
          ))}

          {activity && (
            <span title={card.lastActivity ? new Date(card.lastActivity).toLocaleString('pt-BR') : ''}>
              <Icon name="clock" size={11} /> Atualizado {activity}
            </span>
          )}
        </div>
      </div>

      <div className="sdo-card__side">
        {due && (
          <span
            className={classNames(
              'sdo-pill',
              due.tone === 'danger' && 'sdo-pill--danger',
              due.tone === 'warning' && 'sdo-pill--warning',
              due.tone === 'success' && 'sdo-pill--success',
              due.tone === 'neutral' && 'sdo-pill--neutral',
            )}
          >
            <Icon name="calendar" size={11} />
            {due.label}
          </span>
        )}
        <div className="sdo-card__side-actions">
          <button type="button" className="sfo-btn sfo-btn--sm" onClick={onEdit}>
            <Icon name="edit" size={13} />
            Detalhes
          </button>
          <a
            className="sfo-btn sfo-btn--sm sfo-btn--ghost"
            href={card.shortUrl}
            target="_blank"
            rel="noreferrer"
            title="Abrir no Trello"
          >
            <Icon name="external" size={13} />
            Trello
          </a>
        </div>
      </div>
    </article>
  );
}
