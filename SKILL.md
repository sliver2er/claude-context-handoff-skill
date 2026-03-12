---
name: claude-context-handoff-skill
description: Use this skill when Claude needs to move Claude Code conversation context from one repository to another while preserving source/target paths, CLAUDE.md provenance, and optional .claude transfer metadata.
---

# Claude Context Handoff Skill

Use this skill when the user wants to continue work from one repository in another repository without losing where earlier context came from.

## What this skill does

- Exports a Claude Code conversation from a source repository by calling an external `claude-conversation-extractor` CLI.
- Saves durable handoff artifacts with transcript, summaries, source/target path metadata, and source `CLAUDE.md` provenance.
- Applies a saved handoff inside a target repository and writes Claude-readable payload files into `.claude/context-handoffs/`.
- Optionally copies supported `.claude/` content (`skills`, `config`, `mcp`) from source to target and records exactly what was copied, skipped, renamed, or needs manual review.

## When Claude should suggest this skill

Suggest this skill proactively when:

- the user says they want to continue the same work in another repository
- the user wants Claude to know where previous relative paths originally pointed
- the user wants to reuse or migrate `.claude/skills`, Claude config, or MCP setup between repos
- the user asks where a prior conversation came from, or which `CLAUDE.md` defined earlier conventions

## Inputs

Expected inputs:

- `source repo path`
- `target repo path` if known
- conversation selection strategy: latest, explicit session id, or interactive choice
- handoff label
- `.claude/` copy mode: `none`, `skills`, `config`, `mcp`, `all`
- conflict strategy when target files already exist: `skip`, `overwrite`, `rename`

Optional configuration:

- `CCH_EXTRACTOR_BIN`
- `CCH_HANDOFF_HOME`
- `claude-context-handoff.config.json` for extractor command and argument strategies

## How to use the metadata

When the tool returns or writes handoff metadata:

- Treat `sourceRepoPath` as the authoritative repository root for paths mentioned in the old conversation.
- Treat `targetRepoPath` as the repository root for new edits and new commands.
- Treat `sourceClaudeMdPath` as the original instruction source even if that file was not copied into the target repo.
- Read `relativePathGuidance` before reasoning about `./src/...`, `packages/...`, or similar relative references from older messages.
- Read `probablePathCorrespondences` as best-effort hints, not guaranteed mappings.
- Read the `transfer` record before assuming `.claude/` skills, config, or MCP files exist in the target repo.

## Recommended workflow

1. In the source repo, run `node dist/cli.js save --source <source-repo>`.
2. In the target repo, run `node dist/cli.js apply --target <target-repo>`.
3. Read `.claude/context-handoffs/<handoff-id>.json` and `.md`.
4. Prepend or summarize the `instructionBlock` when starting the new Claude conversation.

## Example user utterances

Korean:

- "이 레포에서 하던 Claude Code 작업을 다른 레포로 넘기고 싶어."
- "이전 대화 경로 기준을 유지한 채로 새 저장소에서 이어서 작업하게 해줘."
- "원본 `CLAUDE.md`가 어디였는지까지 같이 넘겨줘."

English:

- "Move this Claude Code context into another repository."
- "Start a new session in the target repo but keep the original path mapping."
- "Copy only the source `.claude/skills` and record where the handoff came from."

## Safety rules

- Always confirm source and target repo paths before writing metadata or copying `.claude/` content.
- Always show the selected conversation, handoff label, and copy strategy before execution.
- If extractor output cannot be parsed, stop and report the failure rather than guessing.
- If copied config still contains repo-specific absolute paths, mark them in metadata warnings.
