# Dependency security advisories

`npm audit` reports **5 high-severity findings**. They come from **2
advisories** in two transitive packages, `node-forge` and `zod`, that are
reached only through the Expo command-line tool (`@expo/cli`). npm also
flags every package on the path to them, which is why the count is 5.

Last checked: 2026-10-24, with `expo` 58.0.19 and `@expo/cli` 58.1.15.

## The findings

| Package (installed) | Advisory | Patched version | How it is reached |
|---|---|---|---|
| `node-forge` 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) (CVE-2026-85393): RSA PKCS#1 v1.5 signature verification accepts extra nested `DigestAlgorithm` elements | None published (`<= 1.4.0` affected) | `expo` → `@expo/cli` → `node-forge`, and `@expo/cli` → `@expo/code-signing-certificates` → `node-forge` |
| `zod` 3.25.76 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (CVE-2023-54404): memory exhaustion while validating oversized constrained collections | 4.6.6 (a new major version) | `expo` → `@expo/cli` → `zod` |
| `@expo/code-signing-certificates` | Flagged because it depends on `node-forge` | – | `@expo/cli` |
| `@expo/cli` | Flagged because it depends on the packages above | – | `expo` |
| `expo` | Flagged because it depends on `@expo/cli` | – | Direct dependency |

## CLI tooling versus code shipped in the app

`expo` is a runtime dependency, but `@expo/cli` inside it is the tool that
runs **on the developer's machine or the CI runner**: `expo start`,
`expo export`, `expo run:android`. It is not part of the JavaScript bundle
that is installed on a phone or served to a browser.

- In `@expo/cli` 58.1.15, `node-forge` is used only by its code-signing
  helpers (`build/src/utils/codesigning.js`,
  `build/src/run/ios/codeSigning/Security.js`), and `zod` only by schemas of
  the development server's devtools plugins
  (`build/src/start/server/DevToolsPlugin.schema.js`,
  `createMCPDevToolsExtensionSchema.js`).
- No file in `src/`, `App.tsx` or `index.ts` imports either package.
- The exported bundles contain neither. On 2026-10-24 both
  `expo export --platform android` (Hermes bytecode, 1.9 MB) and
  `expo export --platform web` (0.5 MB) were searched for `node-forge`,
  `forge.pki`, `pkcs1`, `zod` and `ZodError`: no matches. Strings that are
  known to be in the app (`roombookingdev`, *Log ind med Microsoft*) were
  found, so the search itself worked.

The remaining exposure is therefore on development machines and CI runners
while the Expo CLI runs, for example if the dev server processed
attacker-controlled input. That is the reason these findings are tracked
rather than ignored.

## Why they are not fixed here

- `npm audit fix --force` proposes installing **`expo` 44.0.6**, a downgrade
  across 14 SDK versions. That would break the app and is not applied.
- `node-forge` has no patched release yet. The `zod` fix is in zod 4, while
  `@expo/cli` 58.1.15 declares `zod` `^3.25.76`; forcing zod 4 through an
  npm `overrides` entry would run the CLI against a major version it does
  not declare support for.
- The supported path is an `expo` patch release whose `@expo/cli` updates
  these dependencies. `npx expo-doctor` in CI flags new SDK 58 patch versions,
  and `npx expo install --fix` applies them.

## How to re-check

```bash
npm audit                      # the full report
npm ls node-forge zod --all    # the dependency paths
```

Update this document when the count or the dependency paths change.
