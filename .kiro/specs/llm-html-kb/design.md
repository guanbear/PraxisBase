# Design Document

## Overview

本文档描述 **kb-cli** 的系统架构、模块划分、数据流、关键接口与目录结构。对应 requirements.md 中的 10 个 Requirement。

技术栈：TypeScript + Node 20+ + pnpm monorepo。

## System Architecture

```
+---------------------------------------------------------------------+
|                         调度层 (Runners)                              |
|  +---------------+  +------------------+  +-----------------------+  |
|  | local-runner  |  | gitlab-ci-runner |  | hermes-runner (Ph.2)  |  |
|  +-------+-------+  +--------+---------+  +-----------+-----------+  |
|          |                    |                        |              |
|          +--------------------+------------------------+              |
|                               v                                      |
|  +--------------------------------------------------------------+    |
|  |                      kb-cli (核心)                             |    |
|  |  +---------+ +---------+ +---------+ +--------+ +--------+   |    |
|  |  | ingest  | |  build  | | search  | |  read  | |  edit  |   |    |
|  |  +----+----+ +----+----+ +----+----+ +---+----+ +---+----+   |    |
|  +-------+----------+----------+----------+---------+--------+    |
|          |           |          |          |         |             |
+----------+-----------+----------+----------+---------+-------------+
           |           |          |          |         |
           v           v          v          v         v
+---------------+ +-----------+ +----------------------------------+
|  Connectors   | |  Builder  | |       kb/notes/*.md               |
|  (数据源层)    | | (MD->HTML)| | (Markdown 源文件 + frontmatter)   |
+-------+-------+ +-----+-----+ +----------------------------------+
        |                |
        v                v
+---------------+ +-----------+
| kb/sources/   | |   dist/   |
| (原始采集物)   | | (HTML站点) |
+---------------+ +-----------+

+---------------------------------------------------------------------+
|                        外部依赖                                       |
|  +-----------+ +----------+ +----------+ +--------------------+      |
|  | LLM API   | | 飞书 API | | GitLab   | | OpenClaw/Hermes    |      |
|  | (OpenAI   | | (chat +  | | (CI/MR/  | | (飞书 bot + skill) |      |
|  | compat.)  | |  doc)    | |  Pages)  | |                    |      |
|  +-----------+ +----------+ +----------+ +--------------------+      |
+---------------------------------------------------------------------+
```


## Data Flow

### 1. Ingest 流程（采集 → 抽取 → 合并）

```
Step 1: FETCH
  for each enabled connector in kb.config.ts:
    sources[] = connector.incrementalSince(lastRunTimestamp)
    for each source in sources:
      raw = connector.fetch(source)
      hash = sha256(raw)
      if hash == lastKnownHash: skip (短路)
      else: write to kb/sources/<connector_id>/<resource_id>.<ext>
            record metadata { uri, fetched_at, hash }

Step 2: EXTRACT
  for each new/changed source file:
    claims[] = llm.extract(source_content, prompt=extract.hbs)
    // claims: [{ topic, claim_text, citation, confidence }]

Step 3: MERGE DECISION
  for each claim:
    existingNotes = loadIndex("kb/index.json")
    decision = llm.decide(claim, existingNotes, prompt=merge-decision.hbs)
    // decision: { action: "create"|"append"|"modify"|"discard",
    //             targetNoteId?, patch?, reason }

Step 4: APPLY
  for each decision where action != "discard":
    if create: write new kb/notes/<generated-id>.md with frontmatter
    if append: append content to existing note, update frontmatter
    if modify: apply patch to existing note, update frontmatter
  updateIndex("kb/index.md", "kb/index.json")
  git commit with structured message

Step 5: REPORT
  write ingest-report.md (sources processed, notes created/modified/discarded, tokens, cost)
```

### 2. Build 流程（MD → HTML）

