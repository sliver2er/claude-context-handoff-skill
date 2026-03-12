/* MIT License - see LICENSE for details. */
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';

import { copyRecursive, ensureDir, pathExists, writeJson } from './utils/fs.js';

const SKILL_DIR_NAME = 'claude-context-handoff-skill';
const SKILL_FILES = [
  'SKILL.md',
  'SKILL-ko.md',
  'README.md',
  'README-ko.md',
  'LICENSE',
];
const SKILL_DIRS = ['agents', 'examples'];

export type SkillInstallScope = 'global' | 'repo';

export interface InstallSkillOptions {
  packageRoot: string;
  destinationRoot: string;
  scope: SkillInstallScope;
  force: boolean;
}

export interface InstallSkillResult {
  installDir: string;
  scope: SkillInstallScope;
  installedFiles: string[];
}

export function getGlobalSkillRoot(): string {
  return path.join(os.homedir(), '.claude', 'skills');
}

export function getRepoSkillRoot(repoRoot: string): string {
  return path.join(repoRoot, '.claude', 'skills');
}

export async function installSkillFiles(
  options: InstallSkillOptions,
): Promise<InstallSkillResult> {
  const installDir = path.join(options.destinationRoot, SKILL_DIR_NAME);
  const installedFiles: string[] = [];

  if (await pathExists(installDir)) {
    if (!options.force) {
      throw new Error(
        `Skill is already installed at ${installDir}. Re-run with --force to replace it.`,
      );
    }

    await rm(installDir, { recursive: true, force: true });
  }

  await ensureDir(installDir);

  for (const fileName of SKILL_FILES) {
    const sourcePath = path.join(options.packageRoot, fileName);
    if (!(await pathExists(sourcePath))) {
      continue;
    }

    const targetPath = path.join(installDir, fileName);
    await copyRecursive(sourcePath, targetPath);
    installedFiles.push(targetPath);
  }

  for (const dirName of SKILL_DIRS) {
    const sourcePath = path.join(options.packageRoot, dirName);
    if (!(await pathExists(sourcePath))) {
      continue;
    }

    const targetPath = path.join(installDir, dirName);
    await copyRecursive(sourcePath, targetPath);
    installedFiles.push(targetPath);
  }

  await writeJson(path.join(installDir, 'install-manifest.json'), {
    installedAt: new Date().toISOString(),
    packageRoot: options.packageRoot,
    scope: options.scope,
    installedFiles,
  });
  installedFiles.push(path.join(installDir, 'install-manifest.json'));

  return {
    installDir,
    scope: options.scope,
    installedFiles,
  };
}
