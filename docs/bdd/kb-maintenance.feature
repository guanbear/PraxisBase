Feature: KB maintenance
  Stable wiki pages can be audited and pruned without bypassing wiki synthesis gates.

  Scenario: Audit reports bad stable markdown without mutation
    Given a valid wiki page under kb
    And a low-quality markdown page under kb
    When I run kb audit
    Then the report lists the low-quality page
    And no files are deleted

  Scenario: Prune is dry-run by default
    Given a low-quality markdown page under kb
    When I run kb prune without confirmation
    Then the report says dry_run is true
    And the low-quality page remains on disk

  Scenario: Confirmed prune deletes only bad kb markdown
    Given a low-quality markdown page under kb
    And a low-quality skill file under skills
    And a valid kb page links to the low-quality markdown page
    When I run kb prune with confirmation
    Then only the low-quality kb markdown page is deleted
    And the valid kb page keeps the link label as plain text

  Scenario: Rebuild reuses the daily wiki flow
    Given a local source and a low-quality stable page
    When I run kb rebuild with confirmation
    Then the low-quality stable page is pruned
    And the daily experience flow produces its normal report
