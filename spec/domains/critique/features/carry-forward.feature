@critique
Feature: Critique carry-forward across rounds
  As a human reviewer
  I want my open critique to follow the artifact into the next round
  So that unaddressed feedback is never lost when the agent revises

  Background:
    Given Suikou is running locally
    And a markdown artifact reviewed at round 1 with published critique

  # Only published critique carries; a round advances when the agent resubmits
  # changed content (see BDR-0001). Carry-forward policy: see BDR-0009.
  Rule: Unresolved published comments carry forward to the new round

    Scenario: An open comment follows the artifact into round 2
      Given an unresolved published comment on round 1
      When the agent resubmits changed content and the artifact advances to round 2
      Then the comment is carried forward onto round 2

  Rule: Resolved comments stay on their original round

    Scenario: A resolved comment does not carry forward
      Given a resolved published comment on round 1
      When the artifact advances to round 2
      Then the comment remains on round 1
      And the comment is not carried forward onto round 2

  Rule: Pending comments do not carry forward

    Scenario: An unpublished comment stays on its round and remains editable
      Given a pending comment on round 1
      When the artifact advances to round 2
      Then the comment remains pending on round 1
      And the comment is not carried forward onto round 2

  # Re-anchor by exact match of the captured quote; no fuzzy matching, and a lost
  # quote marks the comment outdated rather than relocating it (see BDR-0010).
  Rule: A carried line-scoped comment re-anchors by exact quote match

    Scenario: The quoted text still exists and the comment re-anchors
      Given an unresolved published line-scoped comment on round 1 quoting "rate limit is 100 rps"
      And round 2 still contains the line "rate limit is 100 rps" at a new position
      When the comment is carried forward onto round 2
      Then the comment's line range is updated to the new position

    Scenario: The quoted text is gone and the comment is marked outdated
      Given an unresolved published line-scoped comment on round 1 quoting "rate limit is 100 rps"
      And round 2 no longer contains the line "rate limit is 100 rps"
      When the comment is carried forward onto round 2
      Then the comment is marked outdated
      And the comment has no valid line anchor on round 2
      And the comment is retained for the reviewer to relocate

  # Each round keeps its own immutable comment row; the carried row links back to
  # its origin (see BDR-0011).
  Rule: A carried comment is a new row linked to its origin

    Scenario: Carrying forward preserves the per-round history
      Given an unresolved published comment on round 1
      When the comment is carried forward onto round 2
      Then a new comment row exists on round 2
      And it links back to the round 1 comment as its origin
      And the round 1 comment row is unchanged

  # A round-1 comment stays live across rounds via its carried instance, so the
  # conversation continues on the later round rather than on frozen history.
  Rule: A carried comment's thread continues on the new round

    Scenario: The discussion on an earlier round's comment continues after advancing
      Given an unresolved published comment raised on round 1
      When the comment is carried forward onto round 2
      Then both the reviewer and the agent can reply to it on round 2
      And the replies are attached to the carried comment's thread
