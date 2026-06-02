# Proposal: KB Maintenance

Add local maintenance commands for existing stable wiki pages:

- `praxisbase kb audit`
- `praxisbase kb prune`
- `praxisbase kb rebuild`

This addresses historical low-quality pages already present in `kb/` while preserving the llm-wiki pipeline. Maintenance may remove invalid stable pages, but it must not synthesize or promote new pages outside the existing daily/wiki review gates.
