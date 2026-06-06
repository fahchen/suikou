# Add false-positive Dialyzer warnings here.
#
# Each entry can be a regex, a `{file, warning_type}` tuple, or
# `{file, warning_type, line}` — see https://hexdocs.pm/dialyxir for the
# full grammar.
#
# Example (OTP 28 MapSet opaque-type false positive):
#   ~r/call_with(out)?_opaque.*opaque term/,
[
  # Phoenix.Router emits a spurious pattern_match warning under
  # OTP 29 / Elixir 1.20; the offending clause lives in the dep, not our code.
  {"deps/phoenix/lib/phoenix/router.ex", :pattern_match}
]
