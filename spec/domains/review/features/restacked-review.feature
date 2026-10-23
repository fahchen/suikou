@review
Feature: Restacked review
  As a human reviewer
  I want an agent to re-cut a branch's change into small, ordered commits
  So that I can review the branch one coherent step at a time

  Background:
    Given Suikou is running locally
    And a git-diff review of "main..feat"

  # The review stays a review of the source branch. A review stack is a second
  # way to read the same change: a branch the agent cuts from the source, one
  # behaviour per commit, ordered by dependency (see BDR-0028). Suikou never
  # restacks; it only verifies that the stack carries exactly the source change.
  Rule: A review stack carries exactly the source change

    Scenario: Attaching a stack whose tip tree matches the source is accepted
      Given a branch "feat-review" that starts from the merge-base of "main" and "feat"
      And "feat-review"'s tip tree equals "feat"'s tip tree
      When the agent attaches "feat-review" as the review's stack
      Then the review has the stack "feat-review"

    Scenario: Creating a diff review with a stack attaches it
      Given a branch "feat-review" equivalent to "feat"
      When the agent creates a git-diff review of "main..feat" with the stack "feat-review"
      Then the review has the stack "feat-review"

    Scenario: A stack that drops or adds changes is rejected
      Given "feat-review"'s tip tree differs from "feat"'s tip tree
      When the agent attaches "feat-review" as the review's stack
      Then the stack is rejected
      And the rejection lists the paths that differ

    Scenario: A stack on a different base is rejected
      Given "feat-review" does not start from the merge-base of "main" and "feat"
      When the agent attaches "feat-review" as the review's stack
      Then the stack is rejected

    Scenario: A file-selection review cannot take a stack
      Given a file-selection review
      When the agent attaches a stack to it
      Then the stack is rejected

  # Fixes land on the source branch first, then the agent cherry-picks them onto
  # the stack, where they become new steps at its end (see BDR-0028).
  Rule: A stack out of sync with its source warns but stays reviewable

    Scenario: The source moves after the stack was attached
      Given the review has the stack "feat-review"
      When a new commit lands on "feat"
      Then the review reports its stack as out of sync
      And the stack's steps stay readable and commentable

    Scenario: Cherry-picking the fix onto the stack restores sync
      Given the review's stack is out of sync with "feat"
      When the agent cherry-picks the new commit onto "feat-review"
      Then the review reports its stack as in sync
      And the cherry-picked commit is the stack's last step

  Rule: The reviewer reads a stacked review either by source or by step

    Scenario: A stacked review opens in the stack view
      Given the review has a stack of 5 commits
      When the reviewer opens the review
      Then the stack view is shown
      And the first unread step is shown with its full commit message

    Scenario: A step shows only its own commit's change
      Given the reviewer is on step 1 of 5
      When the reviewer steps to the next step
      Then only step 2's patch is shown

    Scenario: Switching to the source view shows the branch diff
      Given the reviewer is in the stack view
      When the reviewer switches to the source view
      Then the full "main...feat" diff is shown

  # Comments carry no commit, exactly as on any diff review (see BDR-0024): on a
  # step change they re-anchor by quote, and those that do not locate in the
  # step's patch surface in the stranded band.
  Rule: Comments re-anchor across steps by quote

    Scenario: A comment whose quote is absent from the current step is stranded
      Given a comment authored on step 2
      And its quote does not appear in step 3's patch
      When the reviewer steps to step 3
      Then the comment is shown in the stranded band
