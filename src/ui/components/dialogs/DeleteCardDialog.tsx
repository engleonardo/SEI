import { useEffect, useState } from 'react';
import type { TrelloCard } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { Modal } from '../Modal';
import { Spinner } from '../common';

interface MirrorGroup {
  cardIds: string[];
}

export function DeleteCardDialog({
  card,
  onClose,
  onDeleted,
}: {
  card: TrelloCard;
  onClose: () => void;
  onDeleted: (cardIds: string[]) => void;
}) {
  const [group, setGroup] = useState<MirrorGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    callRpc('mirrors:status', { cardId: card.id })
      .then((value) => {
        if (active) setGroup(value);
      })
      .catch(() => {
        if (active) setGroup(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.id]);

  const remove = async (deleteMirrors: boolean) => {
    setBusy(true);
    try {
      const ids = deleteMirrors && group ? group.cardIds : [card.id];
      await callRpc('trello:delete-card', { cardId: card.id, deleteMirrors });
      onDeleted(ids);
      showToast(
        deleteMirrors ? 'Cartões do espelho excluídos.' : 'Cartão excluído.',
        'success',
      );
      onClose();
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const mirrored = Boolean(group && group.cardIds.length > 1);

  return (
    <Modal
      title={mirrored ? 'Excluir cartão espelhado' : 'Excluir cartão'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          {mirrored && (
            <button
              type="button"
              className="sf-btn"
              onClick={() => void remove(false)}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Icon name="trash" size={13} />}
              Só este
            </button>
          )}
          <button
            type="button"
            className="sf-btn sf-btn--danger"
            onClick={() => void remove(mirrored)}
            disabled={busy || loading}
          >
            {busy ? <Spinner /> : <Icon name="trash" size={13} />}
            {mirrored ? 'Todos os espelhos' : 'Excluir do Trello'}
          </button>
        </>
      }
    >
      {loading ? (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Spinner /> Verificando espelhos…
        </p>
      ) : mirrored && group ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, color: 'var(--sf-text-soft)', fontSize: 13.5 }}>
            Este cartão está espelhado com {group.cardIds.length - 1} outro(s) cartão(ões).
          </p>
          <p style={{ margin: 0, color: 'var(--sf-text-soft)', fontSize: 13.5 }}>
            Você pode excluir apenas este ou todos os cartões do espelho. A exclusão vai para a
            lixeira do Trello.
          </p>
        </div>
      ) : (
        <p style={{ margin: 0, color: 'var(--sf-text-soft)', fontSize: 13.5 }}>
          O cartão será movido para a lixeira do Trello e removido deste painel.
        </p>
      )}
    </Modal>
  );
}
