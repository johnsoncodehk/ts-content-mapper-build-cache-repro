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

## `tsc -p` does not redirect content-mapped imports to a referenced project's output

`refs/b` references `refs/shared` (`composite`, `emitDeclarationOnly`) and includes only `main.ts`,
which imports `../shared/Shared.foo` and `../shared/util` (a plain `.ts` file):

```sh
./refs.sh
```

- `tsc -b refs/b` builds `refs/shared` (the one transform of `Shared.foo`), emits `Shared.d.foo.ts` and
  `util.d.ts`, and `refs/b` uses both declaration files with no errors from the import.
- `tsc -p refs/b`, with `refs/shared` already built, still resolves `Shared.foo` to the source file: it
  transforms it again and reports TS6059 and TS6307 on the import. `util.ts` resolves to `util.d.ts`.
- `tsc -p refs/b` with `refs/shared` not built reports TS6305 for `util.ts`, but nothing of the kind for
  `Shared.foo`, which it transforms and includes from source.

Expected: in `tsc -p`, an import of a content-mapped file that belongs to a referenced project resolves
to that project's `Shared.d.foo.ts` (or reports TS6305 when it has not been built), as plain `.ts` files
and as `tsc -b` already do.

Output with `typescript@7.1.0-beta`:

```
TS: Version 7.1.0-beta
-b refs/b
  refs/b/main.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.
  Shared.foo transforms: 1
  refs/shared/out: Shared.d.foo.ts tsconfig.tsbuildinfo util.d.ts 

With refs/shared built:
-p refs/b
  refs/b/main.ts(1,24): error TS6059: File 'refs/shared/Shared.foo' is not under 'rootDir' 'refs/b'. 'rootDir' is expected to contain all source files.
  refs/b/main.ts(1,24): error TS6307: File 'refs/shared/Shared.foo' is not listed within the file list of project 'refs/b/tsconfig.json'. Projects must list all files or use an 'include' pattern.
  refs/b/main.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.
  Shared.foo transforms: 1

With refs/shared not built:
-p refs/b
  refs/b/main.ts(1,24): error TS6059: File 'refs/shared/Shared.foo' is not under 'rootDir' 'refs/b'. 'rootDir' is expected to contain all source files.
  refs/b/main.ts(1,24): error TS6307: File 'refs/shared/Shared.foo' is not listed within the file list of project 'refs/b/tsconfig.json'. Projects must list all files or use an 'include' pattern.
  refs/b/main.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.
  refs/b/main.ts(3,19): error TS6305: Output file 'refs/shared/out/util.d.ts' has not been built from source file 'refs/shared/util.ts'.
  Shared.foo transforms: 1
```
