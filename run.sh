#!/bin/sh
# Counts how often TS 7.1 asks the content mapper to transform shared/Shared.foo, which both projects include.
cd "$(dirname "$0")"
TSC=${TSC:-node_modules/typescript/bin/tsc}
export FOO_TRANSFORM_LOG="$PWD/transforms.log"
echo "TS: $(node "$TSC" -v)"

count() {
	echo "  Shared.foo transforms: $(grep -c '^transform Shared.foo' "$FOO_TRANSFORM_LOG" || true)"
	sed 's/^/    /' "$FOO_TRANSFORM_LOG"
}

for flags in "" "--singleThreaded" "--builders 1" "--builders 4"; do
	rm -rf a/out b/out; : > "$FOO_TRANSFORM_LOG"
	echo "tsc -b --runExternalCode $flags"
	node "$TSC" -b --runExternalCode $flags || true
	count
done

: > "$FOO_TRANSFORM_LOG"
echo "tsc --lsp (open a/main.ts, then b/main.ts, pull diagnostics)"
node lsp.mjs "$TSC" 2>/dev/null
count