```
Step 1: SCAN
  noteFiles[] = glob("kb/notes/**/*.md")

Step 2: PARSE
  for each noteFile:
    { frontmatter, body } = parseMarkdown(noteFile)
    validate frontmatter against schema (id, title, updated_at, sources, tags, links)

Step 3: RESOLVE LINKS
  wikiLinks = extractAll([[...]] patterns from all notes)
  backlinksGraph = computeBacklinks(wikiLinks)
  brokenLinks = validate all targets exist

Step 4: RENDER
  for each note:
    htmlBody = renderMarkdown(body)  // marked + plugins (mermaid, code highlight)
    htmlPage = applyTemplate("note.html", {
      frontmatter, htmlBody, backlinks, relatedNotes,
      rawMarkdown: originalFileContent  // for <script type="application/markdown">
    })
    write to dist/<note-id>.html

Step 5: INDEX PAGES
  generate dist/index.html (recent updates + stats)
  generate dist/tags/<tag>.html for each tag
  generate dist/llms.txt
  generate dist/kb-index.json
  generate dist/search-index.json (MiniSearch pre-built index)

Step 6: STATIC ASSETS
  copy styles.css, search.js, fonts to dist/assets/
```

### 3. Agent 交互流程（飞书群 → kb-cli）

```
飞书用户 @bot "搜一下 API 限速"
  |
  v
OpenClaw agent (SKILL.md 指令)
  |
  |-- shell: KB_ROOT=/path/to/repo kb-cli search "API 限速" --json
  |          => [{ id: "feishu-rate-limit", title: "飞书 API 限速策略", score: 0.87, snippet: "..." }]
  |
  |-- shell: kb-cli read feishu-rate-limit
  |          => 完整 MD 内容 (stdout)
  |
  |-- 组装回复: 摘要 + 站点链接 https://kb.internal.company.com/feishu-rate-limit.html
  |
  v
飞书用户收到回复

---

飞书用户 @bot "把这段加到 feishu-rate-limit 笔记里：新增 50次/分钟 的限制"
  |
  v
OpenClaw agent
  |
  |-- shell: kb-cli edit feishu-rate-limit --patch "在限速规则列表末尾追加：50次/分钟" --yes --branch bot/update-rate-limit
  |          => LLM 修改笔记 -> git commit -> push branch -> 输出 MR URL
  |
  |-- 回复用户: "已提交修改，MR: https://gitlab.internal/kb/-/merge_requests/42"
  |
  v
飞书用户（或管理员）在 GitLab 审核 MR
```

## Module Structure (目录结构)

