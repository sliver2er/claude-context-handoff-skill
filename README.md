[English](./README.md) | [한국어](./README-ko.md)

# Claude Context Handoff Skill

## Overview

`claude-context-handoff-skill` is an open-source Claude Skill + CLI for moving Claude Code conversation context from one repository to another while preserving the source repo path, target repo path, original `CLAUDE.md`, and optional `.claude/` transfer results.

## Why it is useful

When work moves across repositories, Claude can lose track of which repository a relative path or convention originally referred to. This project generates durable handoff metadata plus an explicit instruction block so future conversations can retain origin and path-mapping context.

## Extraction engine

The default extractor is built into this repository and is adapted from the MIT-licensed [`claude-conversation-extractor`](https://github.com/ZeroSumQuant/claude-conversation-extractor) project. It reads Claude Code JSONL sessions directly from `~/.claude/projects`.

You can still switch to an external extractor binary through `CCH_EXTRACTOR_MODE=external` and `CCH_EXTRACTOR_BIN` if you need compatibility with another workflow.

## Installation

1. Prepare Node.js 20+ and `pnpm`.
2. Clone this repository and install dependencies.
3. Build the CLI.
4. Place this repository at `~/.claude/skills/claude-context-handoff-skill`, or copy the root `SKILL.md` and `agents/` metadata with the bundled CLI.

```bash
pnpm install
pnpm build
```

You can optionally define a `claude-context-handoff.config.json` file in the repository root or a parent directory.

```json
{
  "extractor": {
    "mode": "builtin",
    "claudeProjectsDir": "/Users/you/.claude/projects",
    "command": "claude-conversation-extractor",
    "listStrategies": [{ "args": ["list", "--repo", "{repoPath}", "--json"] }],
    "exportStrategies": [
      {
        "args": [
          "export",
          "--repo",
          "{repoPath}",
          "--session",
          "{sessionId}",
          "--json"
        ]
      }
    ]
  }
}
```

## Usage: save a handoff from the source repo

```bash
pnpm build
node dist/cli.js save --source /path/to/source-repo
```

This command shows available conversations and stores the selected session transcript plus metadata under `~/.claude-context-handoff/handoffs/<handoff-id>/`.

## Usage: apply a handoff in the target repo

```bash
node dist/cli.js apply --target /path/to/target-repo
```

This command lets you choose a saved handoff and writes a Claude-ready JSON payload plus Markdown instruction file to `.claude/context-handoffs/` inside the target repository.

## `.claude/` transfer options

Supported modes are `none`, `skills`, `config`, `mcp`, and `all`.

- `skills`: `.claude/skills`
- `config`: `.claude/config.*`, `.claude/settings.*`
- `mcp`: `.claude/mcp*`

When conflicts exist, choose `skip`, `overwrite`, or `rename`. The `rename` strategy adds a `-from-source` suffix. Obvious absolute paths are rewritten for the target repository; ambiguous paths are recorded as warnings in metadata for manual review.

## Watch-outs

- If the built-in extractor cannot find `~/.claude/projects`, set `CCH_CLAUDE_PROJECTS_DIR` or switch to external mode.
- If the source repository has no `CLAUDE.md`, the field is stored as `null`.
- Corrupted handoff metadata stops execution during schema validation.

## Demo / 데모 영상 (coming soon)

Placeholder for a future demo link or embedded video.
