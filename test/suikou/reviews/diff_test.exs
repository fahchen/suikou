defmodule Suikou.Reviews.DiffTest do
  use Suikou.DataCase

  import Suikou.ReviewsFixtures

  alias Suikou.Reviews

  test "content changes between rounds render as a text diff" do
    %{artifact: artifact} = artifact_fixture(content: "alpha\nbeta\n")
    advance(artifact.id, "alpha\nxyzzy\n")

    assert {:ok, diff} = Reviews.round_diff(artifact.id, 1, 2)
    deleted = for {:del, seg} <- diff.text, into: "", do: seg
    inserted = for {:ins, seg} <- diff.text, into: "", do: seg
    assert deleted =~ "beta"
    assert inserted =~ "xyzzy"
    assert Enum.any?(diff.text, fn {op, _seg} -> op == :eq end)
  end

  test "critique transitions render alongside the text diff" do
    %{artifact: artifact, round: round1} = artifact_fixture(content: "line a\nline b\n")
    resolved = published_comment(round1.id, %{body: "to resolve"})
    carried = published_comment(round1.id, %{body: "stays open"})

    %{round: round2} = advance(artifact.id, "line a\nline c\n")
    {:ok, _resolved} = Reviews.resolve_comment(resolved.id)
    added = published_comment(round2.id, %{body: "new on r2"})

    assert {:ok, diff} = Reviews.round_diff(artifact.id, 1, 2)
    assert resolved.id in Enum.map(diff.resolved, & &1.id)
    assert added.id in Enum.map(diff.added, & &1.id)
    assert carried.id in Enum.map(diff.carried_forward, & &1.origin_id)
  end

  test "a change in latest verdict between rounds is rendered" do
    %{artifact: artifact, round: round1} = artifact_fixture()
    {:ok, _r1} = Reviews.submit_review(round1.id, :request_changes)
    %{round: round2} = advance(artifact.id, "changed\n")
    {:ok, _r2} = Reviews.submit_review(round2.id, :approve)

    assert {:ok, %{verdict_from: :request_changes, verdict_to: :approve}} =
             Reviews.round_diff(artifact.id, 1, 2)
  end

  test "identical content between rounds yields no insert or delete segments" do
    %{artifact: artifact, round: round1} = artifact_fixture(content: "same body\n")
    # force a round bump with different content, then restore identical text on r3
    advance(artifact.id, "interim\n")
    %{round: round3} = advance(artifact.id, "same body\n")

    assert {:ok, diff} = Reviews.round_diff(artifact.id, round1.number, round3.number)
    refute Enum.any?(diff.text, fn {op, _seg} -> op in [:ins, :del] end)
  end

  test "a diff with no critique changes reports empty transition lists" do
    %{artifact: artifact} = artifact_fixture(content: "a\n")
    advance(artifact.id, "b\n")

    assert {:ok, %{resolved: [], added: [], carried_forward: []}} =
             Reviews.round_diff(artifact.id, 1, 2)
  end

  test "an unchanged verdict reports the same value on both sides" do
    %{artifact: artifact, round: round1} = artifact_fixture()
    {:ok, _r1} = Reviews.submit_review(round1.id, :comment)
    %{round: round2} = advance(artifact.id, "changed\n")
    {:ok, _r2} = Reviews.submit_review(round2.id, :comment)

    assert {:ok, %{verdict_from: :comment, verdict_to: :comment}} =
             Reviews.round_diff(artifact.id, 1, 2)
  end

  test "an unknown round returns an error" do
    %{artifact: artifact} = artifact_fixture()
    assert {:error, :round_not_found} = Reviews.round_diff(artifact.id, 1, 9)
  end
end
