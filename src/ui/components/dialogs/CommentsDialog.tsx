import { useEffect, useState } from 'react';
import type { TrelloCard, TrelloComment } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { CardDescription } from '../CardDescription';
import { ErrorState, Spinner } from '../common';
import { Modal } from '../Modal';

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function CommentsDialog({
  card,
  onClose,
  onChanged,
}: {
  card: TrelloCard;
  onClose: () => void;
  onChanged?: (card: TrelloCard) => void;
}) {
  const [comments, setComments] = useState<TrelloComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    callRpc('trello:card-comments', { cardId: card.id })
      .then((value) => {
        if (active) setComments(value);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.id]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const comment = await callRpc('trello:add-comment', { cardId: card.id, text });
      setComments((previous) => [...previous, comment]);
      setDraft('');
      if (onChanged) {
        void callRpc('trello:card', { cardId: card.id })
          .then(onChanged)
          .catch(() => undefined);
      }
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const ordered = [...comments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Modal
      title="Comentários"
      subtitle={card.name}
      onClose={onClose}
      footer={
        <button type="button" className="sf-btn" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className="sf-comments">
        <div className="sf-comments__compose">
          <textarea
            className="sf-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={8000}
            placeholder="Escreva um comentário… (Ctrl+Enter envia)"
            aria-label="Novo comentário"
            disabled={busy}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            style={{ resize: 'vertical' }}
          />
          <div className="sf-comments__compose-actions">
            <span className="sf-hint">{draft.length}/8000</span>
            <button
              type="button"
              className="sf-btn sf-btn--sm sf-btn--primary"
              onClick={() => void submit()}
              disabled={busy || !draft.trim()}
            >
              {busy ? <Spinner /> : <Icon name="plus" size={13} />}
              Comentar
            </button>
          </div>
        </div>

        {error && <ErrorState message={error} />}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <span className="sf-hint">Carregando comentários…</span>
          </div>
        ) : ordered.length === 0 ? (
          <span className="sf-hint">Nenhum comentário neste cartão ainda.</span>
        ) : (
          <div className="sf-comments__list">
            {ordered.map((comment) => (
              <article key={comment.id} className="sf-comments__item">
                <span className="sf-comments__avatar" aria-hidden="true">
                  {comment.author?.initials?.slice(0, 2).toUpperCase() ||
                    comment.author?.fullName?.slice(0, 2).toUpperCase() ||
                    '?'}
                </span>
                <div className="sf-comments__body">
                  <header className="sf-comments__head">
                    <strong>{comment.author?.fullName ?? 'Membro'}</strong>
                    <span className="sf-comments__date">{formatCommentDate(comment.date)}</span>
                  </header>
                  <div className="sf-comments__text">
                    <CardDescription text={comment.text} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
