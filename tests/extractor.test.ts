/* MIT License - see LICENSE for details. */
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  ensureExtractorAvailable,
  exportConversation,
  listConversations,
} from '../src/extractor.js';
import type { ExtractorConfig } from '../src/types.js';

describe('extractor adapter', () => {
  it('supports configurable external extractor commands', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cch-extractor-'));
    const mockExtractor = path.join(root, 'mock-extractor.mjs');
    await writeFile(
      mockExtractor,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('help');
  process.exit(0);
}
if (args[0] === 'list') {
  console.log(JSON.stringify([{ id: 's1', title: 'Latest session', updatedAt: '2026-03-12T00:00:00Z' }]));
  process.exit(0);
}
if (args[0] === 'export') {
  console.log(JSON.stringify({ title: 'Latest session', transcriptMarkdown: '## user\\n\\nhello', summaryShort: 'hello', summaryLong: 'hello world' }));
  process.exit(0);
}
process.exit(1);
`,
      { encoding: 'utf8', mode: 0o755 },
    );

    const config: ExtractorConfig = {
      command: mockExtractor,
      listStrategies: [{ args: ['list', '--repo', '{repoPath}', '--json'] }],
      exportStrategies: [
        {
          args: [
            'export',
            '--repo',
            '{repoPath}',
            '--session',
            '{sessionId}',
            '--json',
          ],
        },
      ],
    };

    await ensureExtractorAvailable(config);
    const conversations = await listConversations('/tmp/source', config);
    const exported = await exportConversation('/tmp/source', 's1', config);

    expect(conversations[0]?.id).toBe('s1');
    expect(exported.sessionId).toBe('s1');
    expect(exported.transcriptMarkdown).toContain('hello');
  });
});
