# language: zh-CN
功能: M30 团队版 飞书数据源接入（文档 + 聊天记录）
  为了让飞书文档和群知识也能沉淀进团队知识底座
  作为 PraxisBase 团队版第三类数据源
  我需要同时支持路径A（OpenClaw 飞书插件）和路径B（飞书 CLI/API 直连），并对飞书内容施加最强隐私门

  背景:
    假如 当前工作目录是一个 M28 全绿的团队 PraxisBase 仓库
    并且 系统使用 protocol_version "0.1"
    并且 飞书永远是 source 而非知识权威
    并且 飞书原文（文档正文/聊天/token/cookie）不进 Git

  场景: 路径A 飞书渠道 OpenClaw 源在团队模式 review-first
    假如 一个 OpenClaw 源 agent 为 "openclaw" 且 channel 为 "feishu"
    当 团队蒸馏运行
    那么 其经验必须先经 review 才能进团队稳定知识
    并且 它不能使用 "trusted_personal_remote" 快速通道

  场景: 路径B 添加飞书文档源（凭据只存 env 名）
    假如 飞书 app 凭据仅以环境变量名引用
    当 用户运行 "praxisbase source add feishu-team-docs --agent feishu --type feishu --parser feishu-doc --feishu-target <wiki-space> --scope team"
    那么 源配置以 env 名引用凭据写入
    并且 不存储任何字面凭据

  场景: 路径B 飞书文档被拉取并脱敏入 envelope
    假如 一个已配置的 feishu-doc 源和一个 mock 飞书文档
    当 adapter 解析该源
    那么 文档变成带 doc-token source_ref 的 canonical Markdown chunk
    并且 envelope 携带脱敏摘要、source_ref 和 hash
    并且 文档原文不进 Git

  场景: 非 HTTPS 飞书 API 端点被拒绝
    假如 一个非 HTTPS 且非 loopback 的飞书 API base URL
    当 解析该源
    那么 系统拒绝该端点

  场景: 1v1 私聊被拒绝
    假如 一个飞书源包含 1v1 私聊消息
    当 隐私 triage 运行
    那么 该条目被 reject 且永不进入蒸馏

  场景: 飞书标识与 PII 被脱敏或拦截
    假如 飞书内容含 user_id/open_id/union_id/chat_id 原值或手机/邮箱/token
    当 隐私 triage 运行
    那么 标识被脱敏且凭据在 envelope 创建前被硬拦截
    并且 HTML 只显示带原因码的脱敏摘要

  场景: 公开知识库文档走常规 triage
    假如 一个无 PII 的飞书公开知识库文档
    当 隐私 triage 运行
    那么 它走常规团队 triage 流程

  场景: 团队验收门包含飞书三门
    当 用户在 M30 后运行 "praxisbase team release-audit --json"
    那么 JSON 响应包含 "feishu_source_a_ga"
    并且 JSON 响应包含 "feishu_source_b_ga"
    并且 JSON 响应包含 "feishu_privacy_ga"
    并且 "team_ga" 要求这些门与 M28 各门一起 pass
