/* MIT License - see LICENSE for details. */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import type {
  AppConfig,
  ApplyOptions,
  ApplyPayload,
  ApplyRecord,
  ExportedConversation,
  HandoffMetadata,
  TransferRecord,
} from './types.js';
import { handoffMetadataSchema } from './schema.js';
import {
  ensureDir,
  listDirectoryNames,
  readJson,
  writeJson,
  writeText,
} from './utils/fs.js';
import {
  buildRelativePathGuidance,
  detectProbablePathCorrespondences,
  normalizeNewlines,
  slugify,
  toPortablePath,
} from './utils/paths.js';

function buildInstructionBlock(
  metadata: HandoffMetadata,
  targetRepoPath: string,
): string {
  // Claude should read these fields literally to preserve origin, path interpretation, and CLAUDE.md provenance.
  return [
    'Context handoff active.',
    `- Source repository: ${metadata.sourceRepoPath}`,
    `- Target repository: ${targetRepoPath}`,
    `- Original CLAUDE.md: ${metadata.sourceClaudeMdPath ?? 'not found'}`,
    `- Original conversation title: ${metadata.conversationTitle}`,
    '- Path interpretation:',
    `  - Paths mentioned in the original conversation were relative to ${metadata.sourceRepoPath}.`,
    `  - Paths you suggest now must be relative to ${targetRepoPath}.`,
    '  - If a referenced source path does not exist here, explain the mismatch before suggesting an alternative.',
  ].join('\n');
}

function createHandoffId(label: string): string {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '')
    .replaceAll('.', '-');
  return `${timestamp}-${slugify(label) || 'handoff'}`;
}

export async function saveHandoff(options: {
  config: AppConfig;
  sourceRepoPath: string;
  targetRepoPath: string | null;
  sourceClaudeMdPath: string | null;
  label: string;
  exportedConversation: ExportedConversation;
}): Promise<HandoffMetadata> {
  const {
    config,
    sourceRepoPath,
    targetRepoPath,
    sourceClaudeMdPath,
    label,
    exportedConversation,
  } = options;
  const handoffId = createHandoffId(label);
  const handoffDir = path.join(config.handoffHome, handoffId);
  await ensureDir(handoffDir);

  const transcriptJsonPath = path.join(handoffDir, 'transcript.json');
  const contextMarkdownPath = path.join(handoffDir, 'context.md');

  await writeJson(transcriptJsonPath, exportedConversation.rawTranscript);
  await writeText(
    contextMarkdownPath,
    normalizeNewlines(exportedConversation.transcriptMarkdown),
  );

  const metadata: HandoffMetadata = {
    handoffId,
    label,
    createdAt: new Date().toISOString(),
    sourceRepoPath,
    sourceRepoPortablePath: toPortablePath(sourceRepoPath),
    targetRepoPath,
    targetRepoPortablePath: targetRepoPath
      ? toPortablePath(targetRepoPath)
      : null,
    sourceRepoName: path.basename(sourceRepoPath),
    targetRepoName: targetRepoPath ? path.basename(targetRepoPath) : null,
    sourceClaudeMdPath,
    extractorSessionRef: exportedConversation.sessionId,
    conversationTitle: exportedConversation.title,
    conversationSummaryShort:
      exportedConversation.summaryShort ?? 'No summary available.',
    conversationSummaryLong:
      exportedConversation.summaryLong ?? 'No summary available.',
    contextMarkdownPath,
    transcriptJsonPath,
    relativePathGuidance: buildRelativePathGuidance(
      sourceRepoPath,
      targetRepoPath ?? '<target repo pending>',
    ),
    probablePathCorrespondences: [],
    transfer: null,
    applications: [],
  };

  await writeJson(path.join(handoffDir, 'handoff.json'), metadata);
  return metadata;
}

export async function listHandoffs(
  config: AppConfig,
): Promise<HandoffMetadata[]> {
  await ensureDir(config.handoffHome);
  const handoffIds = await listDirectoryNames(config.handoffHome);
  const handoffs: HandoffMetadata[] = [];

  for (const handoffId of handoffIds) {
    const metadataPath = path.join(
      config.handoffHome,
      handoffId,
      'handoff.json',
    );
    try {
      const raw = await readJson<unknown>(metadataPath);
      const metadata = handoffMetadataSchema.parse(raw);
      handoffs.push(metadata);
    } catch (error) {
      throw new Error(
        `Handoff metadata is corrupted or missing required fields: ${metadataPath}`,
        {
          cause: error,
        },
      );
    }
  }

  return handoffs.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function loadHandoff(
  config: AppConfig,
  handoffId: string,
): Promise<HandoffMetadata> {
  const metadataPath = path.join(config.handoffHome, handoffId, 'handoff.json');
  const raw = await readJson<unknown>(metadataPath);
  return handoffMetadataSchema.parse(raw);
}

export async function applyHandoff(options: {
  config: AppConfig;
  metadata: HandoffMetadata;
  applyOptions: ApplyOptions;
  transfer: TransferRecord | null;
}): Promise<ApplyPayload> {
  const { config, metadata, applyOptions, transfer } = options;
  const transcriptMarkdown = await readFile(
    metadata.contextMarkdownPath,
    'utf8',
  );
  const targetRepoPath = applyOptions.targetRepoPath;
  const probablePathCorrespondences = await detectProbablePathCorrespondences(
    metadata.sourceRepoPath,
    targetRepoPath,
  );
  const relativePathGuidance = buildRelativePathGuidance(
    metadata.sourceRepoPath,
    targetRepoPath,
  );
  const instructionBlock = buildInstructionBlock(metadata, targetRepoPath);

  const payload: ApplyPayload = {
    handoffId: metadata.handoffId,
    label: metadata.label,
    sourceRepoPath: metadata.sourceRepoPath,
    targetRepoPath,
    sourceClaudeMdPath: metadata.sourceClaudeMdPath,
    conversationTitle: metadata.conversationTitle,
    conversationSummaryShort: metadata.conversationSummaryShort,
    conversationSummaryLong: metadata.conversationSummaryLong,
    relativePathGuidance,
    probablePathCorrespondences,
    instructionBlock,
    transcriptMarkdown,
    transfer,
  };

  const targetMetadataDir = path.join(
    targetRepoPath,
    '.claude',
    'context-handoffs',
  );
  const metadataOutputPath = path.join(
    targetMetadataDir,
    `${metadata.handoffId}.json`,
  );
  const instructionsOutputPath = path.join(
    targetMetadataDir,
    `${metadata.handoffId}.md`,
  );
  await writeJson(metadataOutputPath, payload);
  await writeText(
    instructionsOutputPath,
    `${instructionBlock}\n\n${transcriptMarkdown}`,
  );

  const nextApplyRecord: ApplyRecord = {
    appliedAt: new Date().toISOString(),
    targetRepoPath,
    copyMode: applyOptions.copyMode,
    conflictStrategy: applyOptions.conflictStrategy,
    metadataOutputPath,
    instructionsOutputPath,
  };

  const updatedMetadata: HandoffMetadata = {
    ...metadata,
    targetRepoPath,
    targetRepoPortablePath: toPortablePath(targetRepoPath),
    targetRepoName: path.basename(targetRepoPath),
    relativePathGuidance,
    probablePathCorrespondences,
    transfer,
    applications: [...metadata.applications, nextApplyRecord],
  };

  await writeJson(
    path.join(config.handoffHome, metadata.handoffId, 'handoff.json'),
    updatedMetadata,
  );
  return payload;
}
