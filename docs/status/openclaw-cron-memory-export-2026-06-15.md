# OpenClaw Cron Memory Export 状态 - 2026-06-15

## 概要

方案 A 已完成本地实现与临时 smoke：OpenClaw PM memory exporter 可以把当前答疑 bot 的 `pm.sqlite` 导出为 GitLab staging 形态的 JSONL；PraxisBase 可以把该 staging repo 作为 `git` source 接入 team daily。

## 实现内容

- 新增 `templates/openclaw/pb-openclaw-pm-export.sh`。
- 新增设计文档 `docs/superpowers/specs/2026-06-15-openclaw-cron-memory-export-design.md`。
- 新增 OpenSpec change `docs/openspec/changes/openclaw-cron-memory-export/`。
- 更新 `docs/deployment.md`，补充 GitLab 和 OpenClaw cron 配置。
- 更新 GitLab CI template，`daily-harvest` 默认带 `--limit "${PRAXISBASE_DAILY_LIMIT:-500}"`，避免 team nightly 只消费默认 20 条。
- OpenClaw exporter 默认状态目录改为 `/workspace/praxisbase-openclaw/state`，部署命令改为 `/workspace/praxisbase-openclaw/bin` 和 `/workspace/praxisbase-openclaw/export.env`。
- 修复 `source_type=git` 读取非默认分支时的 checkout 问题：配置了 `source.ref` 时 clone/fetch 指定 ref，再从 `FETCH_HEAD` 读取。

## 临时 Smoke

输入：从当前 OpenClaw 答疑 bot 只读复制的 `/tmp/praxisbase-openclaw-pm-readonly/pm.sqlite`。

Exporter 结果：

```text
praxisbase_export status=ok rows=34 commit=2554b56
```

PraxisBase git source daily 结果：

```text
source: openclaw-answer-bot
source_type: git
channel: feishu
status: partial
scanned: 34
fetched: 20
enveloped: 20
rejected: 0
human_required: 20
warnings: []
```

`human_required=20` 是预期结果：team 模式下 Feishu-channel OpenClaw 内容执行 review-first，不直接进入稳定知识。

## 发现的问题

1. 原 `git` source adapter 对非默认分支不稳：`git clone --depth 1` 后再 `checkout openclaw-ingest/answer-bot` 会失败。已修为 clone/fetch 指定 ref。
2. `team release-audit` 是完整 M28 闭环验收，不适合只验证 source ingestion。此阶段应以 daily source report 作为临时验收口径。
3. OpenClaw cron 的 agent turn 仍会消耗 bootstrap token。第一版按每天一次低频运行；若成本不可接受，下一版改为 OpenClaw system-event hook/plugin 直接执行同一 exporter。
4. `daily run` 通用 source 默认 limit=20 是交互/个人模式的保守默认；GitLab nightly 已改为显式 `PRAXISBASE_DAILY_LIMIT=500`，这次不改全局默认，避免扩大个人扫描成本。

## 验证

```text
bash -n templates/openclaw/pb-openclaw-pm-export.sh
pnpm build
pnpm exec tsc -p tsconfig.tests.json
node --test dist-tests/tests/core/experience-source-adapters.test.js
```

测试结果：`experience-source-adapters.test.js` 16/16 pass。

## 下一步

- 在 GitLab 创建/确认 `openclaw-ingest/answer-bot` staging branch 的写入策略。
- 创建最小权限 bot token / project access token。
- 把 exporter 安装到 OpenClaw bot 环境，并通过 `openclaw cron add` 创建低频任务。
- 第一次真实 GitLab run 后，调整 `PB_LIMIT`、cron 频率和 human-required triage 节奏。