```
kb-cli/
├── package.json                 # root package (pnpm workspace)
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── packages/
│   ├── core/                    # @kb-cli/core - 核心逻辑（不含 CLI 框架）
│   │   ├── src/
│   │   │   ├── config/          # 配置加载与校验
│   │   │   │   ├── schema.ts    # zod schema for kb.config.ts
│   │   │   │   └── loader.ts   # 加载 + 环境变量合并
│   │   │   │
│   │   │   ├── connectors/      # 数据源 connector
│   │   │   │   ├── types.ts     # Connector 接口
│   │   │   │   ├── registry.ts  # connector 注册表
│   │   │   │   ├── local-fs.ts
│   │   │   │   ├── http-fetch.ts
│   │   │   │   ├── git-repo.ts
│   │   │   │   ├── feishu-chat.ts
│   │   │   │   ├── feishu-doc.ts
│   │   │   │   └── internal-log.ts
│   │   │   │
│   │   │   ├── extractor/       # LLM 抽取
│   │   │   │   ├── types.ts     # Claim, ExtractResult
│   │   │   │   ├── extract.ts
│   │   │   │   └── prompts/
│   │   │   │       ├── extract.hbs
│   │   │   │       └── merge-decision.hbs
│   │   │   │
│   │   │   ├── merger/          # 笔记合并
│   │   │   │   ├── types.ts     # MergeDecision
│   │   │   │   ├── decide.ts
│   │   │   │   ├── apply.ts
│   │   │   │   └── index-manager.ts
│   │   │   │
│   │   │   ├── builder/         # MD → HTML
│   │   │   │   ├── types.ts
│   │   │   │   ├── build.ts
│   │   │   │   ├── wiki-link.ts
│   │   │   │   ├── backlinks.ts
│   │   │   │   ├── llms-txt.ts
│   │   │   │   └── template/
│   │   │   │       ├── note.html
│   │   │   │       ├── index.html
│   │   │   │       ├── tag.html
│   │   │   │       ├── styles.css
│   │   │   │       └── search.js
│   │   │   │
│   │   │   ├── llm/             # LLM provider 抽象
│   │   │   │   ├── types.ts
│   │   │   │   ├── openai-compat.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── fallback.ts
│   │   │   │   ├── cost-tracker.ts
│   │   │   │   └── profiles.ts
│   │   │   │
│   │   │   ├── runner/          # Runner 抽象层
│   │   │   │   ├── types.ts
│   │   │   │   ├── local.ts
│   │   │   │   └── gitlab-ci.ts
│   │   │   │
│   │   │   ├── security/        # 合规与脱敏
│   │   │   │   ├── pii.ts
│   │   │   │   ├── secrets.ts
│   │   │   │   └── preflight.ts
│   │   │   │
│   │   │   ├── search/          # 搜索
│   │   │   │   ├── indexer.ts
│   │   │   │   └── query.ts
│   │   │   │
│   │   │   └── logger/          # 结构化日志
│   │   │       └── json-logger.ts
│   │   │
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/                     # @kb-cli/cli - CLI 入口
│       ├── src/
│       │   ├── index.ts
│       │   ├── commands/
│       │   │   ├── init.ts
│       │   │   ├── ingest.ts
│       │   │   ├── build.ts
│       │   │   ├── serve.ts
│       │   │   ├── check.ts
│       │   │   ├── publish.ts
│       │   │   ├── search.ts
│       │   │   ├── read.ts
│       │   │   └── edit.ts
│       │   └── utils/
│       │       ├── confirm.ts
│       │       └── output.ts
│       ├── package.json
│       └── tsconfig.json
│
├── skills/                      # Agent Skill 模板
│   └── kb-wiki/
│       └── SKILL.md
│
├── templates/                   # kb-cli init 使用的模板
│   ├── kb.config.ts.hbs
│   ├── .gitlab-ci.yml.example
│   └── .gitignore.hbs
│
└── examples/                    # 示例知识库
    └── ai-agent-wiki/
        ├── kb.config.ts
        ├── kb/
        │   ├── notes/
        │   ├── sources/
        │   └── index.md
        └── dist/
```


## Key Interfaces

### Connector 接口

```typescript
// packages/core/src/connectors/types.ts

export interface ConnectorConfig {
  id: string;
  type: string;
  schedule: string;          // cron expression
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface SourceResource {
  id: string;
  uri: string;
  title?: string;
  updatedAt?: Date;
}

export interface FetchResult {
  resource: SourceResource;
  content: string;           // raw text content
  contentType: string;       // "text/markdown" | "text/plain" | "text/html"
  hash: string;              // sha256 of content
  metadata: Record<string, unknown>;
}

export interface Connector {
  readonly type: string;

  /** 列出可拉取的资源 */
  list(config: ConnectorConfig): Promise<SourceResource[]>;

  /** 拉取单条资源 */
  fetch(resource: SourceResource, config: ConnectorConfig): Promise<FetchResult>;

  /** 增量拉取（自 timestamp 以来有变更的） */
  incrementalSince(
    timestamp: Date,
    config: ConnectorConfig
  ): Promise<FetchResult[]>;
}
```

### LLM Provider 接口

