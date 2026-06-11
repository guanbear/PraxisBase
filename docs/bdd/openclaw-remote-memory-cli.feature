# language: zh-CN
功能: OpenClaw Remote Memory CLI
  为了让非本地 OpenClaw 记忆也能进入 PraxisBase wiki 闭环
  作为 PraxisBase 维护者
  我需要通过 PraxisBase CLI 拉取远端或导出的 OpenClaw 记忆，并安全导入为协议 evidence

  背景:
    假如 当前工作目录是一个已经初始化的 PraxisBase 知识仓库
    并且 系统使用 protocol_version "0.1"
    并且 PraxisBase CLI 是非本地 OpenClaw 记忆的控制入口
    并且 OpenClaw CLI、OpenClaw plugin、MCP server、daemon 和 webhook 都不是默认依赖
    并且 tokens、cookies、headers、raw response、raw logs、完整 transcript 和 private keys 不能写入 Git
    并且 memory fetch、memory ingest 和 doctor openclaw-remote 都不能直接修改 "kb/" 或 "skills/"

  场景: M12.1 source checkout mode 可运行 fetch
    假如 用户已经运行 "pnpm build"
    当 用户运行 "node packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source <export-file> --json"
    那么 CLI 使用源码构建产物运行
    并且 输出包含 provider 为 "exported-json" 的 fetch report
    并且 report 中 "changed_stable_knowledge" 是 false

  场景: M12.1 exported-json provider 生成安全 staging envelope
    假如 用户提供一个 OpenClaw exported JSON fixture
    并且 fixture 包含 signature、summary、created_at 和 remote id
    当 用户运行 "praxisbase memory fetch --agent openclaw --provider exported-json --source <export-file> --json"
    那么 系统写入 ".praxisbase/staging/openclaw/<id>.json"
    并且 staging envelope 包含 source_ref、source_hash、redacted_summary 和 provider
    并且 staging envelope 不包含原始 raw log 全文
    并且 系统不修改 "kb/" 或 "skills/"

  场景: M12.1 openclaw-api provider 不落盘认证信息
    假如 环境变量 "OPENCLAW_TOKEN" 已设置
    并且 一个本地 mock OpenClaw API 返回安全 memory item
    当 用户运行 "praxisbase memory fetch --agent openclaw --provider openclaw-api --remote workspace/project --json"
    那么 fetch report 的 staged 大于 0
    并且 写入的 report 和 envelope 不包含 "OPENCLAW_TOKEN" 的值
    并且 写入的 report 和 envelope 不包含 Authorization header

  场景: M12.1 doctor 解释缺失能力
    假如 环境变量 "OPENCLAW_TOKEN" 未设置
    当 用户运行 "praxisbase doctor openclaw-remote --provider openclaw-api --json"
    那么 输出 ok 为 false
    并且 checks 包含缺少 "OPENCLAW_TOKEN" 的 error
    并且 系统不写入 stable knowledge

  场景: M12.1 openclaw-cli provider 缺少外部 CLI 时给诊断
    假如 当前 PATH 中没有 OpenClaw CLI
    当 用户运行 "praxisbase doctor openclaw-remote --provider openclaw-cli --json"
    那么 输出 ok 为 false
    并且 checks 包含 missing_openclaw_cli
    并且 提示用户可以改用 exported-json 或 openclaw-api provider

  场景: M12.1 fetch 后可以继续 ingest
    假如 memory fetch 已经写入 ".praxisbase/staging/openclaw/<id>.json"
    当 用户运行 "praxisbase memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write --json"
    那么 系统写入 ".praxisbase/raw-vault/refs/<id>.json"
    并且 系统写入 ".praxisbase/outbox/captures/<id>.json"
    并且 ingest report 中 "changed_stable_knowledge" 是 false
    并且 写入内容只包含 redacted_summary、source_ref、source_hash 和安全 metadata

  场景: M12.1 staging 必须被 Git 忽略
    假如 用户运行 "praxisbase doctor openclaw-remote --provider exported-json --json"
    那么 checks 包含 ".praxisbase/staging/" 是否被 Git ignore 覆盖
    并且 如果 staging 未被 ignore，severity 为 "warning" 或 "error"

  场景: M12.1 installed mode 使用 praxisbase 命令
    假如 用户已经安装 PraxisBase CLI 包
    当 用户运行 "praxisbase memory fetch --agent openclaw --provider exported-json --source <export-file> --json"
    那么 CLI 使用已安装的 "praxisbase" binary 运行
    并且 输出结构与 source checkout mode 相同
