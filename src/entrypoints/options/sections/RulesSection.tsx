import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrelloBoard, TrelloLabel, TrelloList } from '../../../core/domain/types';
import {
  MAX_DATE_OFFSET_DAYS,
  RULE_ACTION_LABELS,
  RULE_COMMENT_PLACEHOLDERS,
  RULE_TRIGGER_LABELS,
  createRule,
  newRuleId,
  ruleIssue,
  ruleRunCardCount,
  ruleRunChangeCount,
  type Rule,
  type RuleAction,
  type RuleActionType,
  type RuleRun,
  type RuleTriggerType,
} from '../../../core/domain/rules';
import { parseRulesImport } from '../../../core/domain/rule-import';
import { copyRulesToBoard } from '../../../core/domain/rule-copy';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import type { RuleStats } from '../../../core/storage/rule-stats';
import type { RuleLogEntry } from '../../../core/storage/rule-log';
import type { ChecklistTemplate } from '../../../core/storage/checklist-templates';
import { watchSyncChanges } from '../../../core/storage/sync-tick';
import { Icon } from '../../../ui/icons';
import { labelColorHex, labelTextColor } from '../../../ui/utils';
import { ConfirmDialog, Modal } from '../../../ui/components/Modal';
import { SectionCard, Spinner, StatusPill, type Notice } from './shared';

const UNASSIGNED_BOARD = '__none__';

