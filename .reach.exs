# Architecture & boundary policy enforced by `mix reach.check --arch` (see mix ci).
[
  layers: [
    # Composition root: the OTP bootstrap wires every layer (starts the web
    # endpoint, forwards config_change), so it sits above the domain/web split.
    # Listed first because layer classification is first-match.
    boot: "Suikou.Application",
    web: "SuikouWeb.*",
    domain: "Suikou.*"
  ],
  deps: [
    # Domain contexts must never depend on the web layer; Musubi stores live in
    # the web layer and consume domain contexts, never the reverse.
    forbidden: [
      {:domain, :web}
    ]
  ],
  boundaries: [
    # The Reviews context's top-level module is its public API; its internal
    # subdirectories (schemas/, plus the per-concern command/query modules) are
    # reachable only from within the context.
    public: ["Suikou.Reviews"],
    internal: ["Suikou.Reviews.*"],
    internal_callers: [
      {"Suikou.Reviews.*", ["Suikou.Reviews", "Suikou.Reviews.*"]}
    ]
  ]
]
