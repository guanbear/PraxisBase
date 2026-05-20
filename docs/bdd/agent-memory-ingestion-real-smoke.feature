# language: zh-CN
功能: Agent Memory Ingestion Real Smoke
  为了让没有真实 kb 数据的新仓库也能从本地 agent 经验启动 wiki 闭环
  作为 PraxisBase 维护者
  我需要安全导入 Codex/OpenClaw 记忆摘要，并用真实协议证据跑通 compile、graph、site 和 context smoke

  背景:
    假如 当前工作目录是一个已经初始化的 PraxisBase 知识仓库
    并且 系统使用 protocol_version "0.1"
    并且 原始 Codex session、OpenClaw 日志、完整 transcript、tokens、cookies、credentials 和 private keys 不能写入 Git
    并且 memory ingest、wiki compile、wiki graph、wiki build-site 和 smoke real-wiki 都不能直接修改 "kb/" 或 "skills/"
    并且 稳定知识变更必须走 proposal、review 和 promote

  场景: M12 Codex scan 只发现候选不写文件
    假如 用户提供一个包含 Codex archived session fixture 的 source 目录
    当 用户运行 "praxisbase memory scan --agent codex --source <dir> --json"
    那么 输出包含 agent 为 "codex" 的 candidates
    并且 每个 candidate 包含 source_ref、source_hash、size_bytes 和 warnings
    并且 系统不写入 ".praxisbase/raw-vault/refs/"
    并且 系统不写入 ".praxisbase/outbox/captures/"
    并且 系统不修改 "kb/" 或 "skills/"

  场景: M12 Codex ingest 写安全 evidence
    假如 用户提供一个 Codex archived session fixture
    并且 fixture 包含任务摘要、命令和测试结果
    当 用户运行 "praxisbase memory ingest --agent codex --source <file> --write --json"
    那么 系统写入 ".praxisbase/raw-vault/refs/<id>.json"
    并且 系统写入 ".praxisbase/outbox/captures/<id>.json"
    并且 ingest report 中 "changed_stable_knowledge" 是 false
    并且 写入内容包含 redacted_summary 和 source_hash
    并且 写入内容不包含原始 session 全文

  场景: M12 OpenClaw ingest 识别安全问题签名
    假如 用户提供一个 OpenClaw auth-expired log fixture
    当 用户运行 "praxisbase memory ingest --agent openclaw --source <log> --write --json"
    那么 输出 summary 包含 "openclaw:claude-auth-expired"
    并且 系统写入 capture 或 raw-vault ref
    并且 系统不写入原始 log 全文
    并且 系统不修改 stable knowledge

  场景: M12 duplicate source hash 不重复导入
    假如 同一个 Codex session 已经被导入过一次
    当 用户再次运行 "praxisbase memory ingest --agent codex --source <same-file> --write --json"
    那么 ingest report 的 duplicates 大于 0
    并且 imported 是 0
    并且 系统不会写入第二份 capture

  场景: M12 private material 进入人工异常
    假如 一个候选 source 包含 token、cookie、password 或 private key pattern
    当 用户运行 "praxisbase memory ingest --agent codex --source <file> --write --json"
    那么 ingest report 的 unsafe 大于 0
    并且 系统写入 ".praxisbase/exceptions/human-required/<id>.json"
    并且 系统不写入 capture
    并且 系统不写入 raw session text

  场景: M12 real-wiki smoke 跑完整闭环但不 promote
    假如 用户提供一个安全的 Codex session source
    当 用户运行 "praxisbase smoke real-wiki --agent codex --source <file> --query wiki --json"
    那么 系统运行 memory ingest
    并且 系统运行 wiki compile review
    并且 系统运行 wiki graph
    并且 系统运行 wiki build-site
    并且 系统运行 context get
    并且 输出包含 imported、proposal_candidates、graph_nodes、site_pages 和 context_items
    并且 "kb/" 和 "skills/" 没有被该 smoke 命令修改

  场景: M12 real-wiki smoke 生成可解释健康信息
    假如 real-wiki smoke 完成
    当 用户查看 JSON report
    那么 report 包含 skipped、duplicates、unsafe 和 warnings
    并且 report 包含 wiki health 的 broken_links、duplicates 和 orphans
    并且 report 包含生成的 dist/index.html 路径

  场景: M12 imported evidence 可被 wiki compiler 收集
    假如 memory ingest 已经写入 raw-vault ref 和 capture
    当 用户运行 "praxisbase wiki compile --review --json"
    那么 compiler collector 读取这些 evidence summaries
    并且 review mode 写 proposal candidates
    并且 proposal candidate 包含 source_ref 和 source_hash
    并且 compiler 不读取 raw source body
