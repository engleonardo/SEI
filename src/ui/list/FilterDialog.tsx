import type { TrelloLabel } from '../../core/domain/types';
import { activeFilterCount, type ListFilters } from '../filters';
import { Icon } from '../icons';
import { classNames } from '../utils';
import { Modal } from '../components/Modal';

export interface FilterDialogProps {
  filters: ListFilters;
  labels: TrelloLabel[];
  locations: Array<{ key: string; label: string }>;
  onChange: (patch: Partial<ListFilters>) => void;
  onClose: () => void;
}

export function FilterDialog({ filters, labels, locations, onChange, onClose }: FilterDialogProps) {
  const toggleLabel = (labelId: string) => {
    const next = filters.labelIds.includes(labelId)
      ? filters.labelIds.filter((id) => id !== labelId)
      : [...filters.labelIds, labelId];
    onChange({ labelIds: next });
  };

  const toggleLocation = (key: string) => {
    const next = filters.locations.includes(key)
      ? filters.locations.filter((item) => item !== key)
      : [...filters.locations, key];
    onChange({ locations: next });
  };

  const clear = () =>
    onChange({
      noCard: false,
      due: 'any',
      labelIds: [],
      locations: [],
    });

  return (
    <Modal
      title="Filtros"
      subtitle="Refine os processos exibidos na lista"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="sf-modal__footer-left">{activeFilterCount(filters)} ativo(s)</span>
          <button type="button" className="sf-btn" onClick={clear}>
            Limpar
          </button>
          <button type="button" className="sf-btn sf-btn--primary" onClick={onClose}>
            Aplicar
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="sf-field" style={{ paddingBottom: 10 }}>
          <label htmlFor="sf-filter-search">Buscar processo ou cartão</label>
          <input
            id="sf-filter-search"
            className="sf-input"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Número, especificação ou nome do cartão…"
          />
        </div>

        <div className="sf-filter-group">
          <h3 className="sf-filter-group__title">Situação</h3>
          <div className="sf-filter-options">
            <button
              type="button"
              className={classNames('sf-filter-option', filters.noCard && 'sf-filter-option--active')}
              onClick={() => onChange({ noCard: !filters.noCard })}
              aria-pressed={filters.noCard}
            >
              <Icon name={filters.noCard ? 'check' : 'plus'} size={12} />
              Sem cartão
            </button>
            <button
              type="button"
              className={classNames(
                'sf-filter-option',
                filters.due === 'overdue' && 'sf-filter-option--active',
              )}
              onClick={() => onChange({ due: filters.due === 'overdue' ? 'any' : 'overdue' })}
              aria-pressed={filters.due === 'overdue'}
            >
              <Icon name="clock" size={12} />
              Atrasados
            </button>
            <button
              type="button"
              className={classNames(
                'sf-filter-option',
                filters.due === 'withDue' && 'sf-filter-option--active',
              )}
              onClick={() => onChange({ due: filters.due === 'withDue' ? 'any' : 'withDue' })}
              aria-pressed={filters.due === 'withDue'}
            >
              <Icon name="calendar" size={12} />
              Com prazo
            </button>
          </div>
        </div>

        {labels.length > 0 && (
          <div className="sf-filter-group">
            <h3 className="sf-filter-group__title">Etiquetas nos cartões</h3>
            <div className="sf-filter-options">
              {labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  className={classNames(
                    'sf-filter-option',
                    filters.labelIds.includes(label.id) && 'sf-filter-option--active',
                  )}
                  onClick={() => toggleLabel(label.id)}
                  aria-pressed={filters.labelIds.includes(label.id)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: label.color ? 'var(--sf-accent)' : 'var(--sf-muted)',
                    }}
                  />
                  {label.name || label.color || 'Etiqueta'}
                </button>
              ))}
            </div>
          </div>
        )}

        {locations.length > 0 && (
          <div className="sf-filter-group">
            <h3 className="sf-filter-group__title">Quadro / lista</h3>
            <div className="sf-filter-options">
              {locations.map((location) => (
                <button
                  key={location.key}
                  type="button"
                  className={classNames(
                    'sf-filter-option',
                    filters.locations.includes(location.key) && 'sf-filter-option--active',
                  )}
                  onClick={() => toggleLocation(location.key)}
                  aria-pressed={filters.locations.includes(location.key)}
                >
                  <Icon name="board" size={12} />
                  {location.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
