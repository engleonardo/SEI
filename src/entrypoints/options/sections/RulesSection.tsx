import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrelloBoard, TrelloLabel, TrelloList } from '../../../core/domain/types';
import {
  RULE_ACTION_LABELS,
  RULE_TRIGGER_LABELS,
  createRule,
  ruleIssue,
  type Rule,
  type RuleAction,
  type RuleActionType,
  type RuleTriggerType,
} from '../../../core/domain/rules';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../../ui/icons';
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
  const queue = useRef<Promise<void>>(Promise.resolve());

  const loadBoardData = useCallback(
    async (boardId: string) => {
      if (!boardId) return;
      setLists((previous) => (previous[boardId] ? previous : { ...previous, [boardId]: [] }));
      setLabels((previous) => (previous[boardId] ? previous : { ...previous, [boardId]: [] }));
      try {
        const [boardLists, boardLabels] = await Promise.all([
          callRpc('trello:lists', { boardId }),
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
          if (rule.trigger.boardId) boardIds.add(rule.trigger.boardId);
          for (const action of rule.actions) {
            if (action.boardId) boardIds.add(action.boardId);
          }
        }
        for (const boardId of boardIds) void loadBoardData(boardId);
      })
      .catch((cause) => {
        if (active) notify({ kind: 'error', text: errorMessage(cause) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadBoardData, notify]);

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

  const updateAction = (ruleId: string, index: number, patch: Partial<RuleAction>) => {
    const next = rules.map((rule) => {
      if (rule.id !== ruleId) return rule;
      const actions = rule.actions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...patch } : action,
      );
      return { ...rule, actions };
    });
    persist(next);
    const boardId = patch.boardId;
    if (boardId) void loadBoardData(boardId);
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
      const result = await callRpc('rules:apply-now', { ruleId: rule.id });
      notify({
        kind: 'success',
        text: `Regra aplicada em ${result.applied} de ${result.total} cartões vinculados.`,
      });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusyRule(null);
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

  const boardLists = (boardId?: string) => (boardId ? lists[boardId] ?? [] : []);
  const boardLabels = (boardId?: string) => (boardId ? labels[boardId] ?? [] : []);

  return (
    <SectionCard
      title="Regras automáticas"
      subtitle="Aplicação instantânea, só em cartões vinculados a processos do SEI."
      icon="refresh"
      footer={
        <div className="sfo-actions">
          <button type="button" className="sfo-btn sfo-btn--primary" onClick={addRule}>
            <Icon name="plus" size={14} />
            Nova regra
          </button>
          <span className="sfo-hint">
            Cada regra roda uma vez por evento, com limite de 5 regras encadeadas.
          </span>
        </div>
      }
    >
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
                  <span className="sfo-rule__label">Quando</span>
                  <select
                    className="sfo-select"
                    value={rule.trigger.type}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        trigger: {
                          ...rule.trigger,
                          type: event.target.value as RuleTriggerType,
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

                  {(rule.trigger.type === 'enterList' || rule.trigger.type === 'updated') && (
                    <>
                      <select
                        className="sfo-select"
                        value={rule.trigger.boardId ?? ''}
                        onChange={(event) => {
                          const boardId = event.target.value;
                          updateRule(rule.id, {
                            trigger: { ...rule.trigger, boardId, listId: '' },
                          });
                          void loadBoardData(boardId);
                        }}
                        aria-label="Quadro da condição"
                      >
                        <option value="">
                          {rule.trigger.type === 'updated' ? 'Qualquer quadro' : 'Escolha o quadro'}
                        </option>
                        {boards.map((board) => (
                          <option key={board.id} value={board.id}>
                            {board.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="sfo-select"
                        value={rule.trigger.listId ?? ''}
                        onChange={(event) =>
                          updateRule(rule.id, {
                            trigger: { ...rule.trigger, listId: event.target.value },
                          })
                        }
                        disabled={!rule.trigger.boardId}
                        aria-label="Lista da condição"
                      >
                        <option value="">
                          {rule.trigger.type === 'updated' ? 'Qualquer lista' : 'Escolha a lista'}
                        </option>
                        {boardLists(rule.trigger.boardId).map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

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

                        {(action.type === 'moveToList' ||
                          action.type === 'addLabel' ||
                          action.type === 'removeLabel') && (
                          <select
                            className="sfo-select"
                            value={action.boardId ?? ''}
                            onChange={(event) => {
                              const boardId = event.target.value;
                              updateAction(rule.id, index, {
                                boardId,
                                listId: '',
                                labelId: '',
                              });
                              void loadBoardData(boardId);
                            }}
                            aria-label="Quadro da ação"
                          >
                            <option value="">Escolha o quadro</option>
                            {boards.map((board) => (
                              <option key={board.id} value={board.id}>
                                {board.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {action.type === 'moveToList' && (
                          <select
                            className="sfo-select"
                            value={action.listId ?? ''}
                            onChange={(event) =>
                              updateAction(rule.id, index, { listId: event.target.value })
                            }
                            disabled={!action.boardId}
                            aria-label="Lista de destino"
                          >
                            <option value="">Escolha a lista</option>
                            {boardLists(action.boardId).map((list) => (
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
                              const label = boardLabels(action.boardId).find(
                                (item) => item.id === labelId,
                              );
                              updateAction(rule.id, index, {
                                labelId,
                                labelName: label?.name ?? '',
                              });
                            }}
                            disabled={!action.boardId}
                            aria-label="Etiqueta"
                          >
                            <option value="">Escolha a etiqueta</option>
                            {boardLabels(action.boardId).map((label) => (
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
                        title="Aplicar esta regra nos cartões que já existem"
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
  );
}
