import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrelloBoard, TrelloLabel, TrelloList } from '../../../core/domain/types';
import {
  RULE_ACTION_LABELS,
  RULE_TRIGGER_LABELS,
  createRule,
  ruleIssue,
  ruleRunCardCount,
  type Rule,
  type RuleAction,
  type RuleActionType,
  type RuleRun,
  type RuleTriggerType,
} from '../../../core/domain/rules';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import type { RuleStats } from '../../../core/storage/rule-stats';
import { Icon } from '../../../ui/icons';
import { ConfirmDialog } from '../../../ui/components/Modal';
import { SectionCard, Spinner, StatusPill, type Notice } from './shared';

export function RulesSection({
  boards,
  notify,
}: {
  boards: TrelloBoard[];
  notify: (notice: Notice) => void;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<Record<string, TrelloList[]>>({});
  const [labels, setLabels] = useState<Record<string, TrelloLabel[]>>({});
  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState<{
    rule: Rule;
    matching: number;
    total: number;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const [lastRun, setLastRun] = useState<RuleRun | null>(null);
  const [stats, setStats] = useState<RuleStats>({});
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const loadLastRun = useCallback(async () => {
    try {
      setLastRun(await callRpc('rules:last-run', undefined));
    } catch {
      setLastRun(null);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await callRpc('rules:stats', undefined));
    } catch {
      setStats({});
    }
  }, []);

  const loadBoardData = useCallback(
    async (boardId: string) => {
      if (!boardId) return;
      setLists((previous) => (previous[boardId] ? previous : { ...previous, [boardId]: [] }));
      setLabels((previous) => (previous[boardId] ? previous : { ...previous, [boardId]: [] }));
      try {
        const [boardLists, boardLabels] = await Promise.all([
          callRpc('trello:lists', { boardId, fresh: true }),
          callRpc('trello:board-labels', { boardId }),
        ]);
        setLists((previous) => ({ ...previous, [boardId]: boardLists }));
        setLabels((previous) => ({ ...previous, [boardId]: boardLabels }));
      } catch (cause) {
        notify({ kind: 'error', text: errorMessage(cause) });
      }
    },
    [notify],
  );

  useEffect(() => {
    let active = true;
    callRpc('rules:list', undefined)
      .then((value) => {
        if (!active) return;
        setRules(value);
        const boardIds = new Set<string>();
        for (const rule of value) {
          if (rule.boardId) boardIds.add(rule.boardId);
        }
        for (const boardId of boardIds) void loadBoardData(boardId);
      })
      .catch((cause) => {
        if (active) notify({ kind: 'error', text: errorMessage(cause) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void loadLastRun();
    void loadStats();
    return () => {
      active = false;
    };
  }, [loadBoardData, loadLastRun, loadStats, notify]);

  const persist = (next: Rule[], message?: string) => {
    setRules(next);
    queue.current = queue.current
      .then(async () => {
        await callRpc('rules:save', { rules: next });
      })
      .then(() => {
        if (message) notify({ kind: 'success', text: message });
      })
      .catch((cause) => {
        notify({ kind: 'error', text: errorMessage(cause) });
      });
  };

  const updateRule = (ruleId: string, patch: Partial<Rule>) => {
    const next = rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule));
    persist(next);
  };

  const changeBoard = (rule: Rule, boardId: string) => {
    updateRule(rule.id, {
      boardId,
      trigger: { ...rule.trigger, listId: undefined },
      actions: rule.actions.map((action) => ({
        ...action,
        listId: undefined,
        labelId: undefined,
        labelName: undefined,
      })),
    });
    void loadBoardData(boardId);
  };

  const updateAction = (ruleId: string, index: number, patch: Partial<RuleAction>) => {
    const next = rules.map((rule) => {
      if (rule.id !== ruleId) return rule;
      const actions = rule.actions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...patch } : action,
      );
      return { ...rule, actions };
    });
    persist(next);
  };

  const addAction = (rule: Rule) => {
    const hasMove = rule.actions.some((action) => action.type === 'moveToList');
    const next = rules.map((item) =>
      item.id === rule.id
        ? {
            ...item,
            actions: [
              ...item.actions,
              hasMove
                ? ({ type: 'moveToTop' } as RuleAction)
                : ({ type: 'moveToList' } as RuleAction),
            ],
          }
        : item,
    );
    persist(next);
  };

  const removeAction = (ruleId: string, index: number) => {
    const next = rules.map((rule) =>
      rule.id === ruleId
        ? { ...rule, actions: rule.actions.filter((_, actionIndex) => actionIndex !== index) }
        : rule,
    );
    persist(next);
  };

  const removeRule = (ruleId: string) => {
    persist(
      rules.filter((rule) => rule.id !== ruleId),
      'Regra removida.',
    );
  };

  const addRule = () => {
    persist([...rules, createRule({ name: 'Nova regra', enabled: false })], 'Regra criada.');
  };

  const applyNow = async (rule: Rule) => {
    const issue = ruleIssue(rule);
    if (issue) {
      notify({ kind: 'error', text: issue });
      return;
    }
    setBusyRule(rule.id);
    try {
      const preview = await callRpc('rules:apply-now', { ruleId: rule.id, dryRun: true });
      if (preview.applied === 0) {
        notify({
          kind: 'info',
          text: 'Nenhum cartão vinculado está na condição desta regra agora. Nada foi alterado.',
        });
        return;
      }
      setConfirmApply({ rule, matching: preview.applied, total: preview.total });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusyRule(null);
    }
  };

  const confirmApplyNow = async () => {
    if (!confirmApply) return;
    setApplying(true);
    try {
      const result = await callRpc('rules:apply-now', { ruleId: confirmApply.rule.id });
      notify({
        kind: 'success',
        text: `Regra aplicada em ${result.applied} de ${result.total} cartões vinculados.`,
      });
      setConfirmApply(null);
      await Promise.all([loadLastRun(), loadStats()]);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setApplying(false);
    }
  };

  const undoLastRun = async () => {
    setUndoing(true);
    try {
      const result = await callRpc('rules:undo', undefined);
      notify({
        kind: 'success',
        text: `${result.reverted} de ${result.total} alterações revertidas em ${result.cards} cartões.`,
      });
      setUndoOpen(false);
      await Promise.all([loadLastRun(), loadStats()]);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setUndoing(false);
    }
  };

  const triggerSummary = (rule: Rule) => {
    const label = RULE_TRIGGER_LABELS[rule.trigger.type];
    if (rule.trigger.type === 'enterList') {
      const list = boardLists(rule.boardId).find((item) => item.id === rule.trigger.listId);
      return list ? `${label} "${list.name}"` : label;
    }
    if (rule.trigger.type === 'seiUpdated' && rule.trigger.listId) {
      const list = boardLists(rule.boardId).find((item) => item.id === rule.trigger.listId);
      return list ? `${label} (lista "${list.name}")` : label;
    }
    return label;
  };

  const clearStats = async () => {
    try {
      setStats(await callRpc('rules:clear-stats', undefined));
      notify({ kind: 'success', text: 'Contadores zerados.' });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    }
  };

  const toggleRule = (rule: Rule) => {
    if (!rule.enabled) {
      const issue = ruleIssue(rule);
      if (issue) {
        notify({ kind: 'error', text: `Antes de ativar: ${issue}` });
        return;
      }
    }
    updateRule(rule.id, { enabled: !rule.enabled });
  };

  const boardLists = (boardId: string) => lists[boardId] ?? [];
  const boardLabels = (boardId: string) => labels[boardId] ?? [];

  return (
    <>
      <SectionCard
      title="Regras automáticas"
      subtitle="Cada regra pertence a um quadro e só altera cartões vinculados ao SEI."
      icon="refresh"
      footer={
        <div className="sfo-actions">
          <button type="button" className="sfo-btn sfo-btn--primary" onClick={addRule}>
            <Icon name="plus" size={14} />
            Nova regra
          </button>
          <span className="sfo-hint">
            Os cartões nunca saem do quadro da regra. Cadeia limitada a 5 níveis.
          </span>
          {Object.keys(stats).length > 0 && (
            <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => void clearStats()}>
              Zerar contadores
            </button>
          )}
        </div>
      }
    >
      {lastRun && (
        <div className="sfo-rules-undo">
          <span className="sfo-rules-undo__text">
            <Icon name="clock" size={13} />
            Última aplicação manual: <strong>{lastRun.ruleName}</strong> em{' '}
            {ruleRunCardCount(lastRun)} cartões ·{' '}
            {new Date(lastRun.at).toLocaleString('pt-BR')}
          </span>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => setUndoOpen(true)}
          >
            <Icon name="refresh" size={13} />
            Desfazer
          </button>
        </div>
      )}

      {loading ? (
        <div className="sfo-loading">
          <Spinner />
          <span>Carregando regras…</span>
        </div>
      ) : rules.length === 0 ? (
        <p className="sfo-hint">Nenhuma regra configurada. Crie a primeira em “Nova regra”.</p>
      ) : (
        <div className="sfo-rules">
          {rules.map((rule) => {
            const issue = ruleIssue(rule);
            const stat = stats[rule.id];
            return (
              <article key={rule.id} className={`sfo-rule${rule.enabled ? ' sfo-rule--on' : ''}`}>
                <header className="sfo-rule__head">
                  <button
                    type="button"
                    className={`sfo-switch${rule.enabled ? ' sfo-switch--on' : ''}`}
                    onClick={() => toggleRule(rule)}
                    aria-pressed={rule.enabled}
                    aria-label={rule.enabled ? 'Desativar regra' : 'Ativar regra'}
                    title={rule.enabled ? 'Desativar regra' : 'Ativar regra'}
                  >
                    <span />
                  </button>
                  <input
                    className="sfo-input sfo-rule__name"
                    value={rule.name}
                    onChange={(event) => updateRule(rule.id, { name: event.target.value })}
                    aria-label="Nome da regra"
                  />
                  {rule.enabled ? (
                    <StatusPill tone="success">Ativa</StatusPill>
                  ) : (
                    <StatusPill tone="warning">Inativa</StatusPill>
                  )}
                  {stat && (
                    <span
                      className="sfo-rule__count"
                      title={`Aplicada ${stat.applied} ${stat.applied === 1 ? 'vez' : 'vezes'} · última em ${new Date(stat.lastAt).toLocaleString('pt-BR')} (${stat.lastSource === 'manual' ? 'manual' : 'automática'})`}
                    >
                      <Icon name="refresh" size={11} />
                      {stat.applied}x
                    </span>
                  )}
                  <button
                    type="button"
                    className="sfo-icon-btn sfo-icon-btn--danger"
                    onClick={() => removeRule(rule.id)}
                    title="Remover regra"
                    aria-label="Remover regra"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </header>

                <div className="sfo-rule__row">
                  <span className="sfo-rule__label">Quadro</span>
                  <select
                    className="sfo-select"
                    value={rule.boardId}
                    onChange={(event) => changeBoard(rule, event.target.value)}
                    aria-label="Quadro da regra"
                  >
                    <option value="">Escolha o quadro</option>
                    {boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sfo-rule__row">
                  <span className="sfo-rule__label">Quando</span>
                  <select
                    className="sfo-select"
                    value={rule.trigger.type}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        trigger: {
                          ...rule.trigger,
                          type: event.target.value as RuleTriggerType,
                          listId: undefined,
                        },
                      })
                    }
                    aria-label="Condição da regra"
                  >
                    {(Object.keys(RULE_TRIGGER_LABELS) as RuleTriggerType[]).map((type) => (
                      <option key={type} value={type}>
                        {RULE_TRIGGER_LABELS[type]}
                      </option>
                    ))}
                  </select>

                  {(rule.trigger.type === 'enterList' || rule.trigger.type === 'seiUpdated') && (
                    <select
                      className="sfo-select"
                      value={rule.trigger.listId ?? ''}
                      onChange={(event) =>
                        updateRule(rule.id, {
                          trigger: {
                            ...rule.trigger,
                            listId: event.target.value || undefined,
                          },
                        })
                      }
                      disabled={!rule.boardId}
                      aria-label="Lista da condição"
                    >
                      <option value="">
                        {rule.trigger.type === 'seiUpdated' ? 'Qualquer lista' : 'Escolha a lista'}
                      </option>
                      {boardLists(rule.boardId).map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {rule.trigger.type === 'seiUpdated' && (
                  <p className="sfo-hint" style={{ margin: 0 }}>
                    Dispara quando a lista do SEI indicar novidade no processo vinculado. Roda uma
                    vez por novidade, em todos os cartões do processo que estejam neste quadro.
                  </p>
                )}

                <div className="sfo-rule__actions">
                  <span className="sfo-rule__label">Então</span>
                  <div className="sfo-rule__action-list">
                    {rule.actions.map((action, index) => (
                      <div key={`${rule.id}-action-${index}`} className="sfo-rule__action">
                        <select
                          className="sfo-select"
                          value={action.type}
                          onChange={(event) =>
                            updateAction(rule.id, index, {
                              type: event.target.value as RuleActionType,
                              listId: undefined,
                              labelId: undefined,
                              labelName: undefined,
                            })
                          }
                          aria-label="Ação da regra"
                        >
                          {(Object.keys(RULE_ACTION_LABELS) as RuleActionType[]).map((type) => (
                            <option key={type} value={type}>
                              {RULE_ACTION_LABELS[type]}
                            </option>
                          ))}
                        </select>

                        {action.type === 'moveToList' && (
                          <select
                            className="sfo-select"
                            value={action.listId ?? ''}
                            onChange={(event) =>
                              updateAction(rule.id, index, {
                                listId: event.target.value || undefined,
                              })
                            }
                            disabled={!rule.boardId}
                            aria-label="Lista de destino"
                          >
                            <option value="">Escolha a lista</option>
                            {boardLists(rule.boardId).map((list) => (
                              <option key={list.id} value={list.id}>
                                {list.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {(action.type === 'addLabel' || action.type === 'removeLabel') && (
                          <select
                            className="sfo-select"
                            value={action.labelId ?? ''}
                            onChange={(event) => {
                              const labelId = event.target.value;
                              const label = boardLabels(rule.boardId).find(
                                (item) => item.id === labelId,
                              );
                              updateAction(rule.id, index, {
                                labelId: labelId || undefined,
                                labelName: label?.name ?? '',
                              });
                            }}
                            disabled={!rule.boardId}
                            aria-label="Etiqueta"
                          >
                            <option value="">Escolha a etiqueta</option>
                            {boardLabels(rule.boardId).map((label) => (
                              <option key={label.id} value={label.id}>
                                {label.name || label.color || 'Etiqueta'}
                              </option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          className="sfo-icon-btn sfo-icon-btn--danger"
                          onClick={() => removeAction(rule.id, index)}
                          title="Remover ação"
                          aria-label="Remover ação"
                          disabled={rule.actions.length <= 1}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    ))}
                    <div className="sfo-rule__action-footer">
                      <button
                        type="button"
                        className="sfo-btn sfo-btn--sm"
                        onClick={() => addAction(rule)}
                      >
                        <Icon name="plus" size={13} />
                        Adicionar ação
                      </button>
                      <button
                        type="button"
                        className="sfo-btn sfo-btn--sm"
                        onClick={() => void applyNow(rule)}
                        disabled={busyRule === rule.id || Boolean(issue)}
                        title="Aplicar esta regra apenas nos cartões que já estão na condição do gatilho"
                      >
                        {busyRule === rule.id ? <Spinner /> : <Icon name="refresh" size={13} />}
                        Aplicar agora
                      </button>
                    </div>
                  </div>
                </div>

                {issue && (
                  <p className="sfo-rule__issue">
                    <Icon name="alert" size={12} />
                    {issue}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      </SectionCard>

      {confirmApply && (
        <ConfirmDialog
          title="Aplicar regra agora"
          message={`${triggerSummary(confirmApply.rule)}. Serão alterados ${confirmApply.matching} de ${confirmApply.total} cartões vinculados. As mudanças vão direto para o Trello e não têm desfazer.`}
          confirmLabel={`Aplicar em ${confirmApply.matching}`}
          busy={applying}
          onConfirm={() => void confirmApplyNow()}
          onClose={() => setConfirmApply(null)}
        />
      )}
      {undoOpen && lastRun && (
        <ConfirmDialog
          title="Desfazer aplicação"
          message={`Serão revertidas ${lastRun.moves.length + lastRun.labels.length} alterações feitas em ${ruleRunCardCount(lastRun)} cartões pela regra "${lastRun.ruleName}". Cartões que mudaram de lista depois disso são mantidos como estão.`}
          confirmLabel="Desfazer"
          busy={undoing}
          onConfirm={() => void undoLastRun()}
          onClose={() => setUndoOpen(false)}
        />
      )}
    </>
  );
}
