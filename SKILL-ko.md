[English](./SKILL.md) | [한국어](./SKILL-ko.md)

# Claude Context Handoff Skill

이 문서는 `SKILL.md`의 한국어 안내본입니다. Claude Skill 로더가 직접 읽는 정본은 [SKILL.md](./SKILL.md)입니다.

## 이 스킬이 하는 일

- 소스 저장소의 Claude Code 대화를 내장 extractor로 읽어 handoff 아티팩트를 만듭니다.
- transcript, 요약, 소스/타깃 경로 메타데이터, 원본 `CLAUDE.md` 정보를 저장합니다.
- 타깃 저장소의 `.claude/context-handoffs/`에 Claude가 읽을 JSON payload와 Markdown instruction 파일을 씁니다.
- 필요하면 `.claude/skills`, config, MCP 관련 파일을 소스에서 타깃으로 복사하고 결과를 메타데이터에 기록합니다.
- 기본 extractor는 MIT 라이선스인 `claude-conversation-extractor`의 JSONL 파싱 로직을 바탕으로 통합되어 있습니다.

## 언제 이 스킬을 제안해야 하나

- 사용자가 한 저장소에서 다른 저장소로 Claude Code 작업을 이어 가고 싶다고 할 때
- 이전 대화의 상대 경로가 어느 저장소 기준인지 보존해야 할 때
- `.claude/skills`, Claude 설정, MCP 구성을 다른 저장소로 옮기고 싶을 때
- 이전 컨텍스트의 출처 저장소나 원래 `CLAUDE.md` 위치를 추적해야 할 때

## 입력값

- `source repo path`
- 알 수 있다면 `target repo path`
- 대화 선택 방식: latest, 명시적 session id, 또는 interactive choice
- handoff label
- `.claude/` 복사 모드: `none`, `skills`, `config`, `mcp`, `all`
- 타깃에 기존 파일이 있을 때의 충돌 전략: `skip`, `overwrite`, `rename`

선택 설정:

- `CCH_EXTRACTOR_BIN`
- `CCH_HANDOFF_HOME`
- `CCH_EXTRACTOR_MODE`
- `CCH_CLAUDE_PROJECTS_DIR`
- extractor 명령과 인자 전략을 지정하는 `claude-context-handoff.config.json`

## 메타데이터 해석 방법

- `sourceRepoPath`는 이전 대화에서 언급된 경로의 기준 저장소 루트로 취급합니다.
- `targetRepoPath`는 현재 편집과 명령의 기준 저장소 루트로 취급합니다.
- `sourceClaudeMdPath`는 해당 파일이 복사되지 않았더라도 원래의 지침 출처로 취급합니다.
- `relativePathGuidance`를 먼저 읽고 이전 대화의 `./src/...`, `packages/...` 같은 상대 경로를 해석합니다.
- `probablePathCorrespondences`는 힌트일 뿐 확정 매핑이 아닙니다.
- `.claude/` 관련 가정을 하기 전에 `transfer` 레코드를 확인합니다.

## 권장 워크플로우

1. 소스 저장소에서 `node dist/cli.js save --source <source-repo>` 실행
2. 타깃 저장소에서 `node dist/cli.js apply --target <target-repo>` 실행
3. `.claude/context-handoffs/<handoff-id>.json`과 `.md` 확인
4. 새 Claude 대화 시작 시 `instructionBlock`을 앞에 붙이거나 요약해서 사용

## 예시 발화

- "이 레포에서 하던 Claude Code 작업을 다른 레포로 넘기고 싶어."
- "이전 대화 경로 기준을 유지한 채로 새 저장소에서 이어서 작업하게 해줘."
- "원본 `CLAUDE.md`가 어디였는지까지 같이 넘겨줘."
- "Move this Claude Code context into another repository."

## 안전 규칙

- 메타데이터를 쓰거나 `.claude/`를 복사하기 전에 소스/타깃 저장소 경로를 항상 확인합니다.
- 선택한 대화, handoff label, 복사 전략을 항상 먼저 보여 줍니다.
- extractor 출력을 파싱하지 못하면 추측하지 말고 중단합니다.
- 복사된 설정 파일에 저장소 전용 절대 경로가 남아 있으면 경고 메타데이터에 표시합니다.
