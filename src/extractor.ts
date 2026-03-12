/* MIT License - see LICENSE for details. */
/* Portions of the built-in JSONL parser are adapted from the MIT-licensed
 * claude-conversation-extractor project:
 * https://github.com/ZeroSumQuant/claude-conversation-extractor
 */
import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ConversationReference,
  ExportedConversation,
  ExtractorConfig,
  ExtractorMode,
  ExtractorStrategy,
} from './types.js';
import { pathExists } from './utils/fs.js';

const execFileAsync = promisify(execFile);

interface BuiltinMessage {
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: string | null;
}

function renderArgs(
  strategy: ExtractorStrategy,
  replacements: Record<string, string>,
): string[] {
  return strategy.args.map((value) => {
    if (!value.startsWith('{') || !value.endsWith('}')) {
      return value;
    }

    const key = value.slice(1, -1);
    return replacements[key] ?? value;
  });
}

function summarizeTranscript(markdown: string): {
  shortSummary: string;
  longSummary: string;
} {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
  const shortSummary =
    lines.slice(0, 3).join(' ').slice(0, 240) || 'No summary available.';
  const longSummary =
    lines.join('\n').slice(0, 1200) || 'No summary available.';
  return { shortSummary, longSummary };
}

function deriveMarkdownFromMessages(messages: BuiltinMessage[]): string {
  return messages
    .map((message) => {
      const heading =
        message.role === 'user'
          ? '## User'
          : message.role === 'assistant'
            ? '## Claude'
            : message.role === 'tool_use'
              ? '### Tool Use'
              : message.role === 'tool_result'
                ? '### Tool Result'
                : '### System';
      return `${heading}\n\n${message.content}`;
    })
    .join('\n\n---\n\n');
}

function normalizeConversationList(raw: unknown): ConversationReference[] {
  if (Array.isArray(raw)) {
    return raw.map((item, index) => {
      if (item && typeof item === 'object') {
        return {
          id: String('id' in item ? item.id : index),
          title: String('title' in item ? item.title : 'Untitled conversation'),
          createdAt: 'createdAt' in item ? String(item.createdAt) : null,
          updatedAt: 'updatedAt' in item ? String(item.updatedAt) : null,
          label: 'label' in item ? String(item.label) : null,
        };
      }

      return {
        id: String(index),
        title: String(item),
      };
    });
  }

  if (raw && typeof raw === 'object') {
    const sessions =
      'sessions' in raw && Array.isArray(raw.sessions) ? raw.sessions : [];
    return normalizeConversationList(sessions);
  }

  return [];
}

function normalizeExternalExport(
  raw: unknown,
  sessionId: string,
): ExportedConversation {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Extractor returned an unexpected export payload.');
  }

  const title =
    'title' in raw ? String(raw.title) : `Conversation ${sessionId}`;
  const markdown =
    'transcriptMarkdown' in raw && typeof raw.transcriptMarkdown === 'string'
      ? raw.transcriptMarkdown
      : 'markdown' in raw && typeof raw.markdown === 'string'
        ? raw.markdown
        : 'transcript' in raw && typeof raw.transcript === 'string'
          ? raw.transcript
          : JSON.stringify(raw, null, 2);

  const { shortSummary, longSummary } = summarizeTranscript(markdown);

  return {
    sessionId,
    title,
    transcriptMarkdown: markdown,
    rawTranscript: raw,
    summaryShort:
      'summaryShort' in raw && typeof raw.summaryShort === 'string'
        ? raw.summaryShort
        : shortSummary,
    summaryLong:
      'summaryLong' in raw && typeof raw.summaryLong === 'string'
        ? raw.summaryLong
        : longSummary,
  };
}

async function runJsonCommand(
  command: string,
  args: string[],
): Promise<unknown> {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function tryParseJson(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function extractTextContent(content: unknown, includeToolUse: boolean): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      if ('type' in item && item.type === 'text' && 'text' in item) {
        parts.push(String(item.text));
      }

      if (
        includeToolUse &&
        'type' in item &&
        item.type === 'tool_use' &&
        'name' in item
      ) {
        const toolName = String(item.name);
        const toolInput =
          'input' in item ? JSON.stringify(item.input, null, 2) : '{}';
        parts.push(`Tool use: ${toolName}\n${toolInput}`);
      }
    }

    return parts.join('\n').trim();
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }

  return String(content ?? '');
}

function cleanPreviewText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldSkipUserContent(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes(
      'the messages below were generated by the user while running local commands',
    ) ||
    normalized.includes('session is being continued') ||
    normalized.includes('[request interrupted') ||
    normalized.startsWith('tool_use_id') ||
    normalized.includes('command-name') ||
    normalized.includes('command-message') ||
    normalized.includes('local-command-stdout')
  );
}

function encodeRepoPathForClaudeProjects(repoPath: string): string {
  return path.resolve(repoPath).replaceAll(/[:\\/]/g, '-');
}

async function sortByMtimeDescending(filePaths: string[]): Promise<string[]> {
  const entries = await Promise.all(
    filePaths.map(async (filePath) => ({
      filePath,
      stats: await stat(filePath),
    })),
  );

  return entries
    .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)
    .map((entry) => entry.filePath);
}

