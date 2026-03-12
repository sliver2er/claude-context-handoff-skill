[English](./README.md) | [한국어](./README-ko.md)

# Claude Context Handoff Skill

## 개요

`claude-context-handoff-skill`은 한 저장소의 Claude Code 대화 맥락을 다른 저장소로 넘길 때, 원본 저장소 경로와 대상 저장소 경로, 원래 사용하던 `CLAUDE.md`, 그리고 선택적인 `.claude/` 구성 복사 결과를 함께 보존하는 오픈소스 Claude Skill + CLI 프로젝트입니다.

## 왜 유용한가

여러 저장소를 오가며 작업할 때 Claude는 이전 대화에서 언급된 상대 경로와 규칙이 어느 저장소 기준인지 잃어버리기 쉽습니다. 이 프로젝트는 handoff 메타데이터와 명시적인 instruction block을 생성해서 다음 저장소에서도 대화 출처와 경로 해석 기준을 유지하게 합니다.

## 추출 엔진

기본 extractor는 이 저장소 안에 내장되어 있고, MIT 라이선스인 [`claude-conversation-extractor`](https://github.com/ZeroSumQuant/claude-conversation-extractor) 프로젝트의 JSONL 파싱 로직을 바탕으로 옮겨 왔습니다. 기본적으로 `~/.claude/projects`를 직접 읽습니다.

다른 워크플로우가 필요하면 `CCH_EXTRACTOR_MODE=external`과 `CCH_EXTRACTOR_BIN`을 사용해 외부 extractor 바이너리로 전환할 수 있습니다.

## 설치

1. Node.js 20+와 `pnpm`을 준비합니다.
2. 한 번의 명령으로 스킬을 설치합니다.
3. 로컬 개발이 필요하면 별도로 이 저장소를 클론해 의존성을 설치합니다.

```bash
npx github:sliver2er/claude-context-handoff-skill install-skill --yes
```

글로벌 Claude 스킬 디렉터리 대신 현재 레포의 `.claude/skills`에 설치하려면:

```bash
npx github:sliver2er/claude-context-handoff-skill install-skill --scope repo --repo . --yes
```

로컬 개발용으로는:

```bash
pnpm install
pnpm build
```

선택적으로 설정 파일 `claude-context-handoff.config.json`을 저장소 루트나 상위 디렉터리에 둘 수 있습니다.

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

## 사용 방법: 소스 저장소에서 handoff 저장

```bash
npx github:sliver2er/claude-context-handoff-skill save --source /path/to/source-repo
```

이 명령은 대화 목록을 보여 주고, 선택한 세션의 transcript와 메타데이터를 `~/.claude-context-handoff/handoffs/<handoff-id>/` 아래에 저장합니다.

## 사용 방법: 타깃 레포에서 Claude 바로 시작

```bash
npx github:sliver2er/claude-context-handoff-skill start --source /path/to/source-repo --target /path/to/target-repo
```

이 명령은 handoff를 저장하고 타깃 레포에 적용한 뒤, macOS에서는 새 Terminal 창을 열어 타깃 저장소에서 Claude Code를 바로 시작합니다. Claude는 시작하자마자 handoff 메타데이터 파일을 먼저 읽도록 유도됩니다.

## 사용 방법: 타깃 저장소에서 handoff 적용

```bash
npx github:sliver2er/claude-context-handoff-skill apply --target /path/to/target-repo
```

이 명령은 저장된 handoff를 고르게 하고, Claude가 새 대화에서 읽을 수 있는 JSON payload와 Markdown instruction 파일을 타깃 저장소의 `.claude/context-handoffs/`에 기록합니다.

## `.claude/` 복사 옵션

지원 모드는 `none`, `skills`, `config`, `mcp`, `all`입니다.

- `skills`: `.claude/skills`
- `config`: `.claude/config.*`, `.claude/settings.*`
- `mcp`: `.claude/mcp*`

충돌이 있으면 `skip`, `overwrite`, `rename` 전략을 선택합니다. `rename`은 `-from-source` 접미사를 붙입니다. 명백한 절대 경로는 타깃 저장소 기준으로 치환하고, 애매한 경로는 메타데이터 경고로 남깁니다.

## 주의할 점

- 내장 extractor가 `~/.claude/projects`를 찾지 못하면 `CCH_CLAUDE_PROJECTS_DIR`을 지정하거나 외부 모드로 전환해야 합니다.
- 원본 저장소에 `CLAUDE.md`가 없으면 해당 필드는 `null`로 기록됩니다.
- 손상된 handoff 메타데이터는 검증 단계에서 에러로 중단됩니다.

## Demo / 데모 영상 (coming soon)

추후 데모 링크 또는 임베드 영상을 추가할 자리입니다.
