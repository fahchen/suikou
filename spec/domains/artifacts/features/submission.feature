@artifacts
Feature: Project boards and artifact creation
  As a human reviewer
  I want to register a project directory and start reviewing a file from it
  So that I control which artifacts enter review and when

  Background:
    Given Suikou is running locally

  # A project points at a directory on disk; the server scans it and lists its
  # files as candidate artifacts (see BDR-0018). MVP source is a local file;
  # other sources (e.g. a GitHub pull request) are deferred.
  Rule: A project is a directory whose files are candidate artifacts

    Scenario: Registering a project lists its files
      Given a directory containing markdown files
      When the reviewer registers it as a project
      Then the project lists those files as candidate artifacts

  # Creating an artifact is a human action: selecting a file reads its current
  # content from disk and persists round 0 in draft state (see BDR-0018). There
  # is no agent content submission.
  Rule: Selecting a file creates an artifact at round 0

    Scenario: Reviewer starts reviewing a file
      Given a project listing a file "auth-rollout-plan.md"
      When the reviewer selects the file to review
      Then an artifact is created at round 0
      And the file's content on disk is stored as the round 0 snapshot
      And round 0 is in draft state

    Scenario: An empty file cannot start a review
      Given a project listing an empty file
      When the reviewer selects the file to review
      Then no artifact is created

  # The agent edits the file on disk between rounds; the reviewer pulls those
  # edits into the current draft round by re-snapshotting (see BDR-0018).
  Rule: Re-snapshotting refreshes the draft round content

    Scenario: Reviewer pulls in the agent's edits
      Given an artifact whose current round is a draft
      And the agent has changed the file on disk
      When the reviewer re-snapshots the file
      Then the draft round's snapshot matches the file's current content on disk

    Scenario: Re-snapshotting unchanged content leaves the draft round as is
      Given an artifact whose current round is a draft
      And the file on disk is byte-identical to the draft round snapshot
      When the reviewer re-snapshots the file
      Then the draft round snapshot is unchanged

  Rule: Any text content is accepted as markdown

    Scenario: Malformed markdown is still accepted
      Given a project listing a file that is not well-formed markdown
      When the reviewer selects the file to review
      Then the artifact is created
      And the content is stored as a markdown artifact
