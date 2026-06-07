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
