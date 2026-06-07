@rounds
Feature: Round diff
  As a human reviewer
  I want to see what changed between two rounds
  So that I can judge how the agent responded to my critique

  Background:
    Given Suikou is running locally
    And a markdown artifact with a round 1 and a round 2

  Rule: A round diff shows the snapshot text difference

    Scenario: Content changes between rounds are rendered as a text diff
      Given round 1 and round 2 have different content
      When the reviewer views the diff between round 1 and round 2
      Then the textual differences between the two snapshots are shown

  Rule: A round diff shows critique state changes

    Scenario: Critique transitions are rendered alongside the text diff
      Given a round 1 comment was resolved going into round 2
      And a new comment was added on round 2
      And an open round 1 comment was carried forward onto round 2
      When the reviewer views the diff between round 1 and round 2
      Then the resolved, newly added, and carried-forward comments are shown

  Rule: A round diff shows the verdict change

    Scenario: A change in the latest verdict between rounds is rendered
      Given round 1's latest review had verdict "request_changes"
      And round 2's latest review had verdict "approve"
      When the reviewer views the diff between round 1 and round 2
      Then the verdict change from "request_changes" to "approve" is shown
