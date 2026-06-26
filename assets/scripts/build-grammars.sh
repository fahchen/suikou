#!/usr/bin/env bash
# Rebuild the Tree-sitter grammar wasms committed under src/treesitter/wasm with
# the local tree-sitter CLI, so they match the installed web-tree-sitter ABI.
# Prebuilt packages (tree-sitter-wasms) lag the ABI; building here keeps them in
# lockstep. Re-run after bumping web-tree-sitter or a grammar source dep.
set -euo pipefail
cd "$(dirname "$0")/.."

out=src/treesitter/wasm
build() { tree-sitter build --wasm "$1" --output "$out/$2"; }

build node_modules/tree-sitter-elixir tree-sitter-elixir.wasm
build node_modules/tree-sitter-typescript/typescript tree-sitter-typescript.wasm
build node_modules/tree-sitter-typescript/tsx tree-sitter-tsx.wasm
build node_modules/tree-sitter-javascript tree-sitter-javascript.wasm
build node_modules/tree-sitter-json tree-sitter-json.wasm
build node_modules/tree-sitter-python tree-sitter-python.wasm
build node_modules/tree-sitter-rust tree-sitter-rust.wasm
build node_modules/tree-sitter-go tree-sitter-go.wasm
build node_modules/tree-sitter-bash tree-sitter-bash.wasm
build node_modules/@tree-sitter-grammars/tree-sitter-yaml tree-sitter-yaml.wasm
build node_modules/tree-sitter-css tree-sitter-css.wasm
build node_modules/tree-sitter-html tree-sitter-html.wasm
build vendor/tree-sitter-gherkin tree-sitter-gherkin.wasm
build node_modules/tree-sitter-c tree-sitter-c.wasm
build node_modules/tree-sitter-cpp tree-sitter-cpp.wasm
build node_modules/tree-sitter-c-sharp tree-sitter-c_sharp.wasm
build node_modules/tree-sitter-java tree-sitter-java.wasm
build node_modules/tree-sitter-ruby tree-sitter-ruby.wasm
build node_modules/tree-sitter-php/php tree-sitter-php.wasm
build node_modules/tree-sitter-swift tree-sitter-swift.wasm
build node_modules/@tree-sitter-grammars/tree-sitter-kotlin tree-sitter-kotlin.wasm
build node_modules/@tree-sitter-grammars/tree-sitter-lua tree-sitter-lua.wasm
build node_modules/tree-sitter-scala tree-sitter-scala.wasm
build node_modules/@derekstride/tree-sitter-sql tree-sitter-sql.wasm
build node_modules/@tree-sitter-grammars/tree-sitter-toml tree-sitter-toml.wasm
