#!/usr/bin/env node
/* MIT License - see LICENSE for details. */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Command } from 'commander';

import {
  applyHandoff,
  buildClaudeLaunchCommand,
  copyClaudeContent,
  ensureExtractorAvailable,
  exportConversation,
  findSourceClaudeMd,
  getGlobalSkillRoot,
  getRepoSkillRoot,
  installSkillFiles,
  launchClaudeInNewTerminal,
  listConversations,
  listHandoffs,
  loadAppConfig,
  loadHandoff,
  pathExists,
  resolveGitRoot,
  saveHandoff,
  targetHasSupportedClaudeConflicts,
} from './index.js';
import type {
  ApplyOptions,
  ConflictStrategy,
  CopyMode,
  HandoffMetadata,
} from './types.js';
import {
  promptForConfirmation,
  promptForConflictStrategy,
  promptForConversation,
  promptForCopyMode,
  promptForHandoff,
  promptForLabel,
} from './utils/prompts.js';

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function resolveCopyOptions(
  sourceRepoPath: string,
  targetRepoPath: string,
  requestedCopyMode?: CopyMode,
  requestedConflictStrategy?: ConflictStrategy,
): Promise<{
  copyMode: CopyMode;
  conflictStrategy: ConflictStrategy | null;
}> {
  const copyMode = requestedCopyMode ?? (await promptForCopyMode());
  const targetClaudePath = path.join(targetRepoPath, '.claude');
  const hasExistingClaudeDir = await pathExists(targetClaudePath);
  const hasSupportedConflicts =
    copyMode === 'none'
      ? false
      : await targetHasSupportedClaudeConflicts({
          sourceRepoPath,
          targetRepoPath,
          mode: copyMode,
        });
  const conflictStrategy =
    copyMode === 'none' || !hasExistingClaudeDir || !hasSupportedConflicts
      ? null
      : (requestedConflictStrategy ?? (await promptForConflictStrategy()));

  return { copyMode, conflictStrategy };
}

async function resolveHandoffSelection(
  handoffs: HandoffMetadata[],
  requestedId?: string,
): Promise<HandoffMetadata> {
  if (requestedId) {
    const match = handoffs.find((handoff) => handoff.handoffId === requestedId);
    if (!match) {
      throw new Error(`Unknown handoff id: ${requestedId}`);
    }

    return match;
  }

  if (handoffs.length === 1) {
    return handoffs[0];
  }

  return promptForHandoff(handoffs);
}

const program = new Command();
program
  .name('claude-context-handoff')
  .description('Path-aware Claude Code context handoff between repositories.')
  .option('--json', 'Print machine-readable output', false);

program
  .command('save')
  .description(
    'Export a Claude Code conversation from a source repository into a durable handoff.',
  )
  .option('--source <path>', 'Source repository path', process.cwd())
  .option('--target <path>', 'Optional target repository path')
  .option('--label <label>', 'User label for the handoff')
  .option('--session <id>', 'Explicit conversation session id to export')
  .option('--latest', 'Use the latest conversation without prompting', false)
  .option('--yes', 'Skip confirmation prompts', false)
  .action(async (commandOptions, command) => {
    const sourceRepoPath = await resolveGitRoot(
      path.resolve(commandOptions.source),
    );
    const targetRepoPath = commandOptions.target
      ? await resolveGitRoot(path.resolve(commandOptions.target))
      : null;
    const config = await loadAppConfig(sourceRepoPath);
    await ensureExtractorAvailable(config.extractor);

    const conversations = await listConversations(
      sourceRepoPath,
      config.extractor,
    );
    if (conversations.length === 0) {
      throw new Error(
        `No Claude Code conversations were found for ${sourceRepoPath}.`,
      );
    }

    const selectedConversation = commandOptions.session
      ? conversations.find(
          (conversation) => conversation.id === commandOptions.session,
        )
      : commandOptions.latest
        ? conversations[0]
        : await promptForConversation(conversations);
    if (!selectedConversation) {
      throw new Error('Unable to resolve the requested conversation.');
    }

    const exportedConversation = await exportConversation(
      sourceRepoPath,
      selectedConversation.id,
      config.extractor,
    );
    const label =
      commandOptions.label ??
      (await promptForLabel(
        selectedConversation.label ?? selectedConversation.title,
      ));
    const sourceClaudeMdPath = await findSourceClaudeMd(sourceRepoPath);

    const summary = [
      'Create handoff with these settings?',
      `- source: ${sourceRepoPath}`,
      `- target: ${targetRepoPath ?? 'not set yet'}`,
      `- conversation: ${selectedConversation.title} (${selectedConversation.id})`,
      `- label: ${label}`,
      `- source CLAUDE.md: ${sourceClaudeMdPath ?? 'not found'}`,
    ].join('\n');
    if (!commandOptions.yes && !(await promptForConfirmation(summary))) {
      throw new Error('Aborted by user.');
    }

    const metadata = await saveHandoff({
      config,
      sourceRepoPath,
      targetRepoPath,
      sourceClaudeMdPath,
      label,
      exportedConversation,
    });

    if (command.parent?.opts().json) {
      printJson(metadata);
      return;
    }

    process.stdout.write(
      `Saved handoff ${metadata.handoffId} in ${config.handoffHome}\n`,
    );
  });

