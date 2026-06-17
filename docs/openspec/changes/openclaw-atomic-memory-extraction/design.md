# Design

## Pipeline Point

The split happens inside the source adapter after raw items are read and before `ExperienceEnvelope` creation. This is the earliest safe point shared by file, git, ssh, and exported-json OpenClaw sources. It also means downstream privacy triage, distill caching, source ledger, coverage, and curation do not need separate code paths.

## Atomic Item Rules

The atomizer applies only to OpenClaw `openclaw-export` or markdown memory-like items with `metadata.path` such as `MEMORY.md` or `memory/YYYY-MM-DD.md`.

It emits:

- specific heading sections, such as `### Monitor logs 打开失败`, as one atomic item;
- top-level bullets under broad headings, such as fixed reply policies, as separate atomic items;
- consecutive scenario bullets that refer to the same trigger scenario as one atomic item;
- a line-range suffix on `source_ref`, for example `#L20-L23`.

The original item remains unsplit when no useful atomic block can be found.

## Privacy And Provenance

Each atomic item keeps only the relevant markdown excerpt as `text`, `raw_log`, and `summary`. Privacy scanning therefore sees less unrelated Feishu/user material, while the source ref still points back to the original chunk and source lines. The source hash is computed from the atomic item, so every experience gets independent coverage and review state.

## Risk Controls

- Non-OpenClaw sources are not atomized.
- Large or broad headings are split conservatively by top-level bullets.
- Existing summary truncation and private-material checks still apply.
- If a block is empty, too generic, or unsupported, it is ignored rather than promoted.
