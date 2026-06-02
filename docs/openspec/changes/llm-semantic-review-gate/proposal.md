# Proposal: LLM Semantic Review Gate

Add an LLM-based semantic review gate to the wiki curation pipeline.

The current deterministic gates catch structural, safety, privacy, path, provenance, and obvious quality failures. They do not reliably catch pages that are formally valid but semantically weak: one-off run reports, cleaned evidence summaries, empty sections, dangling fragments, or pages that should merge into an existing topic.

This change introduces a separate LLM reviewer after synthesis and deterministic hard gates. The reviewer returns a structured decision: `promote`, `revise`, `merge`, `reject`, or `needs_human`. Deterministic policy then arbitrates final behavior. The LLM reviewer cannot override hard security, privacy, path, or provenance rules.

The result should produce fewer, more durable, more agent-usable wiki pages.
