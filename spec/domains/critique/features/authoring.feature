@critique
Feature: Authoring structured critique
  As a human reviewer
  I want to leave structured comments on a markdown artifact
  So that the agent can understand and act on my feedback

  Background:
    Given Suikou is running locally
    And a markdown artifact under review at round 1

  # Scope is one of line / file / review. file and review render the same while
  # an artifact holds a single file.
  Rule: A comment must declare a scope

    Scenario: A line-scoped comment anchors to a line range and captures the quoted source
      Given the reviewer selects lines 10 through 12 of the artifact
      When the reviewer adds a comment scoped to those lines
      Then the comment is stored with start line 10 and end line 12
      And the quoted text of lines 10 through 12 is captured on the comment

    Scenario: A single-line comment stores an equal start and end line
      Given the reviewer selects line 7 of the artifact
      When the reviewer adds a comment scoped to that line
      Then the comment is stored with start line 7 and end line 7

    Scenario: A review-scoped comment carries no line anchor
      When the reviewer adds a comment scoped to the whole review
      Then the comment is stored with review scope
      And the comment has no line anchor

  # A single dimension, not type + severity. Three agent-readable values so an
  # agent knows the expected action at a glance (see BDR-0005).
  Rule: A comment must declare a critique type

    Scenario Outline: Each comment carries one critique type
      When the reviewer adds a comment with type "<type>"
      Then the comment is stored with type "<type>"

      Examples:
        | type         |
        | fix_required |
        | needs_answer |
        | note         |

    Scenario: An unrecognised critique type is rejected
      When the reviewer adds a comment with type "blocking"
      Then the comment is rejected

  Rule: A comment must have a non-empty body

    Scenario: Empty body is rejected
      When the reviewer adds a comment with an empty body
      Then the comment is rejected
      And no comment is stored

  # New critique always lands on the version in front of the reviewer; earlier
  # rounds are frozen history (see BDR-0011) and open feedback reaches later
  # rounds via carry-forward (see BDR-0009), not by authoring onto old rounds.
  Rule: A new comment attaches to the latest round

    Scenario: A comment attaches to the current round
      Given the artifact is at round 2
      When the reviewer adds a comment
      Then the comment is attached to round 2

    Scenario: Commenting on a superseded round is rejected
      Given the artifact is at round 2
      When the reviewer tries to add a comment on round 1
      Then the comment is rejected
