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
| Expo SDK patch versions | **Open.** On 28 October `npx expo-doctor` fails one check: `expo` 58.0.19 (expects 58.0.20), `expo-auth-session` 58.0.14 (58.0.15), `expo-dev-client` 58.0.15 (58.0.16), `expo-web-browser` 58.0.6 (58.0.7). PR #29 aligns them with `npx expo install --fix`, separately from the fixes of this phase; it changes native modules, so the Samsung development build must be rebuilt and the sign-in checks repeated |
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
| Revoked session, cancelled sign-in, SecureStore contents, logs free of tokens | **Not run** (sign-in checklist steps 8, 3, 10, 11) |

## 4. Device tests still open

From [device-testing.md](device-testing.md), all on the Samsung development
build unless noted:

- Phase 5F checks F1–F4 for the fixes of this phase (#30, #31, #32). Those
  changes are JavaScript only, but once #29 is in the served tree the
  development build has to be rebuilt first.
- Phase 5C S4 (TalkBack on the sole-Owner explanation); S2 was not observable.
- Sign-in checklist steps 2, 3, 8, 10, 11, 12; step 9 has an owner report but no log.
- Work or school account; the first sign-in of a new, unregistered account.
- Invitation link opened on the device; the time-handling checklist.
- Everything again on a release build once one exists, against the hosted
  HTTPS API.

## 5. Repository and dependencies

| Item | Status |
|---|---|
| Mobile repository visibility | **Public**, on purpose: it is a portfolio project that reviewers can inspect. The 24 October audit found no secrets in history, and the Phase 5F commits were scanned with gitleaks before they were pushed (28 October) |
| Branch protection | **Decision.** `main` has no branch protection or ruleset, so a red check does not block a merge. For a public repository both are available on GitHub Free |
| Known advisories | `node-forge` and `zod` via `@expo/cli` (development tooling only; [security-advisories.md](security-advisories.md)). Do not run `npm audit fix --force`: it offers an old Expo |
| CI | Unit tests, type check, ESLint and Expo Doctor on every PR; Playwright E2E of the web build against the real API. Expo Doctor fails on `main` until the patch versions above are aligned |
