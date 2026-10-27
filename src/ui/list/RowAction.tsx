import { useState } from 'react';
import { Icon } from '../icons';
import { classNames } from '../utils';
import { useStore } from '../store';
import { CreateCardDialog } from '../components/CreateCardDialog';
import { LinkCardsDialog } from '../components/LinkCardsDialog';
import { Modal } from '../components/Modal';
import { addCards, listStore, loadList } from './store';

export interface RowActionProps {
  processNumber: string;
  specification: string;
  highlight?: boolean;
}

export function RowAction({ processNumber, specification, highlight = false }: RowActionProps) {
  const state = useStore(listStore);
  const cards = state.cards.filter((card) => card.links.includes(processNumber));
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showLink, setShowLink] = useState(false);

  return (
    <>
      <button
        type="button"
        className={classNames(
          'sf-row-action',
          cards.length > 0 && 'sf-row-action--active',
          highlight && 'sf-row-action--highlight',
        )}
        onClick={() => setMenuOpen(true)}
        aria-label={
          cards.length > 0
            ? `${cards.length} cartão(ões) vinculado(s). Abrir ações do processo`
            : `Adicionar cartão ao processo ${processNumber}`
        }
        title={
          cards.length > 0
            ? `${cards.length} cartão(ões) vinculado(s) · ${specification || processNumber}`
            : `Adicionar cartão ao processo ${processNumber}`
        }
      >
        <Icon name={cards.length > 0 ? 'columns' : 'plus'} size={12} />
        {cards.length > 0 && <span className="sf-row-action__count">{cards.length}</span>}
      </button>

      {menuOpen && (
        <Modal
          title={`Processo ${processNumber}`}
          subtitle={specification || 'Ações do SEI Flow'}
          size="sm"
          onClose={() => setMenuOpen(false)}
          footer={
            <button type="button" className="sf-btn" onClick={() => setMenuOpen(false)}>
              Fechar
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="sf-btn"
              style={{ justifyContent: 'flex-start', minHeight: 40 }}
              onClick={() => {
                setMenuOpen(false);
                setShowCreate(true);
              }}
            >
              <Icon name="plus" size={15} />
              Criar novo cartão no Trello
            </button>
            <button
              type="button"
              className="sf-btn"
              style={{ justifyContent: 'flex-start', minHeight: 40 }}
              onClick={() => {
                setMenuOpen(false);
                setShowLink(true);
              }}
            >
              <Icon name="link" size={15} />
              Vincular cartões existentes
            </button>
            <button
              type="button"
              className="sf-btn"
              style={{ justifyContent: 'flex-start', minHeight: 40 }}
              onClick={() => {
                setMenuOpen(false);
                void loadList();
              }}
            >
              <Icon name="refresh" size={15} />
              Atualizar cartões
            </button>
            {cards.length > 0 && (
              <p className="sf-hint" style={{ margin: '4px 0 0' }}>
                Este processo tem {cards.length} cartão(ões) vinculado(s). Eles aparecem logo abaixo
                da linha.
              </p>
            )}
          </div>
        </Modal>
      )}

      {showCreate && (
        <CreateCardDialog
          processNumber={processNumber}
          defaultName={specification || processNumber}
          onClose={() => setShowCreate(false)}
          onCreated={(card) => addCards([card])}
        />
      )}

      {showLink && (
        <LinkCardsDialog
          processNumber={processNumber}
          onClose={() => setShowLink(false)}
          onLinked={(linked) => addCards(linked)}
        />
      )}
    </>
  );
}