async function listJsonlFiles(dirPath: string): Promise<string[]> {
  if (!(await pathExists(dirPath))) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(dirPath, entry.name));
}

async function readSessionHeaderMatchesRepo(
  filePath: string,
  repoPath: string,
): Promise<boolean> {
  const content = await readFile(filePath, 'utf8');
  for (const line of content.split('\n').slice(0, 16)) {
    const parsed = tryParseJson(line);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'cwd' in parsed &&
      parsed.cwd === path.resolve(repoPath)
    ) {
      return true;
    }
  }

  return false;
}

async function collectBuiltinSessionPaths(
  repoPath: string,
  config: ExtractorConfig,
): Promise<string[]> {
  const encodedProjectPath = encodeRepoPathForClaudeProjects(repoPath);
  const directPaths = await listJsonlFiles(
    path.join(config.claudeProjectsDir, encodedProjectPath),
  );
  if (directPaths.length > 0) {
    return sortByMtimeDescending(directPaths);
  }

  if (!(await pathExists(config.claudeProjectsDir))) {
    return [];
  }

  const projectDirs = await readdir(config.claudeProjectsDir, {
    withFileTypes: true,
  });
  const matchedPaths: string[] = [];

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidatePaths = await listJsonlFiles(
      path.join(config.claudeProjectsDir, entry.name),
    );
    for (const candidatePath of candidatePaths) {
      if (await readSessionHeaderMatchesRepo(candidatePath, repoPath)) {
        matchedPaths.push(candidatePath);
      }
    }
  }

  return sortByMtimeDescending(matchedPaths);
}

async function getConversationPreview(sessionPath: string): Promise<{
  preview: string;
  firstTimestamp: string | null;
}> {
  const content = await readFile(sessionPath, 'utf8');
  let preview = 'No preview available';
  let firstTimestamp: string | null = null;

  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    const parsed = tryParseJson(line);
    if (!parsed || typeof parsed !== 'object') {
      continue;
    }

    if (
      !firstTimestamp &&
      'timestamp' in parsed &&
      typeof parsed.timestamp === 'string'
    ) {
      firstTimestamp = parsed.timestamp;
    }

    if (preview !== 'No preview available') {
      continue;
    }

    if (
      'type' in parsed &&
      parsed.type === 'user' &&
      'message' in parsed &&
      parsed.message &&
      typeof parsed.message === 'object'
    ) {
      const message = parsed.message as { role?: string; content?: unknown };
      if (message.role !== 'user') {
        continue;
      }

      const candidate = cleanPreviewText(
        extractTextContent(message.content, false),
      );
      if (candidate.length > 3 && !shouldSkipUserContent(candidate)) {
        preview = candidate.slice(0, 100);
      }
    }
  }

  return { preview, firstTimestamp };
}

function buildBuiltinTitle(repoPath: string, preview: string): string {
  const repoName = path.basename(repoPath);
  return preview === 'No preview available'
    ? `${repoName} conversation`
    : `${repoName}: ${preview}`;
}

async function listBuiltinConversations(
  repoPath: string,
  config: ExtractorConfig,
): Promise<ConversationReference[]> {
  const sessionPaths = await collectBuiltinSessionPaths(repoPath, config);
  const references = await Promise.all(
    sessionPaths.map(async (sessionPath) => {
      const { preview, firstTimestamp } =
        await getConversationPreview(sessionPath);
      const fileStats = await stat(sessionPath);
      const sessionId = path.basename(sessionPath, '.jsonl');

      return {
        id: sessionId,
        title: buildBuiltinTitle(repoPath, preview),
        createdAt: firstTimestamp,
        updatedAt: fileStats.mtime.toISOString(),
        label: preview,
      } satisfies ConversationReference;
    }),
  );

  return references.sort((left, right) =>
    (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''),
  );
}

