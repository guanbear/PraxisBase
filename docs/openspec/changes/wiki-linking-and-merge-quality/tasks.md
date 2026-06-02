# Wiki Linking And Merge Quality Tasks

- [ ] Add relationship planning schemas and helper functions.
- [ ] Add deterministic related-page discovery from topic/stable page metadata.
- [ ] Wire relationship plans into page planning so canonical matches become update/merge instead of create.
- [ ] Pass required/suggested links and merge candidates into AI curator prompt.
- [ ] Extend curated proposal schema with related pages, required links, suggested links, merge candidates, and relationship reasons.
- [ ] Extend promotion quality assessment for missing wikilinks, ambiguous merge targets, cross-scope merge, and create-with-canonical-page.
- [ ] Extend curation reports with relationship counts.
- [ ] Extend review/site HTML with link and merge explanations.
- [ ] Add tests for ACK timing evidence collapsing into one canonical plan.
- [ ] Add tests for stdin-closed evidence collapsing into one canonical plan.
- [ ] Add tests for existing stable page causing update instead of create.
- [ ] Add tests for missing required wikilinks becoming human-required.
- [ ] Add tests for allowed isolated page when no related stable page exists.
- [ ] Add end-to-end regression proving graph orphan count drops for a fixture with related stable pages.
- [ ] Run focused wiki tests, package builds, and `pnpm check`.
