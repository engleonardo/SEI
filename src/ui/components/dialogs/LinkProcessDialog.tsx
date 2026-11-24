import { useState } from 'react';
import type { TrelloCard } from '../../../core/domain/types';
import type { ProcessCatalog } from '../../../core/storage/processes';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { ErrorState, Spinner } from '../common';
import { Modal } from '../Modal';

export function LinkProcessDialog({
  card,
  catalog,
  onClose,
  onChanged,
}: {
  card: TrelloCard;
  catalog: ProcessCatalog;
  onClose: () => void;
  onChanged: (card: TrelloCard) => void;
}) {
  const [processNumber, setProcessNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestions = Object.keys(catalog)
    .sort((a, b) => b.localeCompare(a, 'pt-BR'))
    .slice(0, 30);

  const submit = async () => {
    const value = processNumber.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const results = await callRpc('trello:link-cards', {
        cardIds: [card.id],
        processNumber: value,
      });
      const result = results[0];
      if (!result || result.status === 'error') {
        setError(result?.message ?? 'Não foi possível vincular o cartão.');
        return;
      }
      if (result.card) onChanged(result.card);
      showToast('Cartão vinculado ao processo.', 'success');
      onClose();
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Vincular processo"
      subtitle={card.name}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="sf-btn sf-btn--primary"
            onClick={() => void submit()}
            disabled={busy || !processNumber.trim()}
          >
            {busy ? <Spinner /> : <Icon name="link" size={14} />}
            Vincular
          </button>
        </>
      }
    >
      <div className="sf-field">
        <label htmlFor="sdo-link-process">Número do processo</label>
        <input
          id="sdo-link-process"
          className="sf-input"
          list="sdo-link-process-options"
          value={processNumber}
          onChange={(event) => setProcessNumber(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="00000.000000/0000-00"
          autoFocus
          disabled={busy}
        />
        <datalist id="sdo-link-process-options">
          {suggestions.map((number) => (
            <option key={number} value={number} />
          ))}
        </datalist>
        <span className="sf-hint">
          O vínculo é gravado na descrição como <code>SEI {processNumber.trim() || 'número'}</code>.
          Se o processo já estiver na lista do SEI, ele aparece como sugestão.
        </span>
      </div>
      {error && <ErrorState message={error} />}
    </Modal>
  );
}
