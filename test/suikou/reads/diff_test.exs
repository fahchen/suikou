defmodule Suikou.Reads.DiffTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Review

  test "content changes between rounds render as a text diff" do
    artifact = insert(:round, content: "alpha\nbeta\n").artifact
    advance(artifact.id, "alpha\nxyzzy\n")

    assert {:ok, diff} = Reads.round_diff(artifact.id, 0, 1)
    deleted = for {:del, seg} <- diff.text, into: "", do: seg
    inserted = for {:ins, seg} <- diff.text, into: "", do: seg
    assert deleted =~ "beta"
    assert inserted =~ "xyzzy"
    assert Enum.any?(diff.text, fn {op, _seg} -> op == :eq end)
  end

  test "critique transitions render alongside the text diff" do
    round1 = insert(:round, content: "line a\nline b\n")
    artifact = round1.artifact
    resolved = published_comment(round1.id, %{body: "to resolve"})
    carried = published_comment(round1.id, %{body: "stays open"})

    %{round: round2} = advance(artifact.id, "line a\nline c\n")
    {:ok, _resolved} = Critique.resolve_comment(resolved.id)
    added = published_comment(round2.id, %{body: "new on r2"})

    assert {:ok, diff} = Reads.round_diff(artifact.id, 0, 1)
    assert resolved.id in Enum.map(diff.resolved, & &1.id)
    assert added.id in Enum.map(diff.added, & &1.id)
    assert carried.id in Enum.map(diff.carried_forward, & &1.origin_id)
  end

  test "a change in latest verdict between rounds is rendered" do
    round1 = insert(:round)
    artifact = round1.artifact
    {:ok, %{next_round: round2}} = Review.submit_review(round1.id, :request_changes)
    {:ok, _r2} = Review.submit_review(round2.id, :approve)

    assert {:ok, %{verdict_from: :request_changes, verdict_to: :approve}} =
             Reads.round_diff(artifact.id, 0, 1)
  end

  test "identical content between rounds yields no insert or delete segments" do
    round1 = insert(:round, content: "same body\n")
    artifact = round1.artifact
    # force a round bump with different content, then restore identical text on r3
    advance(artifact.id, "interim\n")
    %{round: round3} = advance(artifact.id, "same body\n")

    assert {:ok, diff} = Reads.round_diff(artifact.id, round1.number, round3.number)
    refute Enum.any?(diff.text, fn {op, _seg} -> op in [:ins, :del] end)
  end

  test "a diff with no critique changes reports empty transition lists" do
    artifact = insert(:round, content: "a\n").artifact
    advance(artifact.id, "b\n")

    assert {:ok, %{resolved: [], added: [], carried_forward: []}} =
             Reads.round_diff(artifact.id, 0, 1)
  end

  test "an unchanged verdict reports the same value on both sides" do
    round1 = insert(:round)
    artifact = round1.artifact
    {:ok, _r1} = Review.submit_review(round1.id, :comment)
    %{round: round2} = advance(artifact.id, "changed\n")
    {:ok, _r2} = Review.submit_review(round2.id, :comment)

    assert {:ok, %{verdict_from: :comment, verdict_to: :comment}} =
             Reads.round_diff(artifact.id, 1, 2)
  end

  test "an unknown round returns an error" do
    artifact = insert(:round).artifact
    assert {:error, :round_not_found} = Reads.round_diff(artifact.id, 1, 9)
  end
end
