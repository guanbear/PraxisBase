# LLMHTML — Self-Updating Knowledge Base for Teams

> Markdown source · HTML output · GitLab CI powered · Feishu native

A self-updating knowledge base tool that works for both humans and AI agents. Inspired by [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) and [Thariq Shihipar's *The Unreasonable Effectiveness of HTML*](https://x.com/trq212/status/2052809885763747935).

## Core Idea

- **Markdown** as the source of truth — LLM-friendly, Git-diffable, no special editor needed
- **HTML** as the output — interactive, shareable, mobile-friendly, embeds raw MD for agent round-trips
- **GitLab CI** as the scheduler — Scheduled Pipelines trigger ingest, updates go through MR review
- **Feishu-native** — pull from group chats & docs, query/edit via OpenClaw bot skill

## Status

🚧 **In design phase.** Spec documents are complete, implementation starting soon.

- [x] Requirements (`/.kiro/specs/llm-html-kb/requirements.md`)
- [x] Design (`/.kiro/specs/llm-html-kb/design.md`)
- [x] Tasks (`/.kiro/specs/llm-html-kb/tasks.md`)
- [ ] Implementation (Phase 1 MVP)

## What It Does

```
Data Sources                  kb-cli                    Output
────────────                  ──────                    ──────
Feishu Chat    ──┐            ingest                    kb/notes/*.md
Feishu Docs    ──┤  ──────►  (LLM extract+merge)  ──►  (Markdown source)
Local Files    ──┤
Web Pages      ──┤            build                     dist/*.html
Git Repos      ──┤  ──────►  (MD → HTML)           ──►  (Static site)
Internal Logs  ──┘
                              search / read / edit
                   ──────►  (Agent CLI commands)    ──►  OpenClaw Feishu Bot
```

## Planned Features (Phase 1 MVP)

- `kb-cli init` — scaffold a new knowledge base in seconds
- `kb-cli ingest` — pull sources, extract knowledge with LLM, merge into notes
- `kb-cli build` — compile Markdown notes into a static HTML site
- `kb-cli serve` — local preview server
- `kb-cli search / read / edit` — agent-friendly commands for Feishu bot integration
- GitLab CI template — scheduled ingest → auto MR → GitLab Pages deploy
- OpenClaw Skill template — `@bot search/read/edit` in Feishu groups
- 6 connectors: local-fs, http-fetch, git-repo, feishu-chat, feishu-doc, internal-log
- LLM provider: OpenAI-compatible (DeepSeek, Kimi, Bailian, vLLM, proxy gateways)
- PII redaction built-in (phone, email, ID card, bank card, IP)

## Compared to Existing Projects

| Project | Self-updating | HTML output | Feishu | GitLab CI | Enterprise |
|---|---|---|---|---|---|
| nashsu/llm_wiki | ❌ manual | ❌ GUI only | ❌ | ❌ | ❌ |
| nvk/llm-wiki | ❌ manual | ❌ MD only | ❌ | ❌ | ❌ |
| SamurAIGPT/llm-wiki-agent | ❌ manual | ❌ | ❌ | ❌ | ❌ |
| **LLMHTML** | ✅ CI cron | ✅ static site | ✅ native | ✅ first-class | ✅ PII + MR review |

## Roadmap

- **Phase 1 (MVP)**: Core CLI + 6 connectors + GitLab CI + OpenClaw skill
- **Phase 2**: Hermes runner + RSS/Notion connectors + admin dashboard
- **Phase 3**: MCP Server + knowledge graph visualization + parallel research mode

## References

- [Karpathy LLM Wiki gist v1](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [LLM Wiki v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)
- [The Unreasonable Effectiveness of HTML](https://x.com/trq212/status/2052809885763747935)
- [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki)
- [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB)
- [Hermes Agent](https://hermes-agent.nousresearch.com/)
- [OpenClaw](https://github.com/openclaw/openclaw)

## License

MIT