```typescript
// packages/core/src/llm/types.ts

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface LLMProviderConfig {
  id: string;
  baseURL: string;
  apiKey: string;
  model: string;
  organization?: string;
  headers?: Record<string, string>;  // 代理网关自定义 header
  maxRetries: number;
  maxConcurrency: number;
  temperature?: number;
}

export interface LLMProvider {
  readonly id: string;

  chat(messages: LLMMessage[], config?: Partial<LLMProviderConfig>): Promise<LLMResponse>;

  /** 带 JSON schema 约束的结构化输出 */
  chatStructured<T>(
    messages: LLMMessage[],
    schema: ZodSchema<T>,
    config?: Partial<LLMProviderConfig>
  ): Promise<{ data: T; usage: LLMResponse["usage"] }>;
}

export interface FallbackChain {
  primary: string;     // provider profile id
  fallbacks: string[]; // ordered fallback profile ids
}

export interface TaskLLMMapping {
  extract: string | FallbackChain;
  merge: string | FallbackChain;
  summarize: string | FallbackChain;
  review: string | FallbackChain;
  edit: string | FallbackChain;
}
```

### Runner 接口

```typescript
// packages/core/src/runner/types.ts

export interface TaskSpec {
  id: string;
  type: "ingest" | "build" | "publish" | "check";
  params: Record<string, unknown>;
  limits?: {
    maxSources?: number;
    maxTokens?: number;
    timeoutMs?: number;
  };
}

export interface RunResult {
  taskId: string;
  status: "success" | "partial" | "failed";
  summary: {
    sourcesProcessed: number;
    notesCreated: number;
    notesModified: number;
    notesDiscarded: number;
    tokensUsed: number;
    estimatedCost: number;
    errors: string[];
  };
  duration: number; // ms
}

export interface ScheduleSpec {
  id: string;
  cron: string;
  task: TaskSpec;
  enabled: boolean;
}

export interface MemoryAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getLastRunTimestamp(connectorId: string): Promise<Date | null>;
  setLastRunTimestamp(connectorId: string, ts: Date): Promise<void>;
}

export interface Runner {
  readonly type: string;

  /** 执行一次任务 */
  runOnce(task: TaskSpec): Promise<RunResult>;

  /** 注册定时调度（local-runner 用 node-cron，gitlab-ci 生成 yml） */
  registerSchedule(spec: ScheduleSpec): Promise<void>;

  /** 持久状态存储 */
  memory: MemoryAdapter;
}
```

### Note Frontmatter Schema

```typescript
// packages/core/src/config/schema.ts (部分)

import { z } from "zod";

export const NoteSourceSchema = z.object({
  uri: z.string(),
  fetchedAt: z.string().datetime(),
  hash: z.string(),
  connectorId: z.string().optional(),
});

export const NoteFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),  // slug 格式
  title: z.string().min(1),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  sources: z.array(NoteSourceSchema).default([]),
  tags: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),  // 显式声明的 outgoing links
  status: z.enum(["draft", "published", "archived"]).default("published"),
});

export type NoteFrontmatter = z.infer<typeof NoteFrontmatterSchema>;
```

### kb.config.ts Schema (核心配置)

