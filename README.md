# Claude Context Handoff Skill

## Korean / 한국어

### 개요

`claude-context-handoff-skill`은 한 저장소의 Claude Code 대화 맥락을 다른 저장소로 넘길 때, 원본 저장소 경로와 대상 저장소 경로, 원래 사용하던 `CLAUDE.md`, 그리고 선택적인 `.claude/` 구성 복사 결과를 함께 보존하는 오픈소스 Claude Skill + CLI 프로젝트입니다.

### 왜 유용한가

여러 저장소를 오가며 작업할 때 Claude는 이전 대화에서 언급된 상대 경로와 규칙이 어느 저장소 기준인지 잃어버리기 쉽습니다. 이 프로젝트는 handoff 메타데이터와 명시적인 instruction block을 생성해서 다음 저장소에서도 대화 출처와 경로 해석 기준을 유지하게 합니다.

### 설치

1. Node.js 20+와 `pnpm`을 준비합니다.
2. 저장소를 클론한 뒤 의존성을 설치합니다.
3. 외부 CLI인 `claude-conversation-extractor`를 설치하거나, `CCH_EXTRACTOR_BIN` 또는 `claude-context-handoff.config.json`으로 경로를 지정합니다.
4. 이 저장소 전체를 `~/.claude/skills/claude-context-handoff-skill`로 두거나, 루트의 `SKILL.md`와 `agents/`를 포함해 복사합니다.

```bash
pnpm install
pnpm build
```

선택적으로 설정 파일 `claude-context-handoff.config.json`을 저장소 루트나 상위 디렉터리에 둘 수 있습니다.

```json
{
  "extractor": {
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

### 사용 방법: 소스 저장소에서 handoff 저장

```bash
pnpm build
node dist/cli.js save --source /path/to/source-repo
```

이 명령은 대화 목록을 보여 주고, 선택한 세션의 transcript와 메타데이터를 `~/.claude-context-handoff/handoffs/<handoff-id>/` 아래에 저장합니다.

### 사용 방법: 타깃 저장소에서 handoff 적용

```bash
node dist/cli.js apply --target /path/to/target-repo
```

이 명령은 저장된 handoff를 고르게 하고, Claude가 새 대화에서 읽을 수 있는 JSON payload와 Markdown instruction 파일을 타깃 저장소의 `.claude/context-handoffs/`에 기록합니다.

### `.claude/` 복사 옵션

지원 모드는 `none`, `skills`, `config`, `mcp`, `all`입니다.

- `skills`: `.claude/skills`
- `config`: `.claude/config.*`, `.claude/settings.*`
- `mcp`: `.claude/mcp*`

충돌이 있으면 `skip`, `overwrite`, `rename` 전략을 선택합니다. `rename`은 `-from-source` 접미사를 붙입니다. 명백한 절대 경로는 타깃 저장소 기준으로 치환하고, 애매한 경로는 메타데이터 경고로 남깁니다.

### 주의할 점

- `claude-conversation-extractor`가 없거나 예상과 다른 CLI 인터페이스를 가지면 설정 파일로 전략을 맞춰야 합니다.
- 원본 저장소에 `CLAUDE.md`가 없으면 해당 필드는 `null`로 기록됩니다.
- 손상된 handoff 메타데이터는 검증 단계에서 에러로 중단됩니다.

### Demo / 데모 영상 (coming soon)

추후 데모 링크 또는 임베드 영상을 추가할 자리입니다.

## English

### Overview

`claude-context-handoff-skill` is an open-source Claude Skill + CLI for moving Claude Code conversation context from one repository to another while preserving the source repo path, target repo path, original `CLAUDE.md`, and optional `.claude/` transfer results.

### Why it is useful

When work moves across repositories, Claude can lose track of which repository a relative path or convention originally referred to. This project generates durable handoff metadata plus an explicit instruction block so future conversations can retain origin and path-mapping context.

### Installation

1. Prepare Node.js 20+ and `pnpm`.
2. Clone this repository and install dependencies.
3. Install the external `claude-conversation-extractor` CLI, or point to it with `CCH_EXTRACTOR_BIN` or `claude-context-handoff.config.json`.
4. Place this repository at `~/.claude/skills/claude-context-handoff-skill`, or copy the root `SKILL.md` and `agents/` metadata with the bundled CLI.

```bash
pnpm install
pnpm build
```

You can optionally define a `claude-context-handoff.config.json` file in the repository root or a parent directory.

```json
{
  "extractor": {
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

### Usage: save a handoff from the source repo

```bash
pnpm build
node dist/cli.js save --source /path/to/source-repo
```

This command shows available conversations and stores the selected session transcript plus metadata under `~/.claude-context-handoff/handoffs/<handoff-id>/`.

### Usage: apply a handoff in the target repo

```bash
node dist/cli.js apply --target /path/to/target-repo
```

This command lets you choose a saved handoff and writes a Claude-ready JSON payload plus Markdown instruction file to `.claude/context-handoffs/` inside the target repository.

### `.claude/` transfer options

Supported modes are `none`, `skills`, `config`, `mcp`, and `all`.

- `skills`: `.claude/skills`
- `config`: `.claude/config.*`, `.claude/settings.*`
- `mcp`: `.claude/mcp*`

When conflicts exist, choose `skip`, `overwrite`, or `rename`. The `rename` strategy adds a `-from-source` suffix. Obvious absolute paths are rewritten for the target repository; ambiguous paths are recorded as warnings in metadata for manual review.

### Watch-outs

- If `claude-conversation-extractor` is missing or exposes a different CLI shape, align the strategies with a config file.
- If the source repository has no `CLAUDE.md`, the field is stored as `null`.
- Corrupted handoff metadata stops execution during schema validation.

### Demo / 데모 영상 (coming soon)

Placeholder for a future demo link or embedded video.
