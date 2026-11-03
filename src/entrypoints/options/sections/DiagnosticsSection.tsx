import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings, TrelloBoard } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import type { LinkCandidate } from '../../../core/link/scan';
import { Icon } from '../../../ui/icons';
import { ConfirmDialog } from '../../../ui/components/Modal';
import { CollapsibleCard, Spinner, type Notice } from './shared';

function candidateKey(candidate: LinkCandidate): string {
  return `${candidate.cardId}|${candidate.processNumber}`;
}

export function DiagnosticsSection({
  settings,
  boards,
  notify,
}: {
  settings: Settings;
  boards: TrelloBoard[];
  notify: (notice: Notice) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [linkBoardId, setLinkBoardId] = useState(settings.defaultBoardId);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const [confirmLink, setConfirmLink] = useState(false);
  const manifest = browser.runtime.getManifest();
  const permissions = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])];
  const optional = manifest.optional_host_permissions ?? [];

  const clearCache = async () => {
    setBusy(true);
    try {
      await callRpc('settings:clear-cache', undefined);
      notify({ kind: 'success', text: 'Cache local limpo. Os dados serão buscados novamente.' });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const scanCandidates = async () => {
    if (!linkBoardId) {
      notify({ kind: 'error', text: 'Escolha um quadro para procurar os cartões.' });
      return;
    }
    setScanning(true);
    try {
      const result = await callRpc('trello:unlinked-candidates', { boardId: linkBoardId });
      setCandidates(result);
      setSelected(new Set(result.map(candidateKey)));
      const cards = new Set(result.map((candidate) => candidate.cardId)).size;
      notify({
        kind: result.length > 0 ? 'info' : 'success',
        text:
          result.length > 0
            ? `${result.length} candidato(s) em ${cards} cartão(ões). Confira e confirme o vínculo.`
            : 'Nenhum cartão sem vínculo com número de processo no comentário.',
      });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setScanning(false);
    }
  };

  const linkSelected = async () => {
    const chosen = candidates.filter((candidate) => selected.has(candidateKey(candidate)));
    setLinking(true);
    let linked = 0;
    let already = 0;
    let failed = 0;

    for (const candidate of chosen) {
      try {
        const [result] = await callRpc('trello:link-cards', {
          cardIds: [candidate.cardId],
          processNumber: candidate.processNumber,
        });
        if (result?.status === 'linked') linked += 1;
        else if (result?.status === 'already') already += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    setLinking(false);
    setConfirmLink(false);
    notify({
      kind: failed > 0 ? 'warning' : 'success',
      text: `${linked} vinculado(s), ${already} já estavam e ${failed} falha(s).`,
    });
    await scanCandidates();
  };

  const toggleCandidate = (candidate: LinkCandidate) => {
    const key = candidateKey(candidate);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (keys: string[], checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const candidateGroups = useMemo(() => {
    const map = new Map<string, { cardId: string; cardName: string; items: LinkCandidate[] }>();
    for (const candidate of candidates) {
      const group = map.get(candidate.cardId);
      if (group) {
        group.items.push(candidate);
      } else {
        map.set(candidate.cardId, {
          cardId: candidate.cardId,
          cardName: candidate.cardName,
          items: [candidate],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.cardName.localeCompare(b.cardName, 'pt-BR'));
  }, [candidates]);

  const diagnostics = [
    `SEI Flow v${manifest.version}`,
    `ID: ${browser.runtime.id}`,
    `Sites: ${settings.allSites ? 'todos' : settings.activatedOrigins.join(', ') || 'nenhum'}`,
    `Quadro padrão: ${settings.defaultBoardName || '(não configurado)'}`,
    `Lista padrão: ${settings.defaultListName || '(não configurado)'}`,
    `Permissões: ${permissions.join(', ')}`,
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      notify({ kind: 'success', text: 'Diagnóstico copiado.' });
    } catch {
      notify({ kind: 'error', text: 'Não foi possível copiar o diagnóstico.' });
    }
  };

  return (
    <>
      <CollapsibleCard
        title="Diagnóstico técnico"
        subtitle="Versão, permissões, cache e informações para suporte."
        icon="info"
        badge={`v${manifest.version}`}
        footer={
          <>
            <button type="button" className="sfo-btn" onClick={() => void copy()}>
              <Icon name="list" size={14} />
              Copiar diagnóstico
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--danger"
              onClick={() => void clearCache()}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Icon name="trash" size={14} />}
              Limpar cache local
            </button>
          </>
        }
      >
        <dl className="sfo-diagnostics">
          <dt>Versão</dt>
          <dd>{manifest.version}</dd>
          <dt>ID da extensão</dt>
          <dd>
            <code>{browser.runtime.id}</code>
          </dd>
          <dt>Permissões</dt>
          <dd>{permissions.join(', ') || '-'}</dd>
          <dt>Permissões opcionais</dt>
          <dd>{optional.join(', ') || '-'}</dd>
          <dt>Sites ativados</dt>
          <dd>{settings.allSites ? 'Todos os sites' : settings.activatedOrigins.join(', ') || 'Nenhum'}</dd>
          <dt>Quadro / lista padrão</dt>
          <dd>
            {settings.defaultBoardName || '-'} / {settings.defaultListName || '-'}
          </dd>
          <dt>Armazenamento</dt>
          <dd>
            Credenciais e preferências em <code>storage.local</code>; cache com TTL no mesmo local.
          </dd>
        </dl>
      </CollapsibleCard>

      <CollapsibleCard
        title="Vincular cartões desvinculados"
        subtitle="Encontre cartões sem vínculo que citam um número de processo no comentário e confirme a vinculação."
        icon="unlink"
      >
        <div className="sfo-grid-2">
          <label className="sfo-field" htmlFor="sfo-link-board">
            <span>Quadro</span>
            <select
              id="sfo-link-board"
              className="sfo-select"
              value={linkBoardId}
              onChange={(event) => {
                setLinkBoardId(event.target.value);
                setCandidates([]);
                setSelected(new Set());
              }}
            >
              <option value="">Escolha o quadro</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sfo-field">
            <span>&nbsp;</span>
            <button
              type="button"
              className="sfo-btn"
              onClick={() => void scanCandidates()}
              disabled={!linkBoardId || scanning}
            >
              {scanning ? <Spinner /> : <Icon name="search" size={14} />}
              Procurar cartões
            </button>
          </div>
        </div>

        {candidates.length > 0 && (
          <>
            <div className="sfo-actions">
              <span className="sfo-hint">
                {candidates.length} candidato(s) em{' '}
                {new Set(candidates.map((candidate) => candidate.cardId)).size} cartão(ões). Cartões com mais
                de um número aparecem agrupados com a contagem de processos. O comentário não é alterado; o
                bloco de vínculo é incluído no fim da descrição.
              </span>
              <button
                type="button"
                className="sfo-btn sfo-btn--sm"
                onClick={() => setSelected(new Set(candidates.map(candidateKey)))}
              >
                Selecionar todos
              </button>
              <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => setSelected(new Set())}>
                Limpar seleção
              </button>
            </div>

            <div className="sfo-candidates">
              {candidateGroups.map((group) => {
                const keys = group.items.map(candidateKey);
                const allSelected = keys.every((key) => selected.has(key));
                return (
                  <div key={group.cardId} className="sfo-candidate-group">
                    <div className="sfo-candidate-group__head">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleGroup(keys, !allSelected)}
                        aria-label={`Selecionar todos os processos de ${group.cardName}`}
                      />
                      <strong>{group.cardName}</strong>
                      {group.items.length > 1 && (
                        <span className="sfo-candidate-group__badge">{group.items.length} processos</span>
                      )}
                    </div>
                    <div className="sfo-candidate-group__items">
                      {group.items.map((candidate) => {
                        const key = candidateKey(candidate);
                        return (
                          <label key={key} className="sfo-candidate">
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleCandidate(candidate)}
                            />
                            <span className="sfo-candidate__body">
                              <span className="sfo-candidate__head">
                                <code>{candidate.processNumber}</code>
                              </span>
                              <span className="sfo-candidate__snippet">{candidate.snippet}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sfo-actions">
              <button
                type="button"
                className="sfo-btn sfo-btn--primary"
                onClick={() => setConfirmLink(true)}
                disabled={selected.size === 0 || linking}
              >
                {linking ? <Spinner /> : <Icon name="link" size={14} />}
                Vincular selecionados ({selected.size})
              </button>
            </div>
          </>
        )}
      </CollapsibleCard>

      {confirmLink && (
        <ConfirmDialog
          title="Vincular cartões"
          message={`Serão vinculados ${selected.size} cartão(ões) ao processo indicado no comentário. O texto do comentário não é alterado; a tag de vínculo é adicionada no fim da descrição.`}
          confirmLabel={`Vincular ${selected.size}`}
          busy={linking}
          onConfirm={() => void linkSelected()}
          onClose={() => setConfirmLink(false)}
        />
      )}
    </>
  );
}