```typescript
// packages/core/src/config/schema.ts (部分)

export const KBConfigSchema = z.object({
  /** 项目名称 */
  name: z.string(),

  /** 笔记目录（相对于项目根） */
  notesDir: z.string().default("kb/notes"),
  sourcesDir: z.string().default("kb/sources"),
  outputDir: z.string().default("dist"),

  /** 数据源 */
  connectors: z.array(z.object({
    id: z.string(),
    type: z.enum(["local-fs", "http-fetch", "git-repo", "feishu-chat", "feishu-doc", "internal-log"]),
    schedule: z.string().default("0 */6 * * *"),  // 默认每6小时
    enabled: z.boolean().default(true),
    params: z.record(z.unknown()),
  })),

  /** LLM 配置 */
  llm: z.object({
    providers: z.array(z.object({
      id: z.string(),
      baseURL: z.string(),
      apiKey: z.string().default("${OPENAI_API_KEY}"),  // 支持环境变量引用
      model: z.string(),
      organization: z.string().optional(),
      headers: z.record(z.string()).optional(),
      maxRetries: z.number().default(3),
      maxConcurrency: z.number().default(2),
    })),
    tasks: z.object({
      extract: z.string().or(z.object({ primary: z.string(), fallbacks: z.array(z.string()) })),
      merge: z.string().or(z.object({ primary: z.string(), fallbacks: z.array(z.string()) })),
      summarize: z.string().or(z.object({ primary: z.string(), fallbacks: z.array(z.string()) })),
      review: z.string().or(z.object({ primary: z.string(), fallbacks: z.array(z.string()) })),
      edit: z.string().or(z.object({ primary: z.string(), fallbacks: z.array(z.string()) })),
    }),
  }),

  /** 安全与合规 */
  security: z.object({
    pii: z.object({
      enabled: z.boolean().default(true),
      customPatterns: z.array(z.object({
        name: z.string(),
        pattern: z.string(),  // regex
        replacement: z.string().default("[REDACTED]"),
      })).default([]),
    }),
    secrets: z.object({
      allowlist: z.array(z.string()).default([]),
      denylist: z.array(z.string()).default([]),
    }),
  }).optional(),

  /** 构建配置 */
  build: z.object({
    basePath: z.string().default("/"),
    siteTitle: z.string().optional(),
    siteDescription: z.string().optional(),
  }).optional(),

  /** 发布目标 */
  publish: z.object({
    type: z.enum(["git-push", "gitlab-pages", "local-copy"]).default("git-push"),
    remote: z.string().optional(),
    branch: z.string().default("main"),
  }).optional(),

  /** Runner 配置 */
  runner: z.object({
    type: z.enum(["local", "gitlab-ci"]).default("local"),
  }).optional(),
});

export type KBConfig = z.infer<typeof KBConfigSchema>;
```


## GitLab CI Template (.gitlab-ci.yml.example)

```yaml
# .gitlab-ci.yml - KB Auto-Update Pipeline
# 由 kb-cli init 生成，按需修改

variables:
  NODE_IMAGE: node:20-alpine
  KB_ROOT: $CI_PROJECT_DIR

stages:
  - ingest
  - build
  - deploy

# ============================================================
# Stage 1: 定时采集 + LLM 抽取 + 笔记合并
# 触发方式: GitLab Scheduled Pipeline (Build > Pipeline schedules)
# ============================================================
kb:ingest:
  stage: ingest
  image: $NODE_IMAGE
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - |
      # 执行 ingest，自动确认
      npx kb-cli ingest --yes --limit-tokens ${KB_MAX_TOKENS:-100000}

      # 检查是否有变更
      if git diff --quiet kb/notes/ kb/index.md kb/index.json; then
        echo "No changes detected, skipping MR creation."
        exit 0
      fi

      # 有变更则提交并创建 MR
      BRANCH_NAME="kb/auto-update-$(date +%Y%m%d-%H%M)"
      git checkout -b "$BRANCH_NAME"
      git add kb/notes/ kb/index.md kb/index.json kb/.logs/
      git commit -m "chore(kb): auto-update $(date +%Y-%m-%d)"
      git push origin "$BRANCH_NAME"

      # 使用 GitLab API 创建 MR
      curl --request POST \
        --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
        --header "Content-Type: application/json" \
        --data "{
          \"source_branch\": \"${BRANCH_NAME}\",
          \"target_branch\": \"main\",
          \"title\": \"chore(kb): auto-update $(date +%Y-%m-%d)\",
          \"description\": \"Automated knowledge base update via scheduled pipeline.\",
          \"remove_source_branch\": true
        }" \
        "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests"
  artifacts:
    paths:
      - kb/.logs/
    expire_in: 7 days

# ============================================================
# Stage 2: 构建 HTML 站点
# 触发方式: 任何 push 到 main（包括 MR 合并后）
# ============================================================
kb:build:
  stage: build
  image: $NODE_IMAGE
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - npx kb-cli build --out dist --base "/"
    - npx kb-cli check
  artifacts:
    paths:
      - dist/
    expire_in: 1 day

# ============================================================
# Stage 3: 部署到 GitLab Pages
# ============================================================
pages:
  stage: deploy
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  needs:
    - job: kb:build
      artifacts: true
  script:
    - mv dist public
  artifacts:
    paths:
      - public/
```

