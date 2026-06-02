---
id: stale-caches-can-hide-current-behavior-or-serve-outdated-assets
title: "Stale caches can hide current behavior or serve outdated assets"
protocol_version: "0.1"
type: procedure
knowledge_type: procedure
scope: personal
risk: medium
status: draft
maturity: draft
sources:
  - uri: "source-inventory://openclaw/.praxisbase/staging/trusted-remote-openclaw/source_guanzhicheng-openclaw/1756229c2de0ed90/002-f21b35795b39-MEMORY.md"
    hash: "sha256:07d7111a69d9e7ce4c0f8400455dfedc6acfaf46316612b7a4530ccd7bd2ebd7"
source_count: 1
confidence: 0.93
updated_at: "2026-06-02T01:26:03.007Z"
---
# Stale caches can hide current behavior or serve outdated assets

## When to Use
Use this procedure when:
* Updates to web assets or API responses are not reflected immediately for end-users.
* Testing recent code changes results in unexpected behavior that matches previous versions.
* Debugging issues where the client or proxy appears to be ignoring server-side updates.

## Symptoms or Context
* Users report seeing old data or interfaces despite a confirmed deployment.
* Browser DevTools shows 304 Not Modified responses or 200 OK responses with old content timestamps.
* System behavior does not match the expected logic of the currently deployed code version.

## What To Do
Implement explicit cache busting to force the retrieval of fresh content. Common methods include:

1. **Timestamped Cache Keys:** Append a timestamp or version number to asset filenames or query parameters (e.g., `style.v123.css` or `script.js?t=1698765432`).
2. **Versioned File Paths:** Update the directory or filename of static assets during the build process (e.g., `/static/v1.2.3/image.png`).
3. **Cache-Control Headers:** Configure server headers to reduce the Time-To-Live (TTL) for specific resources that change frequently.

Apply these methods specifically when cache-sensitive content changes or when stale results are suspected.

## Verify
* Confirm that the fresh content is fetched rather than a stale cached copy.
* Check network requests in browser DevTools to ensure new cache keys or headers trigger a full response (200 OK) rather than a cached validation (304 Not Modified).
* Verify that the user interface reflects the latest changes immediately after the update.

## Reusable Lessons
* When cache-sensitive content changes or stale results are suspected, use explicit cache busting such as timestamped cache keys where appropriate.
* Relying solely on browser or intermediary cache expiration logic can lead to user-facing inconsistencies during updates.

## Agent Use
* **Use this page when:** Investigating issues involving outdated content delivery, inconsistent user experiences post-deployment, or "ghost" bugs related to old code.
* **Apply it by:** Injecting version identifiers into asset URLs, modifying query parameters for dynamic requests, or adjusting server-side cache control headers.
* **Verify by:** Asserting that the response payload corresponds to the latest source data and that new cache keys are generated for content updates.
* **Do not use it when:** The issue is related to server-side errors (5xx) or network connectivity failures that prevent content retrieval entirely.

## Provenance
- source-inventory://openclaw/.praxisbase/staging/trusted-remote-openclaw/source_guanzhicheng-openclaw/1756229c2de0ed90/002-f21b35795b39-MEMORY.md (sha256:07d7111a69d9e7ce4c0f8400455dfedc6acfaf46316612b7a4530ccd7bd2ebd7)

## Related Wiki Pages
* [[changes-can-introduce-regressions-when-not-tested-after-modification|Changes can introduce regressions when not tested after modification]]
* [[case-sensitive-database-comparisons-can-miss-logically-equivalent-values|Case-sensitive database comparisons can miss logically equivalent values]]
