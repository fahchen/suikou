@critique
Feature: Critique persistence across rounds
  As a human reviewer
  I want my open critique to stay visible while the agent revises
  So that unaddressed feedback is never lost and never duplicated across rounds

  Background:
    Given Suikou is running locally
    And a markdown artifact reviewed at round 1 with published critique

  # A comment is one row across every round. Open feedback reaches later rounds by
  # derived visibility, not by copying: a comment is visible on round N when it was
  # authored on or before N and is not yet resolved as of N. A round advances when
  # the reviewer submits (see BDR-0018). Single-row model: see BDR-0023.
  Rule: An open comment stays visible on later rounds as the same row

    Scenario: An open comment is visible on round 2 as the same comment
      Given an unresolved published comment authored on round 1
      When the reviewer submits round 1 and the artifact advances to round 2
      Then the same comment row is visible on round 2
      And no duplicate comment row is created for round 2

  Rule: A resolved comment leaves the rounds after the one it was resolved on

    Scenario: A comment resolved at round 2 stays visible on round 2
      Given an unresolved published comment authored on round 1
      And the artifact has advanced to round 2
      When the reviewer marks the comment resolved
      Then the comment is still visible on round 2

    Scenario: A comment resolved at round 2 is not visible on round 3
      Given an unresolved published comment authored on round 1
      And the artifact has advanced to round 2
      And the reviewer marks the comment resolved at round 2
      When the artifact advances to round 3
      Then the comment is not visible on round 3

  Rule: Pending comments are not visible to the agent

    Scenario: An unpublished comment stays pending and editable until its review is submitted
      Given a pending comment on round 1
      When the agent exports the round 1 critique
      Then the pending comment is not included

  # A located comment's anchor is resolved live against the current round's
  # content: its quote is located in the snapshot on every render. An unchanged
  # line shows at its present position; an edited or deleted line leaves the
  # comment without a valid anchor and flags it outdated (see BDR-0017). No anchor
  # is re-mapped or copied when a round advances.
  Rule: An open line-scoped comment resolves its anchor live on the latest round

    Scenario: An unchanged commented line shows at its current position
      Given an unresolved published line-scoped comment anchored to the line "rate limit is 100 rps"
      And round 2 inserts new lines above that line but leaves it unchanged
      When the comment is viewed on round 2
      Then the comment's line-range anchor reports the line's current position

    Scenario: An edited commented line flags the comment outdated
      Given an unresolved published line-scoped comment anchored to the line "rate limit is 100 rps"
      And round 2 changes that line to "rate limit is 200 rps"
      When the comment is viewed on round 2
      Then the comment is flagged outdated
      And the comment has no valid anchor on round 2
      And the comment is retained for the reviewer to relocate

    Scenario: A deleted commented line flags the comment outdated
      Given an unresolved published line-scoped comment anchored to the line "rate limit is 100 rps"
      And round 2 no longer contains that line
      When the comment is viewed on round 2
      Then the comment is flagged outdated
      And the comment has no valid anchor on round 2

  # The round a comment was authored on is denormalized onto the one row as its
  # immutable authored round; it is the provenance badge, with no lineage chain to
  # walk (see BDR-0022, BDR-0023).
  Rule: A comment keeps its authored round across every round it spans

    Scenario: An open comment reports the round it was authored on after advancing
      Given an unresolved published comment authored on round 1
      When the artifact advances to round 2
      Then the comment still reports round 1 as its authored round

  # One row, one thread. Replies stay attached to the comment across rounds rather
  # than being stranded on a superseded per-round copy (see BDR-0023).
  Rule: A comment's thread continues on the same row across rounds

    Scenario: The discussion on an earlier round's comment continues after advancing
      Given an unresolved published comment raised on round 1
      When the artifact advances to round 2
      Then both the reviewer and the agent can reply to the comment on round 2
      And the replies are attached to the same comment's thread
