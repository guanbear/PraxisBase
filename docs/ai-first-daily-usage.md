# AI-First Daily Usage

PraxisBase production daily runs require AI distillation. The deterministic path is a degraded fallback for bootstrap and offline smoke only.

## Personal Mode

```bash
praxisbase bootstrap personal --agent codex --install-skill --json
praxisbase ai init --provider openai-compatible --model <model> --json
export PRAXISBASE_LLM_API_KEY=...
praxisbase ai doctor --json
praxisbase daily run --mode personal --build-site --json
open dist/index.html
```

Bootstrap only discovers explicit safe paths:

- `~/.codex/sessions`
- `~/.codex/archived_sessions`
- `~/.codex-cli-cliproxyapi/sessions`
- `~/.openclaw/memory/main.sqlite`
- `~/.openclaw/reports`

It does not scan home directories broadly.

## Degraded Smoke

```bash
praxisbase daily run --mode personal --degraded --build-site --json
```

Use degraded mode only to verify local plumbing when AI configuration is not ready. Reports mark `ai_distill.production_ready` as `false`.

## Team Mode

```bash
praxisbase source add openclaw-bot --agent openclaw --channel feishu --type openclaw-api --remote bot-prod --scope team
praxisbase source add claude-repair-log --agent claude-code --type http --url "$LOG_API" --scope team
praxisbase daily run --mode team-git --branch harvest/daily --commit --push --build-site --json
```

Team mode should run in GitLab scheduled pipelines. Personal scope and private chat hints are rejected before AI calls. Human review items are written to `.praxisbase/exceptions/human-required`.
