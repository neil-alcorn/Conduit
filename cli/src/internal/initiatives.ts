import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

export type Level = 'high' | 'low';
export interface Initiative {
  id: string;
  title: string;
  urgency: Level;
  importance: Level;
  status: 'active' | 'done';
}
export type Quadrant = 'do' | 'schedule' | 'delegate' | 'delete';

export function quadrant(i: Initiative): Quadrant {
  if (i.importance === 'high') return i.urgency === 'high' ? 'do' : 'schedule';
  return i.urgency === 'high' ? 'delegate' : 'delete';
}

function registryPath(root: string): string {
  return path.join(root, 'initiatives', 'registry.yaml');
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'initiative';
}

export function loadInitiatives(root: string): Initiative[] {
  const p = registryPath(root);
  if (!fs.existsSync(p)) return [];
  const doc = yaml.load(fs.readFileSync(p, 'utf8')) as { initiatives?: Initiative[] } | null;
  return doc?.initiatives ?? [];
}

export function saveInitiatives(root: string, list: Initiative[]): void {
  const p = registryPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, yaml.dump({ initiatives: list }, { lineWidth: 100 }), 'utf8');
}

export function addInitiative(
  root: string,
  opts: { title: string; urgency?: Level; importance?: Level },
): Initiative {
  const list = loadInitiatives(root);
  const base = slugify(opts.title);
  let id = base;
  let n = 2;
  while (list.some((x) => x.id === id)) id = `${base}-${n++}`;
  const created: Initiative = {
    id,
    title: opts.title,
    urgency: opts.urgency ?? 'low',
    importance: opts.importance ?? 'low',
    status: 'active',
  };
  list.push(created);
  saveInitiatives(root, list);
  return created;
}

export function setInitiative(
  root: string,
  id: string,
  patch: Partial<Pick<Initiative, 'urgency' | 'importance' | 'status'>>,
): Initiative {
  const list = loadInitiatives(root);
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`CONDUIT: no initiative with id '${id}'`);
  Object.assign(found, patch);
  saveInitiatives(root, list);
  return found;
}
