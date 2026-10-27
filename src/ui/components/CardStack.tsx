import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TrelloCard } from '../../core/domain/types';
import { BrandMark } from '../BrandMark';
import { Icon } from '../icons';
import { CardItem } from './CardItem';
import { EmptyState, ErrorState } from './common';
import { CreateCardDialog } from './CreateCardDialog';
import { LinkCardsDialog } from './LinkCardsDialog';

export interface CardStackProps {
  processNumber: string;
  cards: TrelloCard[];
  loading?: boolean;
  error?: string | null;
  errorExtra?: ReactNode;
  showHeader?: boolean;
  compact?: boolean;
  highlight?: boolean;
  onReload: () => void;
  onChanged: (card: TrelloCard) => void;
  onRemoved: (cardId: string) => void;
  onAdded: (cards: TrelloCard[]) => void;
}

export function CardStack({
  processNumber,
  cards,
  loading = false,
  error = null,
  errorExtra,
  showHeader = false,
  compact = false,
  highlight = false,
  onReload,
  onChanged,
  onRemoved,
  onAdded,
}: CardStackProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showLink, setShowLink] = useState(false);

  return (
    <div className="sf-stack">
      {showHeader && (
        <div className="sf-stack__head">
          <h3 className="sf-stack__title">
            <BrandMark size={18} />
            SEI Flow
            <span className="sf-stack__count">
              {loading ? '· carregando' : `· ${cards.length} ${cards.length === 1 ? 'cartão' : 'cartões'}`}
            </span>
          </h3>
          <span className="sf-stack__spacer" />
          <button
            type="button"
            className="sf-btn sf-btn--sm"
            onClick={() => setShowCreate(true)}
            title="Criar cartão no Trello"
          >
            <Icon name="plus" size={13} />
            Novo cartão
          </button>
          <button
            type="button"
            className="sf-btn sf-btn--sm"
            onClick={() => setShowLink(true)}
            title="Vincular cartões existentes do Trello"
          >
            <Icon name="link" size={13} />
            Vincular cartões
          </button>
          <button
            type="button"
            className="sf-icon-btn"
            onClick={onReload}
            disabled={loading}
            aria-label="Atualizar cartões"
            title="Atualizar cartões"
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={onReload} extra={errorExtra} />}

      {loading && cards.length === 0 && !error && (
        <>
          <div className="sf-skeleton" />
          <div className="sf-skeleton" style={{ height: 42 }} />
        </>
      )}

      {!loading && !error && cards.length === 0 && (
        <EmptyState
          actions={
            showHeader ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="sf-btn sf-btn--sm" onClick={() => setShowCreate(true)}>
                  <Icon name="plus" size={13} />
                  Novo cartão
                </button>
                <button
                  type="button"
                  className="sf-btn sf-btn--sm sf-btn--primary"
                  onClick={() => setShowLink(true)}
                >
                  <Icon name="link" size={13} />
                  Vincular existente
                </button>
              </div>
            ) : undefined
          }
        >
          Nenhum cartão vinculado a este processo.
        </EmptyState>
      )}

      {cards.map((card) => (
        <CardItem
          key={card.id}
          card={card}
          processNumber={processNumber}
          compact={compact}
          highlight={highlight}
          onChanged={onChanged}
          onRemoved={onRemoved}
        />
      ))}

      {showCreate && (
        <CreateCardDialog
          processNumber={processNumber}
          onClose={() => setShowCreate(false)}
          onCreated={(card) => onAdded([card])}
        />
      )}

      {showLink && (
        <LinkCardsDialog
          processNumber={processNumber}
          onClose={() => setShowLink(false)}
          onLinked={(linked) => onAdded(linked)}
        />
      )}
    </div>
  );
}
