@review
Feature: Review submission
  As a human reviewer
  I want submitting a review to publish my critique and open the next round
  So that the agent sees one coherent batch of feedback per round

  Background:
    Given Suikou is running locally
    And a markdown artifact under review

  # Submitting is what advances the round (see BDR-0018): it publishes the draft
  # round's pending comments and opens the next draft round. A review carries no
  # verdict — the critique is the disposition (see BDR-0027). Unresolved comments
  # stay visible on the next round as the same single rows, by derived visibility
  # rather than copying (see BDR-0023). Rounds are numbered from 0.
  Rule: Submitting a review advances the round

    Scenario: Submitting the current draft round publishes it and opens the next
      Given the artifact's current draft round is round 1
      When the reviewer submits a review of round 1
      Then the review is attached to round 1
      And round 1's pending comments are published
      And round 2 is opened as the next draft round
      And round 1's unresolved comments stay visible on round 2

    Scenario: Submitting a superseded round is rejected
      Given the artifact's current draft round is round 1
      When the reviewer tries to submit a review of round 0
      Then the review is rejected

  # The human holds final judgment (see BDR-0027, superseding BDR-0012): nothing
  # blocks a submit. The per-comment critique type advises the agent; it never
  # gates the reviewer.
  Rule: Open critique never blocks a submit

    Scenario: Submitting while a fix_required comment is open
      Given the current draft round has an unresolved fix_required comment
      When the reviewer submits a review
      Then the review is submitted
      And the fix_required comment stays open for the agent

  # A file's disposition is read from its critique, not from a stored word.
  Rule: A file's standing is read from its open critique

    Scenario: A file with no open comment owes the agent nothing
      Given every comment on the artifact is resolved
      When the agent reads the artifact's critique
      Then no work is outstanding on the artifact

    Scenario: A file with an open fix_required comment owes a change
      Given the artifact has an unresolved fix_required comment
      When the agent reads the artifact's critique
      Then the fix_required comment is outstanding
