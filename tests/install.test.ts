/* MIT License - see LICENSE for details. */
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { installSkillFiles } from '../src/install.js';
import { pathExists, readJson } from '../src/utils/fs.js';

describe('skill installer', () => {
  it('copies skill docs and metadata into the target skills directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cch-install-'));
    const packageRoot = path.join(root, 'package');
    const destinationRoot = path.join(root, 'target', '.claude', 'skills');
    await mkdir(path.join(packageRoot, 'agents'), { recursive: true });
    await mkdir(path.join(packageRoot, 'examples'), { recursive: true });
    await writeFile(path.join(packageRoot, 'SKILL.md'), '# Skill', 'utf8');
    await writeFile(path.join(packageRoot, 'SKILL-ko.md'), '# 스킬', 'utf8');
    await writeFile(path.join(packageRoot, 'README.md'), '# Readme', 'utf8');
    await writeFile(path.join(packageRoot, 'README-ko.md'), '# 리드미', 'utf8');
    await writeFile(path.join(packageRoot, 'LICENSE'), 'MIT', 'utf8');
    await writeFile(
      path.join(packageRoot, 'agents', 'openai.yaml'),
      'version: 1',
      'utf8',
    );

    const result = await installSkillFiles({
      packageRoot,
      destinationRoot,
      scope: 'global',
      force: false,
    });

    expect(result.installDir).toContain('claude-context-handoff-skill');
    expect(await pathExists(path.join(result.installDir, 'SKILL.md'))).toBe(
      true,
    );
    expect(await pathExists(path.join(result.installDir, 'README-ko.md'))).toBe(
      true,
    );
    const manifest = await readJson<{ scope: string }>(
      path.join(result.installDir, 'install-manifest.json'),
    );
    expect(manifest.scope).toBe('global');
  });
});
