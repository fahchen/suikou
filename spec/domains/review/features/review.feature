@review
Feature: Review verdict
  As a human reviewer
  I want each review I submit to carry an overall verdict
  So that the agent knows the round's disposition and whether the work is accepted

  Background:
    Given Suikou is running locally
    And a markdown artifact under review

  # A review attaches to the version in front of the reviewer; earlier rounds are
  # frozen history (see BDR-0011) and open feedback reaches later rounds via
  # carry-forward (see BDR-0009).
  Rule: A review is submitted on the latest round only

    Scenario: Submitting a review on the current round
      Given the artifact is at round 2
      When the reviewer submits a review of round 2
      Then the review is attached to round 2

    Scenario: Submitting a review on a superseded round is rejected
      Given the artifact is at round 2
      When the reviewer tries to submit a review of round 1
      Then the review is rejected

  # Verdict is the per-review disposition; critique type is the per-comment action.
  # They are orthogonal layers (see BDR-0016).
  Rule: An approve verdict accepts the artifact

    Scenario: A review with verdict approve records the approved round
      Given the artifact is at round 2
      When the reviewer submits a review of round 2 with verdict "approve"
      Then the artifact is approved
      And round 2 is recorded as the approved round

    Scenario: A review with verdict request_changes does not accept the artifact
      Given the artifact is at round 2
      When the reviewer submits a review of round 2 with verdict "request_changes"
      Then the artifact is not approved
      And the artifact remains under review

    Scenario: A review with verdict comment does not accept the artifact
      Given the artifact is at round 2
      When the reviewer submits a review of round 2 with verdict "comment"
      Then the artifact is not approved
      And the artifact remains under review

  # Soft gate: the human holds final judgment (see BDR-0012). The per-comment
  # critique type advises the agent; it never vetoes the reviewer's verdict.
  Rule: An approve verdict is allowed with unresolved fix_required comments, with a warning

    Scenario: Approving while a fix_required comment is open
      Given the latest round has an unresolved fix_required comment
      When the reviewer submits a review with verdict "approve"
      Then the reviewer is warned about the unresolved comment
      And the artifact is approved

  Rule: The reviewer can dismiss an approval to reopen the review

    Scenario: Dismissing an approval reopens the review
      Given the artifact is approved
      When the reviewer dismisses the approval
      Then the artifact is no longer approved
      And the review is open again

  # Approval is superseded, never a barrier (see BDR-0013).
  Rule: Resubmitting changed content after approval clears approval and opens a new round

    Scenario: Agent revises an approved artifact
      Given the artifact is approved at round 2
      When the agent resubmits changed content
      Then the approval is cleared
      And the artifact advances to round 3

  Rule: Approve is the only terminal verdict

    Scenario: request_changes is not a terminal state
      Given the latest round has an unresolved fix_required comment
      When the reviewer submits a review with verdict "request_changes"
      Then the artifact remains under review
      And no terminal reject state is recorded