program
  .command('apply')
  .description(
    'Apply a saved handoff in a target repository and emit Claude-ready metadata.',
  )
  .option('--target <path>', 'Target repository path', process.cwd())
  .option('--handoff-id <id>', 'Saved handoff id to apply')
  .option('--copy <mode>', 'Copy mode: none|skills|config|mcp|all')
  .option(
    '--conflict-strategy <strategy>',
    'Conflict strategy: skip|overwrite|rename',
  )
  .option('--yes', 'Skip confirmation prompts', false)
  .action(async (commandOptions, command) => {
    const targetRepoPath = await resolveGitRoot(
      path.resolve(commandOptions.target),
    );
    const config = await loadAppConfig(targetRepoPath);
    const handoffs = await listHandoffs(config);
    if (handoffs.length === 0) {
      throw new Error(`No saved handoffs were found in ${config.handoffHome}.`);
    }

    const selectedHandoff = await resolveHandoffSelection(
      handoffs,
      commandOptions.handoffId,
    );
    const { copyMode, conflictStrategy } = await resolveCopyOptions(
      selectedHandoff.sourceRepoPath,
      targetRepoPath,
      commandOptions.copy as CopyMode | undefined,
      commandOptions.conflictStrategy as ConflictStrategy | undefined,
    );

    const summary = [
      'Apply handoff with these settings?',
      `- handoff: ${selectedHandoff.label} (${selectedHandoff.handoffId})`,
      `- source: ${selectedHandoff.sourceRepoPath}`,
      `- target: ${targetRepoPath}`,
      `- copy mode: ${copyMode}`,
      `- conflict strategy: ${conflictStrategy ?? 'n/a'}`,
    ].join('\n');
    if (!commandOptions.yes && !(await promptForConfirmation(summary))) {
      throw new Error('Aborted by user.');
    }

    const transfer =
      copyMode === 'none'
        ? null
        : await copyClaudeContent({
            sourceRepoPath: selectedHandoff.sourceRepoPath,
            targetRepoPath,
            mode: copyMode,
            strategy: conflictStrategy,
          });
    const payload = await applyHandoff({
      config,
      metadata: await loadHandoff(config, selectedHandoff.handoffId),
      applyOptions: {
        targetRepoPath,
        handoffId: selectedHandoff.handoffId,
        copyMode,
        conflictStrategy,
      } satisfies ApplyOptions,
      transfer,
    });

    if (command.parent?.opts().json) {
      printJson(payload);
      return;
    }

    process.stdout.write(`${payload.instructionBlock}\n\n`);
    process.stdout.write(
      `Saved target payload to ${path.join(targetRepoPath, '.claude', 'context-handoffs')}\n`,
    );
  });

