<p align="center">
  <img src="assets/brand/praxisbase-logo.png" alt="PraxisBase / 知行基座 — Agent 原生知识底座" width="900">
</p>

# PraxisBase / 知行基座 — Agent 原生知识底座

**语言:** [English](README.md) | 简体中文

> **AGENT-NATIVE KNOWLEDGE SUBSTRATE**
>
> **Agent 原生知识底座**
>
> **知行未必一，经验自成基。**
>
> **Disposable Agents. Durable Experience.**

PraxisBase / 知行基座 是一个面向个人与团队多 agent 的 Agent 原生知识底座。它适合同时运行大量临时 agent 和持久 agent 的个人、项目和团队，让 agent 本身保持可替换、可丢弃，同时让经验可以长期沉淀：知识、修复记忆、可复用 skill、决策记录和个人偏好。

这个项目起源于 LLM Wiki 的想法，但当前定位更宽：**agent 是可替换执行体，知识是长期记忆**。Codex、Claude Code、OpenCode、Hermes、OpenHuman、OpenClaw、临时修复 agent，以及未来的 MCP client，都应该作为平级 client，通过统一 CLI 和 file protocol 读写同一层持久经验。

## 核心思想

现代 agent 系统不应该依赖某个珍贵的长生命周期容器，也不应该把组织记忆绑在某个手工维护的 agent session 里。受 Anthropic Managed Agents 架构启发，PraxisBase 把系统拆成三类资产：

- **Brains**：临时或持久的 agent loop，负责推理和决策
- **Hands**：沙箱、工具、shell、OpenClaw 环境、K8s 系统，负责执行动作
- **Memory**：episode、proposal、review、skill、known fix、procedure、bundle，负责长期积累

Anthropic 将 session、harness 和 sandbox 解耦，让 harness 或 sandbox 失败后可以替换。PraxisBase 把同样的思想扩展到组织级学习：一个 agent 可以在一次修复后消失，但有价值的修复经验会被保存、审核、晋升，并进入下一个 agent 的上下文。

一个重要的长期能力是 **skill synthesis**：系统可以从重复成功的 episode 中总结出可复用的 `SKILL.md`，经过 AI review 后晋升到共享 skill registry，让后续 agent 直接加载。同一套闭环也应该支持个人记忆、项目经验、团队知识和组织级 policy。

## 系统做什么

```text
Codex / Claude Code / OpenCode / Hermes / OpenHuman / OpenClaw / K8s / 飞书
          |
          v
  临时和持久的 agent peers
          |
          v
    PraxisBase file protocol + CLI
          |
          v
  Git-backed durable knowledge layer
          |
          v
 静态 repair bundles + HTML inspection
          |
          v
      下一个 agent 带着经验启动
```

## Phase 1 MVP

第一版 MVP 聚焦 **OpenClaw 沙箱自动修复**：

- `praxisbase init` 创建 agent 知识底座骨架
- `praxisbase repair-context openclaw --logs ...` 返回紧凑的 repair bundle
- agent 每次修复后提交 `episode` 记录
- agent 发现可复用知识时提交 `proposal`
- skill 改进也走同一条 proposal/review/promotion 流程
- AI reviewer agent 负责风险分级并批准常规变更
- `praxisbase promote --auto` 将已批准 proposal 晋升为稳定知识
- `praxisbase build` 生成 repair bundle、索引、`llms.txt` 和 HTML 检查页面
- GitLab Scheduled Pipelines 定期运行 review、promotion 和 build jobs

MVP 明确不做 MCP server、Hermes runner、K8s runtime integration、外部搜索、向量库、区块链，也不引入中央 master agent。

## 知识模型

PraxisBase 按知识生命周期使用不同载体：

| 层 | 载体 | 示例 |
| --- | --- | --- |
| 协议状态 | `.praxisbase/` | inbox episodes、proposals、reviews、policies、schedules |
| 稳定知识 | `kb/` | known fixes、procedures、decisions、notes、reviewed memory |
| Agent skills | `skills/` | OpenClaw repair skills、K8s triage skills |
| 分发产物 | `dist/` | repair bundles、indexes、HTML、`llms.txt` |
| 原始证据 | 外部系统 | 完整日志、工单、飞书导出、对象存储 |

大体量 raw logs 不进入 Git。Git 只保存引用、摘要、hash 和脱敏证据。

知识对象使用四个正交维度描述：

| 维度 | 取值 |
| --- | --- |
| Scope | `personal`、`project`、`team`、`org` |
| Layer | `preference`、`convention`、`technical`、`domain`、`project` |
| Type | `model`、`decision`、`guideline`、`pitfall`、`process`、`known_fix`、`procedure`、`skill`、`policy`、`note` |
| Maturity | `draft`、`verified`、`proven`、`stale`、`archived` |

