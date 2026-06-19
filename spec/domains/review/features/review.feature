@review
Feature: Review verdict
  As a human reviewer
  I want each review I submit to carry an overall verdict
  So that the agent knows the round's disposition and whether the work is accepted

  Background:
    Given Suikou is running locally
    And a markdown artifact under review

  # Submitting is what advances the round (see BDR-0018): it publishes the draft
  # round's pending comments, records the verdict, and opens the next draft round.
  # Unresolved comments stay visible on the next round as the same single rows, by
  # derived visibility rather than copying (see BDR-0023). Rounds are numbered from 0.
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

  # Verdict is the per-review disposition; critique type is the per-comment action.
  # They are orthogonal layers (see BDR-0016).
  Rule: An approve verdict accepts the artifact

    Scenario: A review with verdict approve records the approved round
      Given the artifact's current draft round is round 2
      When the reviewer submits a review of round 2 with verdict "approve"
      Then the artifact is approved
      And round 2 is recorded as the approved round

    Scenario: A review with verdict request_changes does not accept the artifact
      Given the artifact's current draft round is round 2
      When the reviewer submits a review of round 2 with verdict "request_changes"
      Then the artifact is not approved
      And the artifact remains under review

    Scenario: A review with verdict comment does not accept the artifact
      Given the artifact's current draft round is round 2
      When the reviewer submits a review of round 2 with verdict "comment"
      Then the artifact is not approved
      And the artifact remains under review

  # Soft gate: the human holds final judgment (see BDR-0012). The per-comment
  # critique type advises the agent; it never vetoes the reviewer's verdict.
  Rule: An approve verdict is allowed with unresolved fix_required comments, with a warning

    Scenario: Approving while a fix_required comment is open
      Given the current draft round has an unresolved fix_required comment
      When the reviewer submits a review with verdict "approve"
      Then the reviewer is warned about the unresolved comment
      And the artifact is approved

  Rule: The reviewer can dismiss an approval to reopen the review

    Scenario: Dismissing an approval reopens the review
      Given the artifact is approved
      When the reviewer dismisses the approval
      Then the artifact is no longer approved
      And the review is open again

  # Approval is superseded, never a barrier (see BDR-0013). The agent edits the
  # file on disk; the reviewer pulls those edits into a new round and submits it.
  Rule: Submitting a later round after approval clears approval

    Scenario: Reviewer reviews the agent's revision of an approved artifact
      Given the artifact is approved at round 2
      And round 3 is the open draft round
      And the agent has changed the file on disk
      When the reviewer re-snapshots round 3 and submits it
      Then the approval is cleared
      And round 3 is published

  Rule: Approve is the only terminal verdict

    Scenario: request_changes is not a terminal state
      Given the current draft round has an unresolved fix_required comment
      When the reviewer submits a review with verdict "request_changes"
      Then the artifact remains under review
      And no terminal reject state is recorded