async function exportBuiltinConversation(
  repoPath: string,
  sessionId: string,
  config: ExtractorConfig,
): Promise<ExportedConversation> {
  const sessionPaths = await collectBuiltinSessionPaths(repoPath, config);
  const sessionPath = sessionPaths.find(
    (candidate) => path.basename(candidate, '.jsonl') === sessionId,
  );

  if (!sessionPath) {
    throw new Error(
      `No Claude Code session ${sessionId} was found for ${repoPath}.`,
    );
  }

  const content = await readFile(sessionPath, 'utf8');
  const messages: BuiltinMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    const parsed = tryParseJson(line);
    if (!parsed || typeof parsed !== 'object') {
      continue;
    }

    const timestamp =
      'timestamp' in parsed && typeof parsed.timestamp === 'string'
        ? parsed.timestamp
        : null;

    if (
      'type' in parsed &&
      parsed.type === 'user' &&
      'message' in parsed &&
      parsed.message &&
      typeof parsed.message === 'object'
    ) {
      const message = parsed.message as { role?: string; content?: unknown };
      if (message.role === 'user') {
        const extracted = extractTextContent(message.content, false).trim();
        if (extracted && !shouldSkipUserContent(extracted)) {
          messages.push({ role: 'user', content: extracted, timestamp });
        }
      }
      continue;
    }

    if (
      'type' in parsed &&
      parsed.type === 'assistant' &&
      'message' in parsed &&
      parsed.message &&
      typeof parsed.message === 'object'
    ) {
      const message = parsed.message as { role?: string; content?: unknown };
      if (message.role === 'assistant') {
        const extracted = extractTextContent(message.content, true).trim();
        if (extracted) {
          messages.push({
            role: 'assistant',
            content: extracted,
            timestamp,
          });
        }
      }
      continue;
    }

    if ('type' in parsed && parsed.type === 'tool_use') {
      const toolName =
        'tool' in parsed &&
        parsed.tool &&
        typeof parsed.tool === 'object' &&
        'name' in parsed.tool
          ? String(parsed.tool.name)
          : 'unknown';
      const toolInput =
        'tool' in parsed &&
        parsed.tool &&
        typeof parsed.tool === 'object' &&
        'input' in parsed.tool
          ? JSON.stringify(parsed.tool.input, null, 2)
          : '{}';
      messages.push({
        role: 'tool_use',
        content: `Tool: ${toolName}\nInput: ${toolInput}`,
        timestamp,
      });
      continue;
    }

    if ('type' in parsed && parsed.type === 'tool_result') {
      const result =
        'result' in parsed ? JSON.stringify(parsed.result, null, 2) : '';
      if (result) {
        messages.push({ role: 'tool_result', content: result, timestamp });
      }
      continue;
    }

    if ('type' in parsed && parsed.type === 'system') {
      const systemContent =
        'content' in parsed && typeof parsed.content === 'string'
          ? parsed.content
          : 'message' in parsed
            ? String(parsed.message)
            : '';
      if (systemContent) {
        messages.push({
          role: 'system',
          content: systemContent,
          timestamp,
        });
      }
    }
  }

  if (messages.length === 0) {
    throw new Error(
      `Session ${sessionId} did not contain exportable messages.`,
    );
  }

  const { preview } = await getConversationPreview(sessionPath);
  const transcriptMarkdown = deriveMarkdownFromMessages(messages);
  const { shortSummary, longSummary } = summarizeTranscript(transcriptMarkdown);

  return {
    sessionId,
    title: buildBuiltinTitle(repoPath, preview),
    transcriptMarkdown,
    rawTranscript: {
      source: 'builtin-jsonl-parser',
      sessionPath,
      repoPath,
      messages,
    },
    summaryShort: shortSummary,
    summaryLong: longSummary,
  };
}

async function ensureExternalExtractorAvailable(
  config: ExtractorConfig,
): Promise<void> {
  try {
    await execFileAsync(config.command, ['--help'], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    throw new Error(
      `Unable to execute ${config.command}. Install claude-conversation-extractor or set CCH_EXTRACTOR_BIN / claude-context-handoff.config.json.`,
      { cause: error },
    );
  }
}

async function canUseExternalExtractor(
  config: ExtractorConfig,
): Promise<boolean> {
  try {
    await execFileAsync(config.command, ['--help'], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function resolveMode(config: ExtractorConfig): Promise<ExtractorMode> {
  if (config.mode === 'auto') {
    if (await canUseExternalExtractor(config)) {
      return 'external';
    }
    return 'builtin';
  }

  return config.mode;
}

export async function ensureExtractorAvailable(
  config: ExtractorConfig,
): Promise<void> {
  const mode = await resolveMode(config);
  if (mode === 'external') {
    await ensureExternalExtractorAvailable(config);
    return;
  }

  if (!(await pathExists(config.claudeProjectsDir))) {
    throw new Error(
      `Claude projects directory not found: ${config.claudeProjectsDir}. Set CCH_CLAUDE_PROJECTS_DIR or switch to external mode.`,
    );
  }
}

export async function listConversations(
  repoPath: string,
  config: ExtractorConfig,
): Promise<ConversationReference[]> {
  const mode = await resolveMode(config);
  if (mode === 'builtin') {
    return listBuiltinConversations(repoPath, config);
  }

  for (const strategy of config.listStrategies) {
    try {
      const args = renderArgs(strategy, { repoPath });
      const raw = await runJsonCommand(config.command, args);
      const conversations = normalizeConversationList(raw);
      if (conversations.length > 0) {
        return conversations;
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function exportConversation(
  repoPath: string,
  sessionId: string,
  config: ExtractorConfig,
): Promise<ExportedConversation> {
  const mode = await resolveMode(config);
  if (mode === 'builtin') {
    return exportBuiltinConversation(repoPath, sessionId, config);
  }

  for (const strategy of config.exportStrategies) {
    try {
      const args = renderArgs(strategy, { repoPath, sessionId });
      const raw = await runJsonCommand(config.command, args);
      return normalizeExternalExport(raw, sessionId);
    } catch {
      continue;
    }
  }

  throw new Error(
    `Failed to export conversation ${sessionId} with ${config.command}.`,
  );
}
