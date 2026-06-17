# OpenClaw Atomic Memory Extraction Plan

1. Add the failing source-adapter regression test.
2. Implement markdown block splitting helpers inside the OpenClaw source adapter path.
3. Expand resolved OpenClaw entries before applying `limit` and envelope creation.
4. Run TypeScript and source-adapter tests.
5. Run a local resolve against the cached `openclaw-answer-bot` export to compare old 34 chunk count with the new atomic item count.
