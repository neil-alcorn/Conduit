import { Initiative, Quadrant, quadrant, loadInitiatives } from '../internal/initiatives.js';
import { resolveRepoPath, resolveConvoyRoot } from '../utils.js';

const TITLES: Record<Quadrant, string> = {
  do: 'DO NOW (urgent + important)',
  schedule: 'SCHEDULE (important, not urgent)',
  delegate: 'DELEGATE (urgent, not important)',
  delete: 'DELETE / DEFER (neither)',
};
const ORDER: Quadrant[] = ['do', 'schedule', 'delegate', 'delete'];

export function renderMatrix(items: Initiative[]): string {
  const active = items.filter((i) => i.status === 'active');
  if (active.length === 0) {
    return 'CONDUIT: no initiatives yet. Create one: conduit initiative new --title "..." --urgency high --importance high';
  }
  const lines: string[] = [];
  for (const q of ORDER) {
    lines.push(`\n${TITLES[q]}`);
    const inQ = active.filter((i) => quadrant(i) === q);
    if (inQ.length === 0) lines.push('  (none)');
    else for (const i of inQ) lines.push(`  - ${i.title} (${i.id})`);
  }
  const top = active.find((i) => quadrant(i) === 'do');
  if (top) lines.push(`\nNext: ${top.title} (${top.id})`);
  return lines.join('\n');
}

export async function runMatrix(args: string[], rootOverride?: string): Promise<void> {
  let root: string;
  if (rootOverride !== undefined) {
    root = rootOverride;
  } else {
    const { repoPath } = resolveRepoPath(args);
    root = resolveConvoyRoot(repoPath);
  }
  console.log(renderMatrix(loadInitiatives(root)));
}
