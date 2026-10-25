# TS 7.1: `tsc -b` transforms a shared content-mapped file once per project

TypeScript `7.1.0-beta` from npm (`typescript@7.1.0-beta`, package `gitHead` 3e9236361fa97a9e6c685f4833ac457ae2d8c50a, darwin-arm64).

`foo-mapper/` (installed as `node_modules/foo-mapper`) is a stub content mapper. It maps `.foo` files to `.ts` verbatim and appends every `openProject`/`transform` request to `$FOO_TRANSFORM_LOG`. Projects `a` and `b` both include `shared/Shared.foo` with the same mapper entry and compiler options, and the root `tsconfig.json` references both. Each `main.ts` imports `Shared.foo` and has one intentional type error. That proves each program sees the transformed content.

## Steps

```sh
npm install
./run.sh                 # uses node_modules/typescript/bin/tsc
TSC=/path/to/tsc ./run.sh
```

`run.sh` runs `tsc -b --runExternalCode` with no flag, then with `--singleThreaded`, `--builders 1` and `--builders 4`. It then runs `lsp.mjs`, which starts `tsc --lsp --stdio`, opens `a/main.ts` and `b/main.ts`, and pulls diagnostics for each. After each run it prints the number of `Shared.foo` transforms.

## Expected

`Shared.foo` is transformed once in every mode, because the file content, mapper, entry options and compiler options are identical.

## Actual

- `tsc --lsp`: 1 transform. Project `b` gets the result from the language server's `contentMappedParseCache`, so its mapper project is never even opened.
- `tsc -b` (all four variants): 2 transforms, one per project, all in the same mapper process. `internal/execute/build/compilerHost.go` `GetContentMappedSourceFiles` calls `contentmapper.TransformAndParse` directly and has no cross-project cache.

## Control: plain `.ts`

Both projects also include `shared/plain.ts`, a generated 1,400,000-line (about 55 MB) plain TypeScript file. Build mode caches only `.d.ts` and `.json` files across projects (`internal/execute/build/host.go` `GetSourceFile`), so plain `.ts` files are also parsed once per project. The control part of `run.sh` prints per-project parse time. In our run, project `a` took 1.242s and project `b` took 1.261s. Lib `.d.ts` files are already cached when `b` is built, so `b`'s time is almost entirely the re-parse of `plain.ts`. `tsc -p a` alone took 1.172s.

So plain `.ts` and content-mapped files behave the same way in build mode: both are redone once per project. The language server shares both kinds across projects, through `parseCache` and `contentMappedParseCache`. A content-mapped file costs more per project than a plain one, because it adds an IPC round trip and a transform in the external mapper on top of the parse. A plain `.ts` file only pays the parse. So this report asks only for build mode to cache content mapper transform results (text and mappings, not ASTs) across projects, keyed like the language server's `contentMappedParseCache`.
