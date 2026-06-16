# Wiki Index

## known_fix

- [[agents-can-mislead-users-if-failures-are-reported-as-successful-outcomes|Agents can mislead users if failures are reported as successful outcomes.]] - # Agents can mislead users if failures are reported as successful outcomes.

## When to Use
Use this guidance when designing or operating agents that perform operations, delegate tasks, or enforce gua
- [[missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution|Missing replay data compromises the ability to debug or verify past execution behaviors]] - # Missing replay data compromises the ability to debug or verify past execution behaviors

## When to Use
Use this guidance when executing stability tests (e.g., Stability Smoke v2) or nightly replay 
- [[openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]] - # OpenClaw dispatch routing failures

## When to Use

Apply this guidance when:

* OpenClaw or OctoClaw runners fail with `ReferenceError: stickyResult is not defined`.
* Post-deploy smoke tests repor
- [[post-deploy-stability-smoke-test-run-openclaw-resulted-in-an-overall-failure|Post-deploy stability smoke test run 'openclaw' resulted in an overall failure]] - # Post-deploy stability smoke test run 'openclaw' resulted in an overall failure

## When to Use
Use this guidance when investigating failures in the OpenClaw post-deploy stability smoke tests, specif

## pitfall

- [[ack-timing-before-long-running-agent-work|ACK timing before long-running agent work]] - # ACK timing before long-running agent work

## When to Use
Use this guidance when an agent is about to initiate any operation that may take more than a few seconds to complete, specifically:

* Execu
- [[changes-can-introduce-regressions-when-not-tested-after-modification|Changes can introduce regressions when not tested after modification]] - # Changes can introduce regressions when not tested after modification

## When to Use
Use this page when performing modifications to code, configuration, or operational procedures. It is particularly

## procedure

- [[actions-on-the-wrong-target-machine-or-host-can-cause-unsafe-operational-changes|Actions on the wrong target machine or host can cause unsafe operational changes.]] - # Actions on the wrong target machine or host can cause unsafe operational changes.

## When to Use
Use this procedure before performing any restart, modification, or operational action on a system, s
- [[case-sensitive-database-comparisons-can-miss-logically-equivalent-values|Case-sensitive database comparisons can miss logically equivalent values.]] - # Case-sensitive database comparisons can miss logically equivalent values.

## When to Use
Use this guidance when designing database schemas, writing SQL queries for lookups, or enforcing uniqueness 
- [[openclaw-slack-replay-and-post-deploy-stability-failures|OpenClaw Slack replay and post-deploy stability failures]] - # OpenClaw Slack replay and post-deploy stability failures

## When to Use

Apply this procedure when the Stability Smoke v2 post-deploy test suite fails, specifically if you observe:

*   `live_slack
- [[stale-caches-can-hide-current-behavior-or-serve-outdated-assets|Stale caches can hide current behavior or serve outdated assets]] - # Stale caches can hide current behavior or serve outdated assets

## When to Use
Use this procedure when:
* Updates to web assets or API responses are not reflected immediately for end-users.
* Testi

## skill

- [[skill-openclaw-openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]] - # OpenClaw dispatch routing failures

## When To Use
Use this when OpenClaw or OctoClaw delegation, runner dispatch, or task routing looks successful from the main chat but the evidence shows missing 