## OpenClaw Skill Template (skills/kb-wiki/SKILL.md)

```markdown
# KB Wiki - 团队知识库技能

你拥有一个团队知识库的读写能力。知识库存放在 $KB_ROOT 目录下，通过 `kb-cli` 命令操作。

## 能力

### 搜索笔记
当用户询问某个知识点时，先搜索知识库：
\`\`\`bash
kb-cli search "关键词" --json --limit 5
\`\`\`
输出格式: `[{ "id": "note-id", "title": "标题", "score": 0.87, "snippet": "..." }]`

### 阅读笔记
找到相关笔记后，读取完整内容：
\`\`\`bash
kb-cli read <note-id>
\`\`\`
输出: 完整的 Markdown 内容

### 修改笔记
当用户要求添加或修改知识时：
\`\`\`bash
kb-cli edit <note-id> --patch "修改指令" --yes --branch bot/update-<note-id>
\`\`\`
这会自动创建 Git commit 并推送分支。如果配置了 GitLab，会自动创建 MR。

### 采集新 URL
当用户分享一个链接并要求加入知识库时：
\`\`\`bash
kb-cli ingest --source http-fetch --url "https://..." --yes
\`\`\`

### 查看状态
\`\`\`bash
kb-cli check
\`\`\`

## 决策指引

1. 当用户问知识相关问题时，**先搜索**再回答
2. 搜索无结果时，告知用户"知识库中暂无相关内容"并建议添加
3. **不要在群聊中输出超过 500 字的笔记全文**，给摘要 + HTML 站点链接
4. 修改操作会产生 MR，告知用户 MR 链接以便审核
5. 对于敏感内容（含手机号、身份证等），提醒用户知识库会自动脱敏

## 环境要求

- `kb-cli` 已安装在 PATH 中
- 环境变量 `KB_ROOT` 指向知识库仓库根目录
- Git 已配置推送权限
```

## Technology Choices

| 领域 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript 5.x | 类型安全、前后端统一、生态丰富 |
| 运行时 | Node.js 20+ | LTS、原生 fetch、ESM |
| 包管理 | pnpm + workspace | monorepo 管理、磁盘效率 |
| CLI 框架 | commander.js | 轻量、成熟、零配置 |
| 配置校验 | zod | 类型推导 + 运行时校验一体 |
| Markdown 解析 | unified (remark + rehype) | 插件生态（wiki-link、mermaid、GFM） |
| HTML 模板 | 内置 template literal | 无额外依赖，静态站不需要复杂模板引擎 |
| 客户端搜索 | MiniSearch | 轻量（~7KB gzip）、支持中文分词（配 jieba-wasm） |
| HTTP 抓取 | undici + @mozilla/readability | Node 原生 + 正文抽取 |
| 飞书 SDK | @larksuiteoapi/node-sdk | 官方 SDK，类型完整 |
| Git 操作 | simple-git | 轻量封装，避免直接 spawn |
| 静态服务 | sirv-cli (dev) | 零配置静态服务 |
| 测试 | vitest | 快、ESM 原生、与 TS 无缝 |
| Lint | eslint + prettier | 标准工具链 |

## Security Design

### PII 脱敏流水线

```
原始内容 ──> PII Scanner ──> 脱敏后内容 ──> 写入 kb/sources/
                |
                v
         metadata.redactions: [
           { offset: 23, length: 11, type: "phone", replacement: "[PHONE]" }
         ]
```

