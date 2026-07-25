@critique
Feature: Threaded discussion
  As a human reviewer and an agent
  I want to discuss a comment in a thread
  So that questions and clarifications can be exchanged without losing context

  Background:
    Given Suikou is running locally
    And a published comment on a markdown artifact

  Rule: The human reviewer can reply to a thread

    Scenario: Reviewer replies to a comment
      When the reviewer replies to the comment
      Then the reply is attached to the comment's thread
      And the reply is authored by the human reviewer

  # Several agents review one review at a time, so a reply records which agent
  # wrote it — the name the agent chose for itself, plus an optional icon. The
  # name is required, and the reviewer's own name is reserved (see BDR-0026).
  Rule: An agent replies under its own name

    Scenario: Agent replies to a comment thread
      When the agent replies to the comment through the reply API
      Then the reply is attached to the comment's thread
      And the reply is authored by the agent

    Scenario: A named agent's reply carries its name and icon
      When an agent named "Codex" with icon "🤖" replies to the comment
      Then the reply is attributed to "Codex"
      And the reply carries the icon "🤖"

    Scenario: An agent replies to another agent's comment
      Given an agent named "Codex" has authored a comment on the artifact
      When an agent named "Claude" replies to that comment
      Then the reply is attached to that comment's thread
      And the reply is attributed to "Claude"

    Scenario: A reply with no author name is rejected
      When an agent with no name replies to the comment
      Then the attempt is rejected

    Scenario: An agent may not reply under the reviewer's reserved name
      When an agent named "human" replies to the comment
      Then the attempt is rejected

  # Replies are gated by the comment's lifecycle. A human reply is created pending
  # and publishes on the next submit; an agent reply publishes immediately
  # (see BDR-0023).
  Rule: A reply's publication follows its author

    Scenario: A human reply is created pending
      When the reviewer replies to the comment
      Then the reply is pending

    Scenario: An agent reply publishes immediately
      When the agent replies to the comment through the reply API
      Then the reply is published

  # The agent reaches only open comments; a draft or resolved target is rejected.
  # The human may reply to a resolved comment, which reopens it so the human keeps
  # the last word before the comment leaves the agent's view (see BDR-0023).
  Rule: A human reply to a resolved comment reopens it

    Scenario: Replying to a resolved comment clears its resolution
      Given the comment has been resolved
      When the reviewer replies to the comment
      Then the comment is no longer resolved

    Scenario: The agent cannot reply to a resolved comment
      Given the comment has been resolved
      When the agent replies to the comment through the reply API
      Then the attempt is rejected
