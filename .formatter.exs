[
  import_deps: [:ecto, :ecto_sql, :ecto_typed_schema, :phoenix, :typed_structor],
  subdirectories: ["priv/*/migrations"],
  inputs: ["*.{ex,exs}", "{config,lib,test}/**/*.{ex,exs}", "priv/*/seeds.exs"]
]