内置规则：
- 手机号: `/1[3-9]\d{9}/g` → `[PHONE]`
- 邮箱: `/[\w.-]+@[\w.-]+\.\w+/g` → `[EMAIL]`
- 身份证: `/\d{17}[\dXx]/g` → `[ID_CARD]`
- 银行卡: `/\d{16,19}/g` (上下文判断) → `[BANK_CARD]`
- IP: `/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g` → `[IP]`

### 凭据管理

```
kb.config.ts 中引用环境变量:
  apiKey: "${OPENAI_API_KEY}"

运行时 loader.ts 解析 ${...} 并从 process.env 读取。
绝不把实际值写入配置文件。

GitLab CI: 通过 Settings > CI/CD > Variables 注入
本地开发: 通过 .env 文件（已在 .gitignore 中排除）
```

### Pre-flight Check

每次 `ingest` / `build` 前执行：
1. 检查必要环境变量是否存在（LLM key、飞书凭据等）
2. 检查 `kb/notes/` 目录写权限
3. 检查磁盘剩余空间 > 100MB
4. LLM 健康探活（发一个 ping 请求）
5. 检查 Git 状态（无未提交的冲突）

任一失败 → 打印清晰错误 → exit 1

## Build Output Structure

```
dist/
├── index.html              # 首页（最近更新 + 统计 + tag 云）
├── tags/
│   ├── feishu.html
│   ├── api.html
│   └── ...
├── notes/
│   ├── feishu-rate-limit.html
│   ├── gitlab-ci-best-practices.html
│   └── ...
├── assets/
│   ├── styles.css          # 响应式 + 深色模式
│   ├── search.js           # MiniSearch 客户端
│   ├── search-index.json   # 预构建搜索索引
│   └── fonts/
├── llms.txt                # llmstxt.org 规范
├── kb-index.json           # 机读全量索引
└── _admin/                 # 管理仪表盘 (Phase 2)
    └── index.html
```

## Phasing Plan

| Phase | 内容 | 预估工期 |
|---|---|---|
| **Phase 1 (MVP)** | core + cli + local-runner + gitlab-ci template + 6 connectors + builder + OpenClaw skill | 4-6 周 |
| **Phase 2** | Hermes runner + Hermes skill + RSS/Notion connector + _admin 仪表盘 + 中文分词优化 | 3-4 周 |
| **Phase 3** | MCP Server + 知识图谱可视化 + LLM-assisted search + parallel research mode + 导出 | 4-6 周 |

## Design Decisions & Tradeoffs

### 为什么 pnpm monorepo 而不是单包？

`@kb-cli/core` 和 `@kb-cli/cli` 分离，使得：
- core 可以被其他工具（MCP Server、Hermes skill）直接 import
- CLI 框架（commander）不污染核心逻辑
- 未来加 `@kb-cli/web`（admin dashboard）时不影响 CLI 包体积

### 为什么用 unified/remark 而不是 marked？

- remark 的插件系统支持自定义 wiki-link 语法（`[[...]]`）
- rehype 管道可以在 HTML 层注入 `<script type="application/markdown">`
- 支持 GFM 表格、脚注、Mermaid 图的插件成熟

### 为什么客户端搜索而不是 server-side？

- 静态站点不依赖后端 = 零运维
- MiniSearch 在千级文档下性能足够（<50ms）
- 万级时可以切换为预分片索引 + Web Worker，仍然不需要后端
- 如果真到万级且搜索体验不够，Phase 3 加 Meilisearch/Typesense 容器

### 为什么 Git commit 而不是数据库？

- 版本历史 = Git log，天然可审计
- MR = 人工审核入口
- 与 GitLab CI/Pages 无缝集成
- 团队已有 Git 工作流，零学习成本
- 缺点：并发写入需要锁（CI 中通过单 job 串行解决）