不同 agent 的适配保持轻量：hook 负责捕获，watcher 负责兼容，scheduled distill 负责提炼、去重、晋升和衰减。

## 原生记忆桥

PraxisBase 应该复用各 agent 自己已有的记忆，而不是替代它们。已有 Codex session、Hermes skill summary、OpenHuman persona/preference、OpenClaw repair record，以及 generic agent notes，都可以带着 source ref、hash 和脱敏摘要进入 PraxisBase。

`memory import` 负责把原生记忆初始回填成 capture/proposal candidate。`memory refresh` 负责把已审核的 PraxisBase 知识回流为 runtime context、install snippet 或 patch proposal。它不是静默双向同步：原生记忆是来源和缓存，经过审核的 PraxisBase 对象才是共享权威。

### 例子：Hermes 与 Skill 演进

Hermes 已经有 agent-managed skills、persistent memory 和 curator 式的 skill 维护能力。PraxisBase 可以把这些产物当作 proposal source，也可以把已审核的 shared skill 回流成 context 或 patch proposal。

Hermes 是加速器，不是依赖；Codex、Claude Code、OpenCode、OpenHuman、OpenClaw 和 generic agent 仍然必须通过同一套 CLI/file protocol 接入。

## 为什么需要它

运行大量 agent 沙箱的团队，遇到的问题和普通文档系统不同：

- 一个 repair agent 可能只活几分钟
- 一个 sandbox 可能用完就删
- 一个持久 bot 也可能升级、替换或重启
- 模型和 harness 假设会不断变化
- 真正有价值的修复经验必须在这些变化之后继续存在

PraxisBase 把“需要持久化的部分”显式抽出来。它是面向可丢弃 agent 的共享记忆、skill registry、review lane、skill synthesis lane 和 repair bundle generator。

## 当前文档

- [部署指南](docs/deployment.md)
- [Agent Knowledge Substrate 设计](docs/superpowers/specs/2026-05-17-agent-knowledge-substrate-design.md)
- [Multi-Agent Experience Layer 设计](docs/superpowers/specs/2026-05-19-multi-agent-experience-layer-design.md)
- [Multi-Agent Experience Layer 实施计划](docs/superpowers/plans/2026-05-19-multi-agent-experience-layer-implementation-plan.md)
- [Multi-Agent Experience Layer OpenSpec](docs/openspec/changes/multi-agent-experience-layer/proposal.md)
- [Multi-Agent Experience Layer BDD](docs/bdd/multi-agent-experience-layer.feature)
- [SRE-autopilot K8s Incident 集成设计](docs/superpowers/specs/2026-05-18-sre-autopilot-k8s-incident-integration-design.md)
- [OpenClaw Repair MVP 实施计划](docs/superpowers/plans/2026-05-17-openclaw-repair-mvp-implementation-plan.md)
- [OpenSpec Change](docs/openspec/changes/openclaw-repair-mvp/proposal.md)
- [BDD Acceptance Feature](docs/bdd/openclaw-repair-mvp.feature)
- [SRE-autopilot K8s Incident OpenSpec](docs/openspec/changes/sre-autopilot-k8s-incident-integration/proposal.md)
- [SRE-autopilot K8s Incident BDD](docs/bdd/sre-autopilot-k8s-incident-integration.feature)

## 路线图

- **Phase 0**：将 PraxisBase 从 self-updating wiki 重新定位为 agent knowledge substrate
- **Phase 1**：OpenClaw 修复闭环，包括 file protocol、CLI、AI review、promotion 和静态 bundle
- **Phase 2**：K8s 故障 ingest、飞书 workflow、Hermes-like 自动 skill synthesis
- **Phase 3**：Codex、Claude Code、OpenCode、OpenClaw、Hermes、OpenHuman 和 generic agent 的统一 CLI adapters 与原生记忆桥
- **Phase 4**：多 repo federation、外部搜索后端、更强 provenance、跨团队同步

## 名字

**PraxisBase / 知行基座** 表达的是：agent 把知识转化为行动，又把行动沉淀成可复用知识的持久底座。英文名保留基础设施感；中文名保留“知行”，对应这个项目最核心的循环：学习、修复、验证、晋升、复用。

## 参考

- [Anthropic: Scaling Managed Agents, Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)
- [Karpathy LLM Wiki gist v1](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [LLM Wiki v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)
- [The Unreasonable Effectiveness of HTML](https://x.com/trq212/status/2052809885763747935)
- [Hermes Agent](https://hermes-agent.nousresearch.com/)
- [OpenClaw](https://github.com/openclaw/openclaw)

## License

MIT
