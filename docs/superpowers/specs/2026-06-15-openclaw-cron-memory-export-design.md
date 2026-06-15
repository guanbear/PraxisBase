# OpenClaw Cron Memory Export 设计

日期：2026-06-15
上游：`docs/superpowers/specs/2026-06-03-m28-team-repair-self-evolution-design.md`

## 目标

用 OpenClaw 自带 cron，而不是沙箱系统 cron，把答疑机器人 `pm.sqlite` 中的记忆稳定导出到 GitLab。PraxisBase nightly 从 GitLab 的稳定 source 拉取数据，避免绑定临时沙箱 IP、端口或 sandbox id。

本阶段只做方案 A 的最小闭环：OpenClaw cron 触发一个轻量 shell exporter。cron 可消耗少量 token，但 exporter 本身不调用模型。

## 架构

```text
OpenClaw cron (agentTurn, light-context, cheap model, exec-only)
  -> /workspace/praxisbase-openclaw/bin/pb-openclaw-pm-export
  -> read-only /root/.openclaw/memory/pm.sqlite
  -> incremental JSONL + local redaction
  -> push GitLab branch openclaw-ingest/answer-bot
  -> PraxisBase source type=git, channel=feishu, scope=team
  -> daily run --mode team-git
```

稳定身份是 `openclaw://answer-bot/pm.sqlite/chunks/<chunk-id>`。IP、sandbox id、SSH 临时密码不得进入 source identity。

## 组件

- `templates/openclaw/pb-openclaw-pm-export.sh`：部署到 OpenClaw 沙箱或镜像中的 exporter。默认安装到 `/workspace/praxisbase-openclaw/bin`，状态写到 `/workspace/praxisbase-openclaw/state`，因为 `/workspace` 可跨沙箱升级保留。它只依赖 `bash`、`python3`、`git`，通过 Python 标准库读取 SQLite。
- GitLab staging branch：默认 `openclaw-ingest/answer-bot`，保存 `.praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl`。
- PraxisBase source config：团队知识仓配置 `source_type=git`，指向 staging branch/file。
- GitLab scheduled pipeline：继续使用现有 `templates/gitlab/knowledge-repo.gitlab-ci.yml` 的 `daily-harvest`、`review`、`promote`、`build`。

## 增量与隐私

Exporter 使用本地 cursor 文件 `/workspace/praxisbase-openclaw/state/state.json`，查询 `updated_at > last_updated_at`，默认每次最多 500 条。push 成功后才更新 cursor；失败时下次会重试。JSONL 按 `source_ref` 去重，避免失败重跑造成重复行。

脚本会在上传前做最低限度脱敏：`Authorization: Bearer`、`Cookie`、`token/password/secret/api_key` 等值替换为 `[REDACTED]`。PraxisBase team 模式仍会对 `channel=feishu` 数据执行 review-first，默认进入 human-required，不直接晋升稳定知识。

## GitLab 配置

GitLab 需要一个最小权限写入凭据：推荐 bot PAT 或 project access token，只授予目标仓库 `write_repository`。凭据只放在 OpenClaw 机器的 `/workspace/praxisbase-openclaw/export.env`，权限 `0600`，不写入脚本、不写入 Git。

GitLab nightly 需要显式设置 `PRAXISBASE_DAILY_LIMIT=500`。PraxisBase 的通用 source adapter 默认只取 20 条，用来保护个人/交互式扫描；团队 nightly 对 answer-bot backfill 应使用 CI limit 覆盖，否则首批 34 条里只会处理 20 条。

知识仓需要添加 source：

```bash
praxisbase source add openclaw-answer-bot \
  --agent openclaw \
  --type git \
  --repo https://gitlab.chehejia.com/sre/praxisbase.git \
  --ref openclaw-ingest/answer-bot \
  --path .praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl \
  --scope team \
  --channel feishu
```

GitLab schedule 配置：

- `PRAXISBASE_TASK=daily-harvest`：每天夜间运行 source ingest + site build。
- `PRAXISBASE_TASK=review`：可在 harvest 后运行自动 review。
- `PRAXISBASE_TASK=promote`：可在 review 后运行 promotion。
- `PRAXISBASE_WRITEBACK=true`：允许 CI 把 `.praxisbase`、`kb`、`skills`、`dist` 写回。
- `PRAXISBASE_PUSH_TOKEN`：只在 GitLab CI masked/protected variable 中保存。

## OpenClaw Cron 配置

部署脚本后，用 OpenClaw cron 创建任务：

```bash
openclaw cron add \
  --name "PraxisBase OpenClaw answer-bot memory export" \
  --cron "0 3 * * *" \
  --session isolated \
  --light-context \
  --thinking off \
  --tools exec \
  --timeout-seconds 90 \
  --no-deliver \
  --message "Run exactly: . /workspace/praxisbase-openclaw/export.env && /workspace/praxisbase-openclaw/bin/pb-openclaw-pm-export. Do not inspect unrelated files. Do not summarize memory content. Return only one line: praxisbase_export status=<ok|skip|error> rows=<n> commit=<sha-or-none>."
```

模型可用 OpenClaw 当前最低成本模型；不要使用高思考档或长上下文模型。第一版建议每天一次，确认 token 和 GitLab 队列后再提高频率。

## 失败处理

- SQLite 不存在：脚本输出 `status=error reason=sqlite_missing`，不更新 cursor。
- GitLab push 失败：不更新 cursor，下次重试。
- 无新增数据：输出 `status=skip rows=0 commit=none`。
- 脱敏命中：正文被替换后再写 JSONL，仍由 PraxisBase privacy gate 二次检查。

## 已知限制

- OpenClaw cron 的 `agentTurn` 会吃少量 bootstrap token；如果后续成本不可接受，应改成 OpenClaw `system event + hook/plugin` 直接执行 exporter。
- 当前 PraxisBase 对 Feishu channel 的 team 数据会进入 human-required；这是安全默认，但需要后续配置 triage/review 节奏。
- `team release-audit` 验完整 M28 闭环，不适合只验证 source ingest；本阶段用 daily source report 作为临时验收证据。
