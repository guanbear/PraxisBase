# Design

## Configuration Model

`knowledge_bases` accepts both the existing scalar form and an object form. The object form adds `profile`, `filter_mode`, and `filter_rules`:

```yaml
knowledge_bases:
  - id: openclaw
    label: OpenClaw 经验知识库
    profile: openclaw
    filter_mode: allowlist
    filter_rules:
      - keep_openclaw_repair
      - keep_openclaw_qa_policy
      - keep_verification_or_escalation
      - reject_greeting_only
  - id: k8s
    label: K8s 经验知识库
    profile: k8s
    filter_mode: allowlist
    filter_rules:
      - keep_k8s_repair
      - keep_verification_or_escalation
      - reject_greeting_only
```

Global `knowledge_filter_rules` remains as a fallback for scalar knowledge bases and older configs.

## Filter Semantics

Each source is mapped to a knowledge base using explicit metadata when present, then source refs, paths, and text signals. If the matched base uses `filter_mode: allowlist`, only named keep rules can include the item. Reject rules always win. `balanced` bases keep the current useful-experience heuristics and use named rules as hints.

The OpenClaw built-ins keep repair actions, robot fixed-answer policies, verification/escalation guidance, and reject greeting-only content. This is intentionally high recall for OpenClaw repair/Q&A experience, while keeping non-experience noise out.

## UI And Artifacts

The dashboard shows one card per configured knowledge base with stable/source/pending/privacy counts plus profile, mode, and active rules. `dist/knowledge-config.json` mirrors the resolved config for GitLab Pages and review automation.

## Compatibility

- Existing `knowledge_bases: [openclaw, k8s]` style configs still parse.
- Existing `.praxisbase/filter-rules.yaml` still runs before general curation heuristics.
- Privacy gates and proposal approval remain downstream authorities.
