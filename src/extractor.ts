/* MIT License - see LICENSE for details. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ExportedConversation,
  ExtractorConfig,
  ExtractorStrategy,
  ConversationReference,
} from './types.js';

const execFileAsync = promisify(execFile);

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

function deriveMarkdownFromMessages(messages: unknown[]): string {
  return messages
    .map((message) => {
      if (typeof message === 'string') {
        return message;
      }

      if (message && typeof message === 'object') {
        const role = 'role' in message ? String(message.role) : 'unknown';
        const content =
          'content' in message
            ? String(message.content)
            : JSON.stringify(message, null, 2);
        return `## ${role}\n\n${content}`;
      }

      return JSON.stringify(message);
    })
    .join('\n\n');
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

function normalizeExport(
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
          : 'messages' in raw && Array.isArray(raw.messages)
            ? deriveMarkdownFromMessages(raw.messages)
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

export async function ensureExtractorAvailable(
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

export async function listConversations(
  repoPath: string,
  config: ExtractorConfig,
): Promise<ConversationReference[]> {
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
  for (const strategy of config.exportStrategies) {
    try {
      const args = renderArgs(strategy, { repoPath, sessionId });
      const raw = await runJsonCommand(config.command, args);
      return normalizeExport(raw, sessionId);
    } catch {
      continue;
    }
  }

  throw new Error(
    `Failed to export conversation ${sessionId} with ${config.command}.`,
  );
}
