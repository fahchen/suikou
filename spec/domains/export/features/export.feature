@export
Feature: Critique export
  As an agent
  I want to read the human's published critique
  So that I can act on the feedback

  Background:
    Given Suikou is running locally
    And a markdown artifact reviewed across several rounds

  # Export is self-contained and reflects only the latest round (see BDR-0014).
  Rule: Export returns the latest round's published critique

    Scenario: Published comments on the latest round are exported
      Given the latest round has published comments, some resolved and some open
      When the agent exports the artifact
      Then all published comments on the latest round are included
      And resolved and open comments are both present

    Scenario: Pending comments are never exported
      Given the latest round has a pending comment
      When the agent exports the artifact
      Then the pending comment is not included

    Scenario: Earlier rounds' critique is not exported
      Given round 1 had published comments
      And the artifact is now at round 2
      When the agent exports the artifact
      Then only round 2's critique is included

  Rule: Export is self-contained

    Scenario: The latest snapshot content travels with the critique
      When the agent exports the artifact
      Then the latest round's snapshot content is included

  Rule: Export includes thread replies

    Scenario: A comment's replies travel with it
      Given a published comment with a human reply and an agent reply
      When the agent exports the artifact
      Then the comment's replies are included

  Rule: A still-open comment whose anchor moved is exported flagged outdated

    Scenario: An outdated comment exports without a valid line anchor
      Given a still-open line-scoped comment whose anchored line was changed in a later round
      When the agent exports the artifact
      Then the comment is included
      And it is flagged outdated
      And it has no valid line anchor

  Rule: Export is read-only

    Scenario: Exporting does not change any state
      Given the latest round has published comments
      When the agent exports the artifact twice
      Then no comment changes state
      And the critique is unchanged between the two exports
