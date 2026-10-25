#!/bin/sh
# Project references: refs/b references refs/shared (composite, emitDeclarationOnly) and imports
# a content-mapped file (Shared.foo) and a plain .ts file (util.ts) from it.
cd "$(dirname "$0")"
TSC=${TSC:-node_modules/typescript/bin/tsc}
export FOO_TRANSFORM_LOG="$PWD/transforms.log"
echo "TS: $(node "$TSC" -v)"

run() {
	: > "$FOO_TRANSFORM_LOG"
	echo "$*"
	node "$TSC" "$@" --runExternalCode --pretty false 2>&1 | sed "s|$PWD/||g; s/^/  /"
	echo "  Shared.foo transforms: $(grep -c '^transform Shared.foo' "$FOO_TRANSFORM_LOG" || true)"
	if [ -f refs/shared/Shared.d.foo.ts ]; then
		echo "  wrote refs/shared/Shared.d.foo.ts (next to the source, in the referenced project)"
		rm refs/shared/Shared.d.foo.ts
	fi
}

rm -rf refs/shared/out refs/b/out
run -b refs/b
echo "  refs/shared/out: $(cd refs/shared/out && ls | tr '\n' ' ')"
echo
echo "With refs/shared built:"
rm -rf refs/b/out
run -p refs/b
echo
echo "With refs/shared not built:"
rm -rf refs/shared/out refs/b/out
run -p refs/b
