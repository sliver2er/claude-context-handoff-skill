/* MIT License - see LICENSE for details. */
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { findSourceClaudeMd } from '../src/claude.js';
import { ensureExtractorAvailable } from '../src/extractor.js';
import { listHandoffs } from '../src/handoff.js';
import type { AppConfig } from '../src/types.js';
import { resolveGitRoot } from '../src/utils/git.js';

function buildConfig(root: string): AppConfig {
  return {
    handoffHome: path.join(root, 'handoffs'),
    extractor: {
      mode: 'external',
      command: 'missing-extractor-binary',
      claudeProjectsDir: path.join(root, '.claude', 'projects'),
      listStrategies: [],
      exportStrategies: [],
    },
  };
}

describe('edge cases', () => {
  it('returns null when no source CLAUDE.md exists', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'cch-claude-md-'));
    await mkdir(path.join(repoRoot, 'src'), { recursive: true });
    await expect(findSourceClaudeMd(repoRoot)).resolves.toBeNull();
  });

  it('fails clearly when extractor is missing', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'cch-missing-extractor-'),
    );
    await expect(
      ensureExtractorAvailable(buildConfig(root).extractor),
    ).rejects.toThrow(/Unable to execute/);
  });

  it('rejects corrupted handoff metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cch-corrupt-handoff-'));
    const handoffDir = path.join(root, 'handoffs', 'broken-handoff');
    await mkdir(handoffDir, { recursive: true });
    await writeFile(
      path.join(handoffDir, 'handoff.json'),
      '{"broken":true}',
      'utf8',
    );

    await expect(listHandoffs(buildConfig(root))).rejects.toThrow(
      /corrupted or missing/,
    );
  });

  it('rejects non-git repositories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cch-non-git-'));
    await expect(resolveGitRoot(root)).rejects.toThrow(/not a git repository/);
  });
});
