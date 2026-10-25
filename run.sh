#!/bin/sh
# Counts how often TS 7.1 asks the content mapper to transform shared/Shared.foo, which both projects include.
cd "$(dirname "$0")"
TSC=${TSC:-node_modules/typescript/bin/tsc}
export FOO_TRANSFORM_LOG="$PWD/transforms.log"
echo "TS: $(node "$TSC" -v)"

# Control: a large plain .ts file that both projects also include (generated, not committed).
[ -f shared/plain.ts ] || node -e 'let s="";for(let i=0;i<1400000;i++)s+=`export const v${i}: number = ${i};\n`;require("fs").writeFileSync("shared/plain.ts",s)'

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

echo "control: parse time of plain .ts (tsc -b --singleThreaded --extendedDiagnostics; a, then b)"
rm -rf a/out b/out
node "$TSC" -b --runExternalCode --singleThreaded --extendedDiagnostics 2>/dev/null | grep -E '^(Files|Parse time):' | sed 's/^/  /'
echo "control: tsc -p a alone"
rm -rf a/out
node "$TSC" -p a --runExternalCode --extendedDiagnostics 2>/dev/null | grep -E '^Parse time:' | sed 's/^/  /'
