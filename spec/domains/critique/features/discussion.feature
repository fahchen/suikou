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

  # The agent never authors top-level comments and never pushes critique, but it
  # may reply to an existing thread through a dedicated reply API that is
  # distinct from comment authoring. This refines BDR-0003 (see BDR-0007).
  Rule: The agent replies through the dedicated reply API

    Scenario: Agent replies to a comment thread
      When the agent replies to the comment through the reply API
      Then the reply is attached to the comment's thread
      And the reply is authored by the agent

    Scenario: The agent cannot author a top-level comment
      When the agent attempts to author a top-level comment
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
