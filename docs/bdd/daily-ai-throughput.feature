Feature: Daily AI throughput
  Production daily runs should be fast enough for full local use while preserving privacy, provenance, and wiki quality.

  Scenario: Configure separate distill and curation models
    Given an empty PraxisBase workspace
    When I run ai init with model "GLM-5.1", distill model "GLM-4.7", and curation model "GLM-5.1"
    Then the AI config stores no secret values
    And the config contains distill_model "GLM-4.7"
    And the config contains curation_model "GLM-5.1"

  Scenario: Daily distill uses the distill model
    Given a production daily run with an OpenAI-compatible provider
    And the AI config has model "GLM-5.1" and distill_model "GLM-4.7"
    When a local experience chunk is distilled
    Then the provider request uses model "GLM-4.7"
    And the daily report ai_distill model is "GLM-4.7"

  Scenario: Wiki curation uses the curation model
    Given a wiki curation run with an OpenAI-compatible provider
    And the AI config has model "GLM-4.7" and curation_model "GLM-5.1"
    When a wiki proposal is synthesized
    Then the provider request uses model "GLM-5.1"

  Scenario: Re-running daily reuses cached distill output
    Given a local experience source with one safe chunk
    And a first production daily run distilled the chunk successfully
    When I run daily again with the same authority mode, model, source hash, and chunk hash
    Then daily does not call the distill model for that chunk
    And ai_distill.cache_hits is 1
    And the rebuilt envelope keeps the original provenance

  Scenario: High concurrency remains bounded
    Given a local experience source with at least twelve safe chunks
    When I run daily with ai concurrency 12
    Then more than eight distill calls may be in flight
    And no more than twelve distill calls are in flight
