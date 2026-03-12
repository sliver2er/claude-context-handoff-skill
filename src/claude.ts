/* MIT License - see LICENSE for details. */
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from './utils/fs.js';

export async function findSourceClaudeMd(
  repoRoot: string,
): Promise<string | null> {
  const rootCandidate = path.join(repoRoot, 'CLAUDE.md');
  if (await pathExists(rootCandidate)) {
    return rootCandidate;
  }

  const entries = await readdir(repoRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name.startsWith('.git') || entry.name === 'node_modules') {
      continue;
    }

    const nestedCandidate = path.join(repoRoot, entry.name, 'CLAUDE.md');
    if (await pathExists(nestedCandidate)) {
      return nestedCandidate;
    }
  }

  return null;
}
