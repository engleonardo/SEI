import { browser } from 'wxt/browser';

const TEMPLATES_KEY = 'sei-flow:checklist-templates:v1';
const MAX_NAME = 120;
const MAX_ITEMS = 100;
const MAX_ITEM_LENGTH = 500;

/** Modelo de checklist reutilizável entre cartões (salvo localmente). */
export interface ChecklistTemplate {
  id: string;
  name: string;
  items: string[];
  updatedAt: number;
}

function newTemplateId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `checklist_${Date.now().toString(36)}_${random}`;
}

function normalizeText(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function sanitizeTemplate(value: unknown): ChecklistTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? normalizeText(raw.name, MAX_NAME) : '';
  if (!name) return null;
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeText(item, MAX_ITEM_LENGTH))
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : [];
  if (items.length === 0) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newTemplateId(),
    name,
    items,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
  };
}

export async function listChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const stored = await browser.storage.local.get(TEMPLATES_KEY);
  const current = stored?.[TEMPLATES_KEY];
  if (!Array.isArray(current)) return [];
  return current
    .map(sanitizeTemplate)
    .filter((template): template is ChecklistTemplate => Boolean(template))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Substitui todos os modelos (sincronização/backup), preservando os IDs para
 * que as regras que apontam para `templateId` continuem funcionando.
 */
export async function replaceChecklistTemplates(values: unknown): Promise<ChecklistTemplate[]> {
  const next = Array.isArray(values)
    ? values
        .map(sanitizeTemplate)
        .filter((template): template is ChecklistTemplate => Boolean(template))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    : [];
  await browser.storage.local.set({ [TEMPLATES_KEY]: next });
  return next;
}

export async function saveChecklistTemplate(input: {
  id?: string;
  name: string;
  items: string[];
}): Promise<ChecklistTemplate[]> {
  const templates = await listChecklistTemplates();
  const candidate = sanitizeTemplate({ ...input, updatedAt: Date.now() });
  if (!candidate) {
    throw new Error('Informe um nome e pelo menos um item para salvar o modelo.');
  }
  const exists = templates.some((template) => template.id === candidate.id);
  const next = exists
    ? templates.map((template) => (template.id === candidate.id ? candidate : template))
    : [...templates, candidate];
  await browser.storage.local.set({ [TEMPLATES_KEY]: next });
  return next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function deleteChecklistTemplate(id: string): Promise<ChecklistTemplate[]> {
  const templates = await listChecklistTemplates();
  const next = templates.filter((template) => template.id !== id);
  await browser.storage.local.set({ [TEMPLATES_KEY]: next });
  return next;
}
