# Release readiness

What stands between the current app and an Android release, as of
28 October 2026 (Phase 5F). Each item says whether it is **done** (with its
evidence), **open**, or a **decision** the owner has to make. Nothing here has
been built, signed, published or deployed.

**Assessment: not release-ready.** The app works as a development build
against a local API, and its rules are covered by automated tests, but there
is no release build configuration, no release sign-in registration, no hosted
HTTPS API that has been tried with sign-in, and several device checks are
still open.

## 1. Android release build

| Item | Status |
|---|---|
| `eas.json` with a `production` profile (`.aab` for Google Play) and, if wanted, a `preview` profile (`.apk` for direct installation) | **Open.** The repository has no `eas.json`; see Expo's [eas.json reference](https://docs.expo.dev/build/eas-json/). `developmentClient: true` belongs only in the development profile |
| Release application ID | **Decision.** `app.json` has only the development package `io.github.kris7011.roombooking.dev`. A release package (for example without `.dev`) can be installed next to the development build |
| URL scheme for the sign-in redirect | **Decision.** The scheme is `roombookingdev`, and `NATIVE_REDIRECT_URI` in `src/auth/auth-config.ts` is `roombookingdev://auth`. A release with its own scheme needs that constant (and `app.json`) to vary per build, and a matching redirect URI in Entra (section 3) |
| Version and `versionCode` | **Open.** `app.json` has `version: 1.0.0` and no `android.versionCode`. Decide whether EAS or `app.json` owns the build number |
| Upload key and signing | **Open.** EAS can hold the upload keystore, or `eas credentials` can download it to a local `credentials.json` ([app credentials](https://docs.expo.dev/app-signing/app-credentials/)). The keystore must never be committed (`.gitignore` has `*.keystore`). Google Play App Signing keeps the app signing key, so a lost upload key can be reset |
| Expo SDK patch versions | **Done** (CI and local). On 28 October `npx expo-doctor` failed one check: `expo` 58.0.19 (expects 58.0.20), `expo-auth-session` 58.0.14 (58.0.15), `expo-dev-client` 58.0.15 (58.0.16), `expo-web-browser` 58.0.6 (58.0.7). PR #29 aligned them with `npx expo install --fix` and was merged the same day; Expo Doctor passes 20/20 on `main`. It changes native modules, so the Samsung development build had to be rebuilt and the sign-in checks repeated: **done** on 28 October from `main` `ccc8204`, installed as an update with the app's data kept; session restore and step 9 (sign-out, new sign-in) passed on it ([rebuild record](device-testing.md#rebuild-28-october-2026)) |
| Development-only code paths | **Done** (tested). `isDevelopmentBundle()` (`src/config/build.ts`) is false in a release bundle, which turns off the HTTP-to-loopback exception for tokens |
| iOS | **Not started.** Never built, on a simulator or a device |

## 2. HTTPS API configuration

| Item | Status |
|---|---|
| API address in the build | **Done** (design, ADR 0002). `EXPO_PUBLIC_API_URL` is inlined when the bundle is built, so an installed release can never switch servers. A release needs its HTTPS address at build time (an EAS profile `env`), not `.env.local` |
| Tokens over HTTPS only in a release bundle | **Done** (tested). `canSendBearerToken` in `src/api/http-client.ts`; HTTP to loopback or `10.0.2.2` only in a development bundle |
| Cleartext traffic | **Done by default.** On Android 9 and later `usesCleartextTraffic` defaults to `false` ([expo-build-properties](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/)); this app does not change it |
| Hosted HTTPS API tried with sign-in | **Not run** ([api-targets.md](api-targets.md)) |
| API in Production: no CORS, no Swagger, generic 500 problems, HTTPS redirection | **Done** in the API's integration tests (`ProductionDefaultsTests`, backend `main`). `UseHttpsRedirection` redirects only when the HTTPS port is known; behind a TLS-terminating proxy the proxy must enforce HTTPS |
| Anonymous demo mode off in production | **Done** in the API: it refuses to start with `LegacyApi:AllowAnonymous=true` outside Development and Testing |
| Database backup and restore for the hosted API | **Done** for local operation (backend `docs/local-portability.md`). A hosted database needs its own backup schedule and a tried restore before real data goes in |

## 3. Microsoft Entra sign-in

| Item | Status |
|---|---|
| Release redirect URI | **Open.** The mobile registration has `roombookingdev://auth` for the development build only ([entra-login.md](entra-login.md)). Add the release scheme's URI under *Mobile and desktop applications* (or a second registration) |
| Public client, no secret | **Done.** The app uses PKCE and never has a client secret; `EXPO_PUBLIC_ENTRA_*` values are identifiers, not secrets |
| Personal and work accounts | **Partly verified.** Both registrations must accept personal accounts for `/common` (the cause of issue #16 was an API registration limited to organisations). Personal account: passed on the Samsung. Work or school account: **not run** (no such account) |
| API registration and scope | **Open for the hosted API.** The hosted API needs `Entra__ApiClientId` (and the matching `access_as_user` scope in the app's build). Consent for a work tenant: sign-in checklist step 2, **not run** |
| SecureStore contents, logs free of tokens | **Passed** on the development build, 28 October (sign-in checklist steps 10 and 11; step 11 for steps 5, 7 and 9, [details](device-testing.md#sign-in-on-the-rebuilt-build-28-october)). A release build needs them again |
| Revoked session, cancelled sign-in | **Not run** (sign-in checklist steps 8 and 3) |

## 4. Device tests still open

From [device-testing.md](device-testing.md), all on the Samsung development
build unless noted:

- Phase 5C S2 was not observable (S4, TalkBack on the sole-Owner explanation,
  passed on 29 October by owner report).
- Sign-in checklist steps 2, 3, 8, 12.
- Work or school account; the first sign-in of a new, unregistered account.
- Invitation link opened on the device; the time-handling checklist.
- Everything again on a release build once one exists, against the hosted
  HTTPS API.

Done on 28 October: the rebuild from `main` with the SDK 58 patch update
(#29), Phase 5F checks F1–F4 for #30, #31 and #32, and sign-in steps 9, 10
and 11 on that build ([results](device-testing.md#phase-5f-f1f4)).

## 5. Repository and dependencies

| Item | Status |
|---|---|
| Mobile repository visibility | **Public**, on purpose: it is a portfolio project that reviewers can inspect. The 24 October audit found no secrets in history, and the Phase 5F commits were scanned with gitleaks before they were pushed (28 October) |
| Branch protection | **Decision.** `main` has no branch protection or ruleset, so a red check does not block a merge. For a public repository both are available on GitHub Free |
| Known advisories | PR #29 (merged) resolved the `node-forge` finding. `zod` via `@expo/cli` and `deepmerge` via `@expo/config` remain (development tooling only; [security-advisories.md](security-advisories.md), updated in #29). Do not run `npm audit fix --force`: it offers an old Expo |
| CI | Unit tests, type check, ESLint and Expo Doctor on every PR; Playwright E2E of the web build against the real API. All of them pass on `main` after the Phase 5F merges (section 6). The checks are not required for a merge (see branch protection above) |

## 6. Phase 5F merge and verification

The owner approved the merges, in this order: #29, #28, #30, #31, #32, #33.
Each pull request was merged with a merge commit (branches kept). Before
each merge after #29, its branch was updated with the `main` that the
previous merge produced, and the update was pushed so the PR checks ran
again on that exact head. The merge itself was guarded by the tested head
SHA (`gh pr merge --merge --match-head-commit <sha>`).

Re-running an old workflow uses its original `GITHUB_SHA` and `GITHUB_REF`
([GitHub documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)),
so an old run does not test the dependency update from #29. No run from
before an update was re-run to stand in for the updated code: every result
below comes from a run on that exact head.

One re-run *was* used, on the same code: #33's E2E run on its final head
`d678adb` failed in its first attempt, only in `e2e/specs/search.spec.ts:35`
(the day chip scrolled into view; the 10 s poll timed out), and passed when
re-run on the unchanged head
([run 40670875590](https://github.com/kris7011/room-booking-mobile/actions/runs/40670875590)).
The same test had failed the same way earlier that day on a previous #32
head (`f4e012a`), also passing on a re-run. Every head in the table, and
`main` after the merge of #33 (`ccc8204`, CI and E2E on push), passed in
the first attempt. A passing re-run does not explain or fix the intermittent
failure; it was tracked as
[issue #34](https://github.com/kris7011/room-booking-mobile/issues/34), whose
cause was found, fixed (PR #36) and closed on 28 October with the evidence in
the [walkthrough](PROJECT_WALKTHROUGH.md#11-known-limitations).
(The wording first merged with #33, "No re-run was used as evidence", was
wrong on this point and was corrected here.)

Results on 28 October 2026: CI on GitHub and, separately, locally on the
same head (Windows, Node 24; E2E against backend `main` `91349f0` on a
temporary SQLite database). In every row TypeScript and ESLint passed.

| PR | Tested head | Unit tests | Expo Doctor | Playwright E2E | Merge commit |
|---|---|---|---|---|---|
| [#29](https://github.com/kris7011/room-booking-mobile/pull/29) Expo SDK 58 patches | `da12ceb` | 439 passed | 20/20 | 37 passed | `5dbf090` |
| [#28](https://github.com/kris7011/room-booking-mobile/pull/28) Phase 5E device results | `a4cc761` | 439 passed | 20/20 | 37 passed | `5dfc1fa` |
| [#30](https://github.com/kris7011/room-booking-mobile/pull/30) no request while restoring | `36909ca` | 447 passed | 20/20 | 37 passed | `3a705e9` |
| [#31](https://github.com/kris7011/room-booking-mobile/pull/31) disabled account status | `adb96cd` | 452 passed | 20/20 | 37 passed | `821c91f` |
| [#32](https://github.com/kris7011/room-booking-mobile/pull/32) messages per platform, once | `e380cd4` | 458 passed | 20/20 | 37 passed | `4650ffb` |

#29 was already based on `main` and its checks had run on `da12ceb`, so it
was merged without an update (local results from before the merge). #33
(this document) changes documentation only; its own checks ran on its final
head before it was merged (E2E after the re-run described above).

After the merges, on 28 October: the Samsung development build was rebuilt
from `main` `ccc8204` and installed as an update, and F1–F4 and sign-in
steps 9, 10 and 11 passed on it
([rebuild](device-testing.md#rebuild-28-october-2026),
[results](device-testing.md#phase-5f-f1f4)).
