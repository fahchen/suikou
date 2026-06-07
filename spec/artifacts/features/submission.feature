@artifacts
Feature: Markdown artifact submission
  As an agent
  I want to submit a markdown artifact for review
  So that a human can review it and guide its refinement

  Background:
    Given Suikou is running locally

  Rule: A first submission creates a review at round 1

    Scenario: Agent submits a new markdown artifact
      Given the agent has a markdown plan titled "Auth rollout plan"
      When the agent submits the artifact
      Then a review is created at round 1
      And the submitted content is stored as the round 1 snapshot
      And the agent receives an artifact id

  Rule: Submissions must have a title and content

    Scenario: Empty content is rejected
      When the agent submits an artifact with empty content
      Then the submission is rejected
      And no review is created

    Scenario: Blank title is rejected
      When the agent submits an artifact with a blank title
      Then the submission is rejected
      And no review is created

  # Round bumping is automatic: the server compares the hash of the submitted
  # content against the latest snapshot. No normalization is applied and the
  # agent never declares a new round.
  Rule: Resubmitting changed content creates a new round

    Scenario: Revised content advances the round
      Given an artifact at round 1
      When the agent resubmits the same artifact id with different content
      Then the review advances to round 2
      And the new content is stored as the round 2 snapshot

    Scenario: Byte-identical content does not advance the round
      Given an artifact at round 1
      When the agent resubmits the same artifact id with byte-identical content
      Then the review stays at round 1
      And no new snapshot is stored

  Rule: An unknown artifact id is treated as a new artifact

    Scenario: Submitting with an unrecognised id creates a new artifact
      When the agent submits with an artifact id that does not exist
      Then a new review is created at round 1
      And the agent receives a freshly minted artifact id

  Rule: Any text content is accepted as markdown

    Scenario: Malformed markdown is still accepted
      When the agent submits content that is not well-formed markdown
      Then the submission is accepted
      And the content is stored as a markdown artifact
