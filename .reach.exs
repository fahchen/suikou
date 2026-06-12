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
    # The domain is cut into business contexts (Artifacts, Critique, Reviews,
    # Submissions, Export) plus a human read surface (Reads). Each context's
    # top-level module is its public API; its internal submodules are reachable
    # only from within that context. The shared kernel (`Suikou.Schemas.*` and
    # `Suikou.Rounds`) is intentionally unlisted, leaving it open to every
    # context as cross-domain read infrastructure.
    public: [
      "Suikou.Artifacts",
      "Suikou.Critique",
      "Suikou.Reviews",
      "Suikou.Submissions",
      "Suikou.Export",
      "Suikou.Reads"
    ],
    internal: [
      "Suikou.Artifacts.*",
      "Suikou.Critique.*",
      "Suikou.Reviews.*",
      "Suikou.Submissions.*",
      "Suikou.Export.*",
      "Suikou.Reads.*"
    ],
    internal_callers: [
      {"Suikou.Artifacts.*", ["Suikou.Artifacts", "Suikou.Artifacts.*"]},
      {"Suikou.Critique.*", ["Suikou.Critique", "Suikou.Critique.*"]},
      {"Suikou.Reviews.*", ["Suikou.Reviews", "Suikou.Reviews.*"]},
      {"Suikou.Submissions.*", ["Suikou.Submissions", "Suikou.Submissions.*"]},
      {"Suikou.Export.*", ["Suikou.Export", "Suikou.Export.*"]},
      {"Suikou.Reads.*", ["Suikou.Reads", "Suikou.Reads.*"]}
    ]
  ]
]