export function RulesSection({
  boards,
  notify,
  demoMode = false,
}: {
  boards: TrelloBoard[];
  notify: (notice: Notice) => void;
  demoMode?: boolean;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [activeBoardId, setActiveBoardId] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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
  const [log, setLog] = useState<RuleLogEntry[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingReplace, setPendingReplace] = useState<Rule[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState('');
  const [copyTarget, setCopyTarget] = useState('');
  const [copying, setCopying] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const saveSeq = useRef(0);
  const hasUnassignedRules = rules.some((rule) => !rule.boardId);

  const loadLastRun = useCallback(async () => {
    try {
      setLastRun(await callRpc('rules:last-run', undefined));
    } catch {
      setLastRun(null);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const value = await callRpc('rules:stats', undefined);
      setStats(value && typeof value === 'object' ? value : {});
    } catch {
      setStats({});
    }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const value = await callRpc('rules:log', undefined);
      setLog(Array.isArray(value) ? value : []);
    } catch {
      setLog([]);
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
        setActiveBoardId((previous) => {
          if (previous === UNASSIGNED_BOARD) return previous;
          if (previous && value.some((rule) => rule.boardId === previous)) return previous;
          const assigned = value.find((rule) => rule.boardId)?.boardId;
          if (assigned) return assigned;
          if (value.some((rule) => !rule.boardId)) return UNASSIGNED_BOARD;
          return previous || '';
        });
      })
      .catch((cause) => {
        if (active) notify({ kind: 'error', text: errorMessage(cause) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void loadLastRun();
    void loadStats();
    void loadLog();
    void callRpc('checklists:templates', undefined)
      .then((value) => {
        if (active) setChecklistTemplates(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [loadLastRun, loadStats, loadLog, notify]);

  // Se ainda não há regra, usa o primeiro quadro disponível como contexto.
  useEffect(() => {
    if (activeBoardId) return;
    const first = boards[0]?.id;
    if (first) setActiveBoardId(first);
  }, [boards, activeBoardId]);

  // Se o usuário atribuir/remover todos os modelos sem quadro, sai da visão "Sem quadro".
  useEffect(() => {
    if (activeBoardId !== UNASSIGNED_BOARD || hasUnassignedRules) return;
    const first = boards[0]?.id;
    if (first) setActiveBoardId(first);
  }, [activeBoardId, boards, hasUnassignedRules]);

  // Carrega listas e etiquetas do quadro em edição (e de novo ao trocar).
  useEffect(() => {
    if (activeBoardId && activeBoardId !== UNASSIGNED_BOARD) {
      void loadBoardData(activeBoardId);
    }
  }, [activeBoardId, loadBoardData]);

  // O background pode puxar configuração nova (login/alarme); recarrega a lista.
  useEffect(() => {
    return watchSyncChanges(() => {
      // Não recarrega enquanto o usuário digita (o próprio salvamento dispara o sync).
      const focused = document.activeElement;
      if (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement) return;
      void callRpc('rules:list', undefined)
        .then((value) => setRules(Array.isArray(value) ? value : []))
        .catch(() => undefined);
    });
  }, []);

  const matchesActiveBoard = (rule: Rule) =>
    activeBoardId === UNASSIGNED_BOARD ? !rule.boardId : rule.boardId === activeBoardId;

  const visibleRules = useMemo(
    () =>
      rules.filter((rule) =>
        activeBoardId === UNASSIGNED_BOARD ? !rule.boardId : rule.boardId === activeBoardId,
      ),
    [rules, activeBoardId],
  );

  const syncNow = async () => {
    if (demoMode) {
      notify({ kind: 'info', text: 'Indisponível no modo sem Trello.' });
      return;
    }
    setSyncing(true);
    try {
      const result = await callRpc('sync:config', { force: true });
      const fresh = await callRpc('rules:list', undefined);
      setRules(fresh);
      notify({
        kind: 'success',
        text: result.pulled
          ? 'Regras sincronizadas do Trello.'
          : result.pushed
            ? 'Configuração enviada ao Trello.'
            : 'A configuração já estava atualizada.',
      });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setSyncing(false);
    }
  };

  const persist = (next: Rule[], message?: string) => {
    setRules(next);
    const seq = ++saveSeq.current;
    setSaveState('saving');
    queue.current = queue.current
      .then(async () => {
        await callRpc('rules:save', { rules: next });
      })
      .then(() => {
        if (seq === saveSeq.current) setSaveState('saved');
        if (message) notify({ kind: 'success', text: message });
      })
      .catch((cause) => {
        if (seq === saveSeq.current) setSaveState('error');
        notify({ kind: 'error', text: errorMessage(cause) });
      });
  };

  const saveNow = () => {
    const seq = ++saveSeq.current;
    setSaveState('saving');
    queue.current = queue.current
      .then(async () => {
        await callRpc('rules:save', { rules });
      })
      .then(() => {
        if (seq !== saveSeq.current) return;
        setSaveState('saved');
        notify({ kind: 'success', text: 'Regras salvas.' });
      })
      .catch((cause) => {
        if (seq === saveSeq.current) setSaveState('error');
        notify({ kind: 'error', text: errorMessage(cause) });
      });
  };

  const exportRules = async (mode: 'clipboard' | 'file') => {
    if (rules.length === 0) {
      notify({ kind: 'info', text: 'Nenhuma regra para exportar.' });
      return;
    }
    const payload = {
      app: 'sei-flow-rules',
      version: 1,
      exportedAt: new Date().toISOString(),
      rules,
    };
    const json = JSON.stringify(payload, null, 2);

    try {
      if (mode === 'clipboard') {
        await navigator.clipboard.writeText(json);
        setExportOpen(false);
        notify({
          kind: 'success',
          text: `${rules.length} regra(s) copiada(s) para a área de transferência.`,
        });
        return;
      }

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sei-flow-regras-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      notify({ kind: 'success', text: `${rules.length} regra(s) exportada(s).` });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    }
  };

  const openImport = () => {
    setImportText('');
    setImportError(null);
    setImportOpen(true);
  };

  const parseImportedRules = (): Rule[] | null => {
    try {
      const imported = parseRulesImport(importText);
      setImportError(null);
      return imported;
    } catch (cause) {
      setImportError(errorMessage(cause));
      return null;
    }
  };

  const commitImport = async (imported: Rule[], mode: 'merge' | 'replace') => {
    setImporting(true);
    try {
      // Garante que nenhuma edição pendente sobrescreva a importação.
      await queue.current;
      const base = mode === 'merge' ? rules : [];
      const map = new Map(base.map((rule) => [rule.id, rule]));
      for (const rule of imported) map.set(rule.id, rule);
      const next = Array.from(map.values());
      const saved = await callRpc('rules:save', { rules: next });
      saveSeq.current += 1;
      setSaveState('saved');
      setRules(saved);

      const boardIds = new Set(saved.map((rule) => rule.boardId).filter(Boolean));
      for (const boardId of boardIds) void loadBoardData(boardId);

      const ignored = next.length - saved.length;
      notify({
        kind: ignored > 0 ? 'warning' : 'success',
        text:
          mode === 'merge'
            ? `${imported.length} regra(s) lida(s); ${saved.length} no total.${
                ignored > 0 ? ` ${ignored} ignorada(s) por formato inválido.` : ''
              }`
            : `${saved.length} regra(s) importada(s).${
                ignored > 0 ? ` ${ignored} ignorada(s) por formato inválido.` : ''
              }`,
      });
      setImportOpen(false);
      setImportText('');
      setPendingReplace(null);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setImporting(false);
    }
  };

  const applyImport = (mode: 'merge' | 'replace') => {
    const imported = parseImportedRules();
    if (!imported) return;
    if (mode === 'replace') {
      setPendingReplace(imported);
      return;
    }
    void commitImport(imported, 'merge');
  };

  const updateRule = (ruleId: string, patch: Partial<Rule>) => {
    const next = rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule));
    persist(next);
  };

  const assignRuleBoard = (rule: Rule, boardId: string) => {
    updateRule(rule.id, {
      boardId,
      trigger: { ...rule.trigger, listId: undefined, labelIds: undefined, labelMode: undefined },
      actions: rule.actions.map((action) => ({
        ...action,
        listId: undefined,
        labelId: undefined,
        labelName: undefined,
      })),
    });
    if (boardId) {
      void loadBoardData(boardId);
      setActiveBoardId(boardId);
    }
  };

  const toggleConditionLabel = (rule: Rule, labelId: string) => {
    const current = rule.trigger.labelIds ?? [];
    const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId];
    updateRule(rule.id, {
      trigger: {
        ...rule.trigger,
        labelIds: next.length > 0 ? next : undefined,
        labelMode: next.length > 0 ? (rule.trigger.labelMode ?? 'any') : undefined,
      },
    });
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
              hasMove ? ({ type: 'moveToTop' } as RuleAction) : ({ type: 'moveToList' } as RuleAction),
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

  const moveRule = (ruleId: string, direction: -1 | 1) => {
    const index = visibleRules.findIndex((rule) => rule.id === ruleId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= visibleRules.length) return;
    const reordered = [...visibleRules];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);
    let cursor = 0;
    const next = rules.map((rule) => (matchesActiveBoard(rule) ? reordered[cursor++]! : rule));
    persist(next, 'Ordem das regras atualizada.');
  };

  const duplicateRule = (rule: Rule) => {
    const index = rules.findIndex((item) => item.id === rule.id);
    if (index < 0) return;
    const copy: Rule = {
      ...rule,
      id: newRuleId(),
      name: `${rule.name} (cópia)`,
      enabled: false,
      trigger: { ...rule.trigger },
      actions: rule.actions.map((action) => ({ ...action })),
    };
    const next = [...rules];
    next.splice(index + 1, 0, copy);
    persist(next, 'Regra duplicada. Ajuste e ative quando quiser.');
  };

  const addRule = () => {
    persist(
      [
        ...rules,
        createRule({
          name: 'Nova regra',
          enabled: false,
          boardId: activeBoardId === UNASSIGNED_BOARD ? '' : activeBoardId,
        }),
      ],
      'Regra criada.',
    );
  };

  const openCopy = () => {
    const source =
      (activeBoardId &&
      activeBoardId !== UNASSIGNED_BOARD &&
      rules.some((rule) => rule.boardId === activeBoardId)
        ? activeBoardId
        : undefined) ??
      rules.find((rule) => rule.boardId)?.boardId ??
      boards[0]?.id ??
      '';
    const target = boards.find((board) => board.id !== source)?.id ?? '';
    setCopySource(source);
    setCopyTarget(target);
    setCopyOpen(true);
  };

  const copyRules = async () => {
    if (!copySource || !copyTarget || copySource === copyTarget) {
      notify({ kind: 'error', text: 'Escolha quadros de origem e destino diferentes.' });
      return;
    }
    const sourceRules = rules.filter((rule) => rule.boardId === copySource);
    if (sourceRules.length === 0) {
      notify({ kind: 'warning', text: 'O quadro de origem não tem regras.' });
      return;
    }
    setCopying(true);
    try {
      const [sourceLists, sourceLabels, targetLists, targetLabels] = await Promise.all([
        callRpc('trello:lists', { boardId: copySource, fresh: true }),
        callRpc('trello:board-labels', { boardId: copySource, fresh: true }),
        callRpc('trello:lists', { boardId: copyTarget, fresh: true }),
        callRpc('trello:board-labels', { boardId: copyTarget, fresh: true }),
      ]);

      const result = copyRulesToBoard(
        sourceRules,
        { lists: sourceLists, labels: sourceLabels },
        { lists: targetLists, labels: targetLabels },
        copyTarget,
      );

      if (result.copied === 0) {
        notify({
          kind: 'warning',
          text: 'Nenhuma regra pôde ser copiada: as listas ou etiquetas não existem no quadro de destino.',
        });
        return;
      }

      // As regras copiadas já aparecem com as listas/etiquetas do destino.
      setLists((previous) => ({ ...previous, [copyTarget]: targetLists }));
      setLabels((previous) => ({ ...previous, [copyTarget]: targetLabels }));
      setActiveBoardId(copyTarget);

      persist(
        [...rules, ...result.rules],
        `${result.copied} regra(s) copiada(s).${
          result.skipped > 0 ? ` ${result.skipped} ignorada(s) por lista/etiqueta ausente.` : ''
        }`,
      );
      setCopyOpen(false);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setCopying(false);
    }
  };

  const applyNow = async (rule: Rule) => {
    if (demoMode) {
      notify({ kind: 'info', text: 'Indisponível no modo sem Trello.' });
      return;
    }
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
      await loadLog();
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
      await loadLog();
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
        subtitle="Cada regra pertence a um quadro. Por padrão, só altera cartões vinculados ao SEI; cada regra pode liberar cartões sem vínculo. Use as setas para mudar a ordem; cadeia limitada a 5 níveis."
        icon="refresh"
        footer={
          <div className="sfo-actions">
            <button type="button" className="sfo-btn sfo-btn--primary" onClick={addRule}>
              <Icon name="plus" size={14} />
              Nova regra
            </button>
            <button type="button" className="sfo-btn" onClick={saveNow} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? <Spinner /> : <Icon name="check" size={14} />}
              Salvar regras
            </button>
            <button
              type="button"
              className="sfo-btn"
              onClick={() => setExportOpen(true)}
              disabled={rules.length === 0}
            >
              <Icon name="external" size={14} />
              Exportar regras
            </button>
            <button type="button" className="sfo-btn" onClick={openImport}>
              <Icon name="link" size={14} />
              Importar regras
            </button>
            <button
              type="button"
              className="sfo-btn"
              onClick={openCopy}
              disabled={rules.length === 0 || boards.length < 2}
              title="Copiar as regras de um quadro para outro"
            >
              <Icon name="copy" size={14} />
              Copiar regras
            </button>
            <span className="sfo-hint">Backup completo (configurações + regras) em Opções → Backup.</span>
            <span className={`sfo-rules-save${saveState === 'error' ? ' sfo-rules-save--error' : ''}`}>
              {saveState === 'saving' ? (
                <Spinner />
              ) : (
                <Icon name={saveState === 'error' ? 'alert' : 'check'} size={13} />
              )}
              {saveState === 'saving'
                ? 'Salvando…'
                : saveState === 'error'
                  ? 'Falha ao salvar'
                  : 'Salvo automaticamente'}
            </span>
            <span style={{ flex: 1 }} />
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
              Última aplicação manual: <strong>{lastRun.ruleName}</strong> em {ruleRunCardCount(lastRun)}{' '}
              cartões · {new Date(lastRun.at).toLocaleString('pt-BR')}
            </span>
            <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => setUndoOpen(true)}>
              <Icon name="refresh" size={13} />
              Desfazer
            </button>
          </div>
        )}

        <div className="sfo-rules-board">
          <div className="sfo-field sfo-rules-board__field">
            <label htmlFor="sfo-rules-board">Quadro das regras</label>
            <select
              id="sfo-rules-board"
              className="sfo-select"
              value={activeBoardId}
              onChange={(event) => setActiveBoardId(event.target.value)}
              disabled={loading || (boards.length === 0 && !hasUnassignedRules)}
            >
              {hasUnassignedRules && <option value={UNASSIGNED_BOARD}>Sem quadro (modelos)</option>}
              {boards.length === 0 && !hasUnassignedRules && (
                <option value="">Nenhum quadro carregado</option>
              )}
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </div>
          <span className="sfo-hint sfo-rules-board__hint">
            {demoMode
              ? 'Modo sem Trello: as listas e etiquetas são de exemplo; aplicar regras fica indisponível.'
              : activeBoardId === UNASSIGNED_BOARD
                ? 'Atribua um quadro a cada modelo para configurar listas e etiquetas. Use “Copiar regras” para levar automações para outro quadro.'
                : 'As listas e etiquetas de cada regra são deste quadro. Use “Copiar regras” para levar automações para outro quadro.'}
          </span>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => void syncNow()}
            disabled={syncing || demoMode}
            title={
              demoMode ? 'Indisponível no modo sem Trello' : 'Buscar as regras salvas na sua conta do Trello'
            }
          >
            {syncing ? <Spinner /> : <Icon name="refresh" size={13} />}
            Sincronizar agora
          </button>
        </div>

        {loading ? (
          <div className="sfo-loading">
            <Spinner />
            <span>Carregando regras…</span>
          </div>
        ) : visibleRules.length === 0 ? (
          <p className="sfo-hint">
            {rules.length === 0
              ? 'Nenhuma regra configurada. Crie a primeira em “Nova regra”.'
              : 'Nenhuma regra neste quadro. Crie uma em “Nova regra” ou troque o quadro acima.'}
          </p>
        ) : (
          <div className="sfo-rules">
            {visibleRules.map((rule, index) => {
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
                      className="sfo-icon-btn"
                      onClick={() => duplicateRule(rule)}
                      title="Duplicar regra"
                      aria-label="Duplicar regra"
                    >
                      <Icon name="copy" size={13} />
                    </button>
                    <div className="sfo-rule__order">
                      <button
                        type="button"
                        className="sfo-icon-btn"
                        onClick={() => moveRule(rule.id, -1)}
                        disabled={index === 0}
                        title="Mover regra para cima"
                        aria-label="Mover regra para cima"
                      >
                        <Icon name="chevronUp" size={13} />
                      </button>
                      <button
                        type="button"
                        className="sfo-icon-btn"
                        onClick={() => moveRule(rule.id, 1)}
                        disabled={index === visibleRules.length - 1}
                        title="Mover regra para baixo"
                        aria-label="Mover regra para baixo"
                      >
                        <Icon name="chevronDown" size={13} />
                      </button>
                    </div>
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

                  {!rule.boardId && (
                    <div className="sfo-rule__row">
                      <span className="sfo-rule__label">Quadro</span>
                      <select
                        className="sfo-select"
                        value={rule.boardId}
                        onChange={(event) => assignRuleBoard(rule, event.target.value)}
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
                  )}

                  <div className="sfo-rule__row">
                    <span className="sfo-rule__label">Vínculo</span>
                    <label className="sfo-checkbox">
                      <input
                        type="checkbox"
                        checked={rule.requiresSeiLink !== false}
                        onChange={(event) => updateRule(rule.id, { requiresSeiLink: event.target.checked })}
                      />
                      Aplicar somente a cartões vinculados ao SEI
                    </label>
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

                  <div className="sfo-rule__row">
                    <span className="sfo-rule__label">Etiquetas</span>
                    <div className="sfo-rule__labels">
                      {boardLabels(rule.boardId).length === 0 ? (
                        <span className="sfo-hint">
                          {rule.boardId
                            ? 'Nenhuma etiqueta neste quadro.'
                            : 'Escolha o quadro para listar as etiquetas.'}
                        </span>
                      ) : (
                        boardLabels(rule.boardId).map((label) => {
                          const selected = (rule.trigger.labelIds ?? []).includes(label.id);
                          return (
                            <label
                              key={label.id}
                              className={`sfo-rule__label-chip${
                                selected ? ' sfo-rule__label-chip--active' : ''
                              }`}
                              style={{
                                backgroundColor: labelColorHex(label.color),
                                color: labelTextColor(label.color),
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleConditionLabel(rule, label.id)}
                                style={{ accentColor: labelTextColor(label.color) }}
                              />
                              {label.name || label.color || 'Etiqueta'}
                            </label>
                          );
                        })
                      )}
                    </div>
                    {(rule.trigger.labelIds?.length ?? 0) > 1 && (
                      <select
                        className="sfo-select"
                        value={rule.trigger.labelMode ?? 'any'}
                        onChange={(event) =>
                          updateRule(rule.id, {
                            trigger: {
                              ...rule.trigger,
                              labelMode: event.target.value === 'all' ? 'all' : 'any',
                            },
                          })
                        }
                        aria-label="Combinação das etiquetas"
                        title="Como combinar as etiquetas selecionadas"
                      >
                        <option value="any">Qualquer uma</option>
                        <option value="all">Todas</option>
                      </select>
                    )}
                  </div>

                  {rule.trigger.type === 'seiUpdated' && (
                    <p className="sfo-hint" style={{ margin: 0 }}>
                      Dispara quando a lista do SEI indicar novidade no processo vinculado. Roda uma vez por
                      novidade, em todos os cartões do processo que estejam neste quadro. Se a novidade for
                      detectada depois (por exemplo, com a extensão fechada), a regra roda na próxima leitura
                      da lista.
                    </p>
                  )}

                  {rule.trigger.type === 'created' && (
                    <p className="sfo-hint" style={{ margin: 0 }}>
                      Dispara quando o cartão é criado pela extensão (pelo SEI ou pelo painel). Não vale para
                      cartões criados fora da extensão.
                    </p>
                  )}

                  <p className="sfo-hint" style={{ margin: 0 }}>
                    As regras são avaliadas quando o painel, o quadro ou a lista do SEI é atualizado. Mudanças
                    feitas no site/app do Trello são detectadas na próxima atualização.
                  </p>

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
                                days: undefined,
                                text: undefined,
                                templateId: undefined,
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
                                const label = boardLabels(rule.boardId).find((item) => item.id === labelId);
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

                          {(action.type === 'setStartDate' || action.type === 'setDueDate') && (
                            <label className="sfo-rule__days">
                              <span>em</span>
                              <input
                                className="sfo-input"
                                type="number"
                                min={-MAX_DATE_OFFSET_DAYS}
                                max={MAX_DATE_OFFSET_DAYS}
                                step={1}
                                value={action.days ?? 0}
                                onChange={(event) =>
                                  updateAction(rule.id, index, {
                                    days: Number.isFinite(event.target.valueAsNumber)
                                      ? Math.trunc(event.target.valueAsNumber)
                                      : 0,
                                  })
                                }
                                aria-label="Dias em relação ao disparo"
                              />
                              <span>{action.days === 1 || action.days === -1 ? 'dia' : 'dias'}</span>
                              <span className="sfo-rule__days-hint">
                                {action.days === 0 ? '(hoje)' : '(a partir do disparo)'}
                              </span>
                            </label>
                          )}

                          {action.type === 'addComment' && (
                            <textarea
                              className="sfo-input sfo-rule__comment"
                              value={action.text ?? ''}
                              onChange={(event) => updateAction(rule.id, index, { text: event.target.value })}
                              rows={2}
                              maxLength={4000}
                              placeholder="Ex.: Cartão movido em {data}. Processo {processo}."
                              aria-label="Texto do comentário"
                            />
                          )}

                          {action.type === 'applyChecklist' && (
                            <select
                              className="sfo-select"
                              value={action.templateId ?? ''}
                              onChange={(event) =>
                                updateAction(rule.id, index, {
                                  templateId: event.target.value || undefined,
                                })
                              }
                              aria-label="Modelo de checklist"
                            >
                              <option value="">Escolha o modelo</option>
                              {checklistTemplates.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name} ({template.items.length})
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
                        <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => addAction(rule)}>
                          <Icon name="plus" size={13} />
                          Adicionar ação
                        </button>
                        <button
                          type="button"
                          className="sfo-btn sfo-btn--sm"
                          onClick={() => void applyNow(rule)}
                          disabled={busyRule === rule.id || Boolean(issue) || demoMode}
                          title={
                            demoMode
                              ? 'Indisponível no modo sem Trello'
                              : 'Aplicar esta regra apenas nos cartões que já estão na condição do gatilho'
                          }
                        >
                          {busyRule === rule.id ? <Spinner /> : <Icon name="refresh" size={13} />}
                          Aplicar agora
                        </button>
                      </div>
                      <p className="sfo-hint" style={{ margin: 0 }}>
                        Comentários aceitam {RULE_COMMENT_PLACEHOLDERS.join(', ')}.
                      </p>
                      {rule.actions.some((action) => action.type === 'applyChecklist') &&
                        checklistTemplates.length === 0 && (
                          <p className="sfo-hint" style={{ margin: 0 }}>
                            Nenhum modelo salvo. Abra a checklist de um cartão e use “Salvar como modelo”.
                          </p>
                        )}
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

        <details className="sfo-rule-log">
          <summary>
            <span className="sfo-rule-log__title">
              <Icon name="list" size={13} />
              Últimas execuções ({log.length})
            </span>
            <span className="sfo-rule-log__tools">
              <button
                type="button"
                className="sfo-btn sfo-btn--sm"
                onClick={(event) => {
                  event.preventDefault();
                  void loadLog();
                }}
              >
                Atualizar
              </button>
              <button
                type="button"
                className="sfo-btn sfo-btn--sm"
                onClick={(event) => {
                  event.preventDefault();
                  void callRpc('rules:clear-log', undefined).then(setLog);
                }}
              >
                Limpar
              </button>
            </span>
          </summary>
          {log.length === 0 ? (
            <p className="sfo-hint">
              Nenhuma regra foi aplicada ainda. Cada execução aparece aqui com o cartão e as ações.
            </p>
          ) : (
            <ul className="sfo-rule-log__list">
              {log.map((entry, index) => (
                <li key={`${entry.at}-${entry.ruleId}-${index}`}>
                  <span className="sfo-rule-log__time">{new Date(entry.at).toLocaleString('pt-BR')}</span>
                  <strong>{entry.ruleName}</strong>
                  <span>{entry.cardName || entry.cardId}</span>
                  <span className="sfo-rule-log__source">
                    {entry.source === 'manual' ? 'manual' : 'automática'}
                  </span>
                  <span className="sfo-rule-log__actions">
                    {entry.actions.join(' · ') || 'sem ações registradas'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </SectionCard>

      {confirmApply && (
        <ConfirmDialog
          title="Aplicar regra agora"
          message={`${triggerSummary(confirmApply.rule)}. Serão alterados ${confirmApply.matching} de ${confirmApply.total} cartões; os que já estão com a regra aplicada ficam de fora. As mudanças vão direto para o Trello e podem ser desfeitas depois.`}
          confirmLabel={`Aplicar em ${confirmApply.matching}`}
          busy={applying}
          onConfirm={() => void confirmApplyNow()}
          onClose={() => setConfirmApply(null)}
        />
      )}
      {undoOpen && lastRun && (
        <ConfirmDialog
          title="Desfazer aplicação"
          message={`Serão revertidas ${ruleRunChangeCount(lastRun)} alterações feitas em ${ruleRunCardCount(lastRun)} cartões pela regra "${lastRun.ruleName}". Cartões que mudaram de lista depois disso são mantidos como estão.`}
          confirmLabel="Desfazer"
          busy={undoing}
          onConfirm={() => void undoLastRun()}
          onClose={() => setUndoOpen(false)}
        />
      )}
      {exportOpen && (
        <Modal
          title="Exportar regras"
          subtitle={`${rules.length} regra(s) serão exportadas.`}
          size="sm"
          onClose={() => setExportOpen(false)}
          footer={
            <>
              <button type="button" className="sf-btn" onClick={() => setExportOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="sf-btn" onClick={() => void exportRules('clipboard')}>
                <Icon name="list" size={14} />
                Copiar regras
              </button>
              <button
                type="button"
                className="sf-btn sf-btn--primary"
                onClick={() => void exportRules('file')}
              >
                <Icon name="external" size={14} />
                Baixar JSON
              </button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--sf-text-soft)', fontSize: 13 }}>
            Copie o JSON para colar em outro computador ou baixe um arquivo. O conteúdo inclui apenas as
            regras.
          </p>
        </Modal>
      )}
      {importOpen && (
        <Modal
          title="Importar regras"
          subtitle="Cole o JSON exportado pelo SEI Flow ou selecione o arquivo."
          onClose={() => {
            if (!importing) setImportOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                className="sf-btn"
                onClick={() => setImportOpen(false)}
                disabled={importing}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="sf-btn"
                onClick={() => applyImport('merge')}
                disabled={importing || !importText.trim()}
              >
                Adicionar às existentes
              </button>
              <button
                type="button"
                className="sf-btn sf-btn--primary"
                onClick={() => applyImport('replace')}
                disabled={importing || !importText.trim()}
              >
                {importing ? <span className="sf-spinner" /> : <Icon name="check" size={14} />}
                Substituir tudo
              </button>
            </>
          }
        >
          <div className="sf-field">
            <label htmlFor="sfo-import-rules-file">Arquivo JSON</label>
            <input
              id="sfo-import-rules-file"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  setImportText(text);
                  setImportError(null);
                });
              }}
            />
          </div>
          <div className="sf-field">
            <label htmlFor="sfo-import-rules-text">Ou cole as regras</label>
            <textarea
              id="sfo-import-rules-text"
              className="sf-input"
              style={{ minHeight: 150, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportError(null);
              }}
              placeholder='{"app":"sei-flow-rules","rules":[...]}'
            />
          </div>
          {importError && (
            <p className="sf-hint" style={{ margin: 0, color: 'var(--sf-danger)' }}>
              {importError}
            </p>
          )}
          <p className="sf-hint" style={{ margin: 0 }}>
            <strong>Adicionar</strong> mantém as regras atuais e acrescenta as novas.{' '}
            <strong>Substituir tudo</strong> apaga as atuais e usa apenas as importadas.
          </p>
        </Modal>
      )}
      {copyOpen && (
        <Modal
          title="Copiar regras entre quadros"
          subtitle="As listas e etiquetas são associadas pelo nome."
          size="sm"
          onClose={() => {
            if (!copying) setCopyOpen(false);
          }}
          footer={
            <>
              <button type="button" className="sf-btn" onClick={() => setCopyOpen(false)} disabled={copying}>
                Cancelar
              </button>
              <button
                type="button"
                className="sf-btn sf-btn--primary"
                onClick={() => void copyRules()}
                disabled={copying || !copySource || !copyTarget || copySource === copyTarget}
              >
                {copying ? <span className="sf-spinner" /> : <Icon name="copy" size={14} />}
                Copiar regras
              </button>
            </>
          }
        >
          <div className="sf-field">
            <label htmlFor="sfo-copy-source">Quadro de origem</label>
            <select
              id="sfo-copy-source"
              className="sf-select"
              value={copySource}
              onChange={(event) => setCopySource(event.target.value)}
              disabled={copying}
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sf-field">
            <label htmlFor="sfo-copy-target">Quadro de destino</label>
            <select
              id="sfo-copy-target"
              className="sf-select"
              value={copyTarget}
              onChange={(event) => setCopyTarget(event.target.value)}
              disabled={copying}
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </div>
          <p className="sf-hint" style={{ margin: 0 }}>
            As regras do quadro de origem são copiadas para o destino, associando listas e etiquetas pelo
            nome. Regras com listas ou etiquetas que não existem no destino são ignoradas.
          </p>
        </Modal>
      )}
      {pendingReplace && (
        <ConfirmDialog
          title="Substituir todas as regras"
          message={`As ${rules.length} regra(s) atuais serão substituídas por ${pendingReplace.length} regra(s) importadas. Essa ação não pode ser desfeita.`}
          confirmLabel="Substituir tudo"
          tone="danger"
          busy={importing}
          onConfirm={() => void commitImport(pendingReplace, 'replace')}
          onClose={() => setPendingReplace(null)}
        />
      )}
    </>
  );
}