program
  .command('start')
  .description(
    'Save a handoff from the source repo, apply it in the target repo, and launch Claude Code in a new terminal window.',
  )
  .option('--source <path>', 'Source repository path', process.cwd())
  .option('--target <path>', 'Target repository path')
  .option('--label <label>', 'User label for the handoff')
  .option('--session <id>', 'Explicit conversation session id to export')
  .option('--latest', 'Use the latest conversation without prompting', false)
  .option('--copy <mode>', 'Copy mode: none|skills|config|mcp|all', 'none')
  .option(
    '--conflict-strategy <strategy>',
    'Conflict strategy: skip|overwrite|rename',
  )
  .option(
    '--no-launch',
    'Prepare and apply the handoff without opening a terminal window',
  )
  .option('--yes', 'Skip confirmation prompts', false)
  .action(async (commandOptions, command) => {
    if (!commandOptions.target) {
      throw new Error('A target repository path is required for start.');
    }

    const sourceRepoPath = await resolveGitRoot(
      path.resolve(commandOptions.source),
    );
    const targetRepoPath = await resolveGitRoot(
      path.resolve(commandOptions.target),
    );
    const config = await loadAppConfig(sourceRepoPath);
    await ensureExtractorAvailable(config.extractor);

    const conversations = await listConversations(
      sourceRepoPath,
      config.extractor,
    );
    if (conversations.length === 0) {
      throw new Error(
        `No Claude Code conversations were found for ${sourceRepoPath}.`,
      );
    }

    const selectedConversation = commandOptions.session
      ? conversations.find(
          (conversation) => conversation.id === commandOptions.session,
        )
      : commandOptions.latest
        ? conversations[0]
        : await promptForConversation(conversations);
    if (!selectedConversation) {
      throw new Error('Unable to resolve the requested conversation.');
    }

    const exportedConversation = await exportConversation(
      sourceRepoPath,
      selectedConversation.id,
      config.extractor,
    );
    const label =
      commandOptions.label ??
      (await promptForLabel(
        selectedConversation.label ?? selectedConversation.title,
      ));
    const sourceClaudeMdPath = await findSourceClaudeMd(sourceRepoPath);
    const { copyMode, conflictStrategy } = await resolveCopyOptions(
      sourceRepoPath,
      targetRepoPath,
      commandOptions.copy as CopyMode,
      commandOptions.conflictStrategy as ConflictStrategy | undefined,
    );

    const summary = [
      'Start a new target Claude session with these settings?',
      `- source: ${sourceRepoPath}`,
      `- target: ${targetRepoPath}`,
      `- conversation: ${selectedConversation.title} (${selectedConversation.id})`,
      `- label: ${label}`,
      `- copy mode: ${copyMode}`,
      `- conflict strategy: ${conflictStrategy ?? 'n/a'}`,
      `- launch terminal: ${commandOptions.launch ? 'yes' : 'no'}`,
    ].join('\n');
    if (!commandOptions.yes && !(await promptForConfirmation(summary))) {
      throw new Error('Aborted by user.');
    }

    const draftMetadata = await saveHandoff({
      config,
      sourceRepoPath,
      targetRepoPath,
      sourceClaudeMdPath,
      label,
      exportedConversation,
    });
    const transfer =
      copyMode === 'none'
        ? null
        : await copyClaudeContent({
            sourceRepoPath,
            targetRepoPath,
            mode: copyMode,
            strategy: conflictStrategy,
          });
    const payload = await applyHandoff({
      config,
      metadata: await loadHandoff(config, draftMetadata.handoffId),
      applyOptions: {
        targetRepoPath,
        handoffId: draftMetadata.handoffId,
        copyMode,
        conflictStrategy,
      } satisfies ApplyOptions,
      transfer,
    });
    const launchResult = commandOptions.launch
      ? await launchClaudeInNewTerminal({
          handoffId: payload.handoffId,
          targetRepoPath,
        })
      : buildClaudeLaunchCommand({
          handoffId: payload.handoffId,
          targetRepoPath,
        });

    if (command.parent?.opts().json) {
      printJson({
        payload,
        launch: launchResult,
      });
      return;
    }

    process.stdout.write(`${payload.instructionBlock}\n\n`);
    process.stdout.write(
      `Prepared target payload at ${launchResult.metadataPath}\n`,
    );
    if (launchResult.launched) {
      process.stdout.write(
        'Opened a new Terminal window and started Claude Code.\n',
      );
      return;
    }

    process.stdout.write(
      `Run this command in the target repo to continue:\n${launchResult.command}\n`,
    );
  });

program
  .command('list')
  .description('List saved handoffs.')
  .action(async () => {
    const config = await loadAppConfig(process.cwd());
    const handoffs = await listHandoffs(config);
    printJson(handoffs);
  });

program
  .command('install-skill')
  .description(
    'Install this skill into ~/.claude/skills or the current repository .claude/skills.',
  )
  .option('--scope <scope>', 'Install scope: global|repo', 'global')
  .option(
    '--repo <path>',
    'Repository path for repo-scoped installation',
    process.cwd(),
  )
  .option('--force', 'Replace an existing installed skill', false)
  .option('--yes', 'Skip confirmation prompts', false)
  .action(async (commandOptions, command) => {
    const scope = commandOptions.scope as 'global' | 'repo';
    if (scope !== 'global' && scope !== 'repo') {
      throw new Error(`Unsupported install scope: ${commandOptions.scope}`);
    }

    const destinationRoot =
      scope === 'global'
        ? getGlobalSkillRoot()
        : getRepoSkillRoot(
            await resolveGitRoot(path.resolve(commandOptions.repo)),
          );
    const summary = [
      'Install skill with these settings?',
      `- scope: ${scope}`,
      `- destination: ${destinationRoot}`,
      `- package root: ${getPackageRoot()}`,
      `- force replace: ${commandOptions.force ? 'yes' : 'no'}`,
    ].join('\n');
    if (!commandOptions.yes && !(await promptForConfirmation(summary))) {
      throw new Error('Aborted by user.');
    }

    const result = await installSkillFiles({
      packageRoot: getPackageRoot(),
      destinationRoot,
      scope,
      force: commandOptions.force,
    });

    if (command.parent?.opts().json) {
      printJson(result);
      return;
    }

    process.stdout.write(`Installed skill to ${result.installDir}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
