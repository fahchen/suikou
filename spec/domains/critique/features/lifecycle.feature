@critique
Feature: Critique lifecycle
  As a human reviewer
  I want to revise my critique before the agent sees it and resolve it afterward
  So that I stay in control of what feedback the agent receives and track what is addressed

  Background:
    Given Suikou is running locally
    And a markdown artifact under review at round 1

  Rule: A pending comment can be edited

    Scenario: Editing the body of a pending comment
      Given a pending comment on the artifact
      When the reviewer edits the comment body
      Then the comment reflects the new body

    Scenario: Changing the type of a pending comment
      Given a pending comment with type "note"
      When the reviewer changes the comment type to "fix_required"
      Then the comment is stored with type "fix_required"

  Rule: A pending comment can be deleted

    Scenario: Deleting a pending comment
      Given a pending comment on the artifact
      When the reviewer deletes the comment
      Then the comment no longer exists

  # Submitting a review publishes every pending comment across the whole review
  # — all files at once, not just the submitted file. The verdict and the round
  # advance stay per file: only the submitted round records a verdict and opens a
  # next round. The agent only ever sees the published set (see BDR-0008,
  # BDR-0019).
  Rule: Submitting a review publishes the review's pending comments

    Scenario: Submitting a review publishes every pending comment on the round
      Given two pending comments on round 1
      When the reviewer submits a review of round 1 with verdict "comment"
      Then both comments become published

    Scenario: Submitting one file publishes a sibling file's pending comments
      Given a second markdown artifact in the same review with a pending comment
      When the reviewer submits a review of round 1 with verdict "comment"
      Then the sibling file's pending comment becomes published
      And the sibling file stays on its current round

    Scenario: Pending comments are invisible to the agent until a review is submitted
      Given a pending comment on round 1
      When the agent exports the round 1 critique
      Then the pending comment is not included

  # A review records the disposition of the round it was submitted on (see BDR-0015).
  Rule: A submitted review records its verdict

    Scenario Outline: Each review carries one verdict
      Given a pending comment on round 1
      When the reviewer submits a review of round 1 with verdict "<verdict>"
      Then the review is recorded with verdict "<verdict>"

      Examples:
        | verdict         |
        | approve         |
        | request_changes |
        | comment         |

    Scenario: An unrecognised verdict is rejected
      When the reviewer submits a review of round 1 with verdict "merge"
      Then the review is rejected

  Rule: A published comment cannot be edited or deleted

    Scenario: Editing a published comment is rejected
      Given a published comment on the artifact
      When the reviewer edits the comment body
      Then the edit is rejected

    Scenario: Deleting a published comment is rejected
      Given a published comment on the artifact
      When the reviewer deletes the comment
      Then the deletion is rejected
      And the comment still exists

  # Resolution happens after the agent has responded in a later round, so it must
  # stay available after a review is submitted; the freeze covers content and
  # deletion only.
  Rule: A published comment can be resolved

    Scenario: Resolving a published comment records the round it was resolved at
      Given a published comment on round 1
      And the artifact has advanced to round 2
      When the reviewer marks the comment resolved
      Then the comment is resolved
      And the comment records round 2 as its resolved round
