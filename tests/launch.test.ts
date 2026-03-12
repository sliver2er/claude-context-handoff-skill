/* MIT License - see LICENSE for details. */
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildClaudeLaunchCommand } from '../src/launch.js';

describe('launch workflow', () => {
  it('builds a claude command that reads the generated handoff artifacts first', () => {
    const result = buildClaudeLaunchCommand({
      handoffId: 'handoff-123',
      targetRepoPath: '/tmp/target-repo',
    });

    expect(result.launched).toBe(false);
    expect(result.command).toContain(`cd '/tmp/target-repo'`);
    expect(result.command).toContain('claude --append-system-prompt');
    expect(result.command).toContain(
      '.claude/context-handoffs/handoff-123.json',
    );
    expect(result.instructionsPath).toBe(
      path.join(
        '/tmp/target-repo',
        '.claude',
        'context-handoffs',
        'handoff-123.md',
      ),
    );
    expect(result.metadataPath).toBe(
      path.join(
        '/tmp/target-repo',
        '.claude',
        'context-handoffs',
        'handoff-123.json',
      ),
    );
  });
});
