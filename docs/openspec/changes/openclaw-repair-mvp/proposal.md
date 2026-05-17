# OpenSpec Change: OpenClaw Repair MVP

## Why

PraxisBase 当前方向必须从 “self-updating wiki” 收束为 “agent knowledge substrate”。第一版需要证明 OpenClaw 沙箱修复 agent 能够：

1. 获取最新修复上下文和 skill。
2. 在沙箱内完成修复。
3. 提交 episode 和 proposal。
4. 通过 AI reviewer 自动审核和晋升中低风险知识。
5. 生成静态 repair bundle 给后续 agent 使用。

这能服务上千个 OpenClaw 沙箱的长期增长，同时保持当前 MVP 足够轻：一天几十次修复、非高并发、无需外部检索服务。

## What Changes

- 新增 `.praxisbase/` file protocol。
- 新增 episode、proposal、review、known fix、repair bundle 等对象 schema。
- 新增 CLI：`init`、`repair-context`、`bundle fetch`、`episode submit`、`propose`、`review --auto`、`promote --auto`、`build`、`check`。
- 新增 OpenClaw repair context 生成能力。
- 新增 D-lite risk review 和 AI-reviewed auto-merge 机制。
- 新增静态 `dist/repair-bundles/*`、`kb-index.json`、`search-index.json`、`llms.txt`。
- 新增 GitLab Scheduled Pipeline 模板。
- 新增 seed pack：OpenClaw 基础诊断 skill、auth repair skill、auth expired known fix。

## Non-Goals

- 不实现 MCP server。
- 不实现 Hermes runner。
- 不实现 K8s 故障定位 runtime。
- 不实现 `search`、`read`、`curate`、`run ingest` 等 Phase 2+ 命令。
- 不接外部搜索服务、向量库、队列或 daemon。
- 不做区块链或分布式共识。
- 不实现复杂多租户权限系统。
- 不把完整 raw logs 存进 Git。
- 不自动执行沙箱权限之外的生产变更。

## Acceptance Summary

- `praxisbase init` 创建可用的协议骨架和 seed pack。
- `praxisbase repair-context openclaw --logs <file> --json` 能识别 auth-expired 夹具日志并返回安全 repair bundle。
- `praxisbase episode submit <file>` 和 `praxisbase propose <file>` 校验对象并写入 inbox。
- `praxisbase review --auto` 对中低风险 proposal 生成可自动合入 review，对高风险 proposal 标记人工异常。
- `praxisbase promote --auto` 只晋升 AI reviewer 批准且符合自动合入条件的 proposal。
- `praxisbase build` 生成静态 bundle、manifest、索引、HTML 和 `llms.txt`。
- `praxisbase bundle fetch openclaw --signature <signature>` 在最新 bundle 不可用时返回 last-known-good cache 并输出 warning。
- GitLab template 包含 scheduled review/promote/build jobs，并对写任务使用 `resource_group: praxisbase-write`。

## Guardrails For Implementing Agents

- 保持 agent peer model，不引入中心化主控 agent。
- 保持 Git-backed authority layer，不把 Git 替换成数据库。
- 保持静态索引 MVP，不引入向量检索或搜索服务。
- 保持 human-by-exception，不把所有 proposal 都变成人工审批。
- 保持 OpenClaw repair 为第一场景，不在本 change 中实现 K8s runtime。
