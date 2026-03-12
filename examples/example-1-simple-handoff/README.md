# Example 1: Simple handoff without copying `.claude/`

## Korean / 한국어

소스 저장소에서 대화를 저장하고, 타깃 저장소에서 `.claude/`를 복사하지 않고 적용하는 예시입니다.

```bash
node dist/cli.js save --source /workspace/repo-a --label "repo-a bugfix context"
node dist/cli.js apply --target /workspace/repo-b --copy none
```

결과:

- handoff transcript와 metadata가 `~/.claude-context-handoff/handoffs/<handoff-id>/`에 저장됩니다.
- 타깃 저장소에는 `.claude/context-handoffs/<handoff-id>.json`과 `.md`가 생성됩니다.

## English

This example saves a conversation from the source repository and applies it in the target repository without copying `.claude/`.

```bash
node dist/cli.js save --source /workspace/repo-a --label "repo-a bugfix context"
node dist/cli.js apply --target /workspace/repo-b --copy none
```

Result:

- The handoff transcript and metadata are stored under `~/.claude-context-handoff/handoffs/<handoff-id>/`.
- The target repository receives `.claude/context-handoffs/<handoff-id>.json` and `.md`.
