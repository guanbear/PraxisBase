# language: zh-CN
功能: Multi-Agent Experience Layer
  为了让个人和团队的多个 agent 共享经验而不绑定某个长生命周期 agent
  作为 PraxisBase 的维护者
  我需要统一的 CLI/file protocol 来获取上下文、捕获经验、安装轻量适配、生成 proposal，并保持稳定知识可审计

  背景:
    假如 当前工作目录是一个已经初始化的 PraxisBase 知识仓库
    并且 系统使用 protocol_version "0.1"
    并且 capture、watch、context 和 distill 命令不能直接修改 "kb/" 或 "skills/"
    并且 raw transcripts、完整日志、飞书原文、tokens、cookies 和密钥不能写入 Git
    并且 第一版不使用向量数据库、外部搜索服务、长驻数据库或深度 agent 插件

  场景: M0 验证 capture record schema
    假如 一个 capture record 包含 agent、workspace、scope_hint、result、triggers、signals、artifact refs 和 created_at
    并且 artifact ref 使用 "raw-vault://codex/session-1"
    当 系统验证该 capture record
    那么 验证通过
    并且 capture record 不会生成稳定知识文件

  场景: M0 拒绝缺少 artifact refs 的 capture record
    假如 一个 capture record 没有 artifact refs
    当 系统验证该 capture record
    那么 验证失败
    并且 错误输出是 machine-readable structured error

  场景: M1 capture finish 写入 outbox
    当 用户运行 "praxisbase capture finish --agent codex --result success --source-ref raw-vault://codex/session-1 --source-hash sha256:session1 --summary 'Fixed a project issue and tests passed.' --json"
    那么 系统写入 ".praxisbase/outbox/captures/<capture-id>.json"
    并且 输出包含 capture id 和 capture path
    并且 系统不写入 "kb/" 或 "skills/"

  场景: M1 capture finish 拒绝 Git 稳定知识路径中的 raw artifact
    当 用户运行 "praxisbase capture finish --agent codex --result success --source-ref kb/raw-transcript.md --source-hash sha256:bad --summary 'Raw transcript' --json"
    那么 命令失败
    并且 错误 code 是 "RAW_ARTIFACT_REJECTED"
    并且 系统不写入 capture record
    并且 系统不修改 "kb/raw-transcript.md"

  场景: M2 install dry-run 不修改文件
    当 用户运行 "praxisbase install codex --dry-run --json"
    那么 输出包含将要写入的 instruction snippet
    并且 输出包含将要写入的 ".praxisbase/adapters/codex.json"
    并且 输出包含建议 agent 在任务开始时运行 "praxisbase context get"
    并且 文件系统没有被修改

  场景: M2 install non-dry-run 只写安全目标
    当 用户运行 "praxisbase install codex --json"
    那么 系统写入 ".praxisbase/adapters/codex.json"
    并且 如果更新 "AGENTS.md"，只在 PraxisBase marker 区块内追加或替换
    并且 系统不会覆盖整个 "AGENTS.md"

  场景: M2 unknown agent profile 被拒绝
    当 用户运行 "praxisbase install unknown-agent --dry-run --json"
    那么 命令失败
    并且 错误 code 是 "UNKNOWN_ADAPTER_PROFILE"
    并且 输出列出支持的 agent profiles

  场景: M3 diagnosis context 遵守预算并保留 citations
    假如 仓库已经生成 repair bundle 和 knowledge index
    当 用户运行 "praxisbase context get --agent codex --stage diagnosis --query 'openclaw auth expired' --max-bytes 4096 --json"
    那么 输出 stage 是 "diagnosis"
    并且 输出大小不超过 4096 bytes
    并且 exact signature 或 query match 的 citation 排在前面
    并且 如果 full object 被预算裁掉，citation 仍然保留

  场景: M3 context unavailable 不阻塞 agent
    假如 仓库还没有生成 repair bundle 或 knowledge index
    当 用户运行 "praxisbase context get --agent codex --stage diagnosis --query 'new issue' --json"
    那么 命令仍然成功
    并且 输出包含 warning "context_unavailable"
    并且 输出包含空 items 或降级 context

  场景: M4 distill run 生成 proposal 但不改稳定知识
    假如 ".praxisbase/outbox/captures/" 中有一个 success capture
    并且 capture summary 表示测试通过且发现了项目经验
    当 用户运行 "praxisbase distill run --json"
    那么 系统写入 ".praxisbase/reports/distill/<run-id>.json"
    并且 系统写入 ".praxisbase/inbox/proposals/<proposal-id>.json"
    并且 report 中 "changed_stable_knowledge" 是 false
    并且 系统不修改 "kb/" 或 "skills/"

  场景: M4 distill 默认 personal scope
    假如 一个 capture 来自个人 Codex session
    并且 没有明确的 workspace marker 或 reviewer 标记
    当 用户运行 "praxisbase distill run --json"
    那么 生成的 proposal scope 是 "personal"
    并且 系统不会自动提升为 "team" 或 "org"

  场景: M4 distill 遇到隐私不确定进入人工异常
    假如 一个 capture 的 redacted_summary 表示可能包含 token 或 cookie
    当 用户运行 "praxisbase distill run --json"
    那么 系统写入 ".praxisbase/exceptions/human-required/<exception-id>.json"
    并且 系统不生成可自动合并的 proposal

  场景: M4 watch once 没有可监听路径时降级为 warning
    当 用户运行 "praxisbase watch --agent claude-code --workspace . --once --json"
    并且 adapter profile 中的 transcript path 不存在
    那么 命令成功
    并且 输出包含 warning "watch_path_unavailable"
    并且 系统不修改 raw artifact

  场景: M5 smoke flow 可证明最小闭环
    当 用户依次运行 init、install dry-run、capture finish、distill run、context get
    那么 每个命令都返回 machine-readable JSON
    并且 capture 出现在 ".praxisbase/outbox/captures/"
    并且 distill report 出现在 ".praxisbase/reports/distill/"
    并且 context response 包含 stage、warnings 和 citations
    并且 capture、watch、distill 都没有修改稳定知识

