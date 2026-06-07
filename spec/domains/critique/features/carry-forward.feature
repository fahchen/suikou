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

  # Re-anchor by mapping the line range through the round-to-round line diff: an
  # unchanged line moves to its new position, an edited or deleted line marks the
  # comment outdated rather than relocating it (see BDR-0017).
  Rule: A carried line-scoped comment re-anchors by diff mapping

    Scenario: An unchanged commented line moves to its new position
      Given an unresolved published line-scoped comment on round 1 anchored to the line "rate limit is 100 rps"
      And round 2 inserts new lines above that line but leaves it unchanged
      When the comment is carried forward onto round 2
      Then the comment's line-range anchor is mapped to the line's new position

    Scenario: An edited commented line marks the comment outdated
      Given an unresolved published line-scoped comment on round 1 anchored to the line "rate limit is 100 rps"
      And round 2 changes that line to "rate limit is 200 rps"
      When the comment is carried forward onto round 2
      Then the comment is marked outdated
      And the comment has no valid anchor on round 2
      And the comment is retained for the reviewer to relocate

    Scenario: A deleted commented line marks the comment outdated
      Given an unresolved published line-scoped comment on round 1 anchored to the line "rate limit is 100 rps"
      And round 2 no longer contains that line
      When the comment is carried forward onto round 2
      Then the comment is marked outdated
      And the comment has no valid anchor on round 2

  # The original anchor is frozen lineage: it is copied unchanged onto every
  # carried row so an outdated comment still reports where it began (see BDR-0017).
  Rule: A carried comment keeps its original anchor unchanged

    Scenario: Carrying forward preserves the original anchor through an outdated relocation
      Given an unresolved published line-scoped comment authored on round 1 from line 10 to line 12
      And round 2 changes those lines so the comment goes outdated
      When the comment is carried forward onto round 2
      Then the carried comment's original anchor is still a line range from line 10 to line 12
      And the carried comment's original round is still 1

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
