# Engineering standards and project conventions

These rules apply to every implementation, refactor, test, review, commit, and PR.
Preserve the application's working architecture unless an intentional change is agreed.

## Language and clean code

- Use **English** for source code, identifiers, test names, comments, documentation, branches, commits, PRs, and code reviews. Preserve intentionally **Danish user-facing UI text** and other product translations.
- Prefer readable, self-explanatory names, small cohesive functions, focused components, and clear boundaries. Apply SOLID, DRY, KISS, and separation of concerns pragmatically; do not introduce unnecessary abstractions, frameworks, or dependencies.
- Choose the most appropriate architecture for this project's actual requirements, not the newest or most complicated pattern. Record significant decisions and trade-offs when changing the architecture.
- Keep unrelated changes out of focused PRs. Prefer Conventional Commit messages and descriptive English PR explanations.

## Expo SDK and React Native best practices

- This is an **Expo SDK 58 / React Native / TypeScript** app (verify exact versions in `package.json`). Prioritize mobile-first UX, responsiveness, accessibility, performance, and Android/iOS compatibility.
- Expo APIs change frequently. Before making version-sensitive changes, consult the **matching versioned Expo docs**: `https://docs.expo.dev/versions/v58.0.0/` (or the actual major version from `package.json`), and follow the linked current documentation. Do not rely on recalled APIs when they conflict with the installed SDK.
- Use `npx expo install <package>` for Expo-compatible dependencies; use the project's configured package manager (`npm` with `package-lock.json`) for non-Expo tooling. Do not add packages without a demonstrated need.
- The app currently uses **screen state / application screens**, not Expo Router. Preserve existing navigation and files in `src/screens/` and related components. Introduce Expo Router **only** after a deliberate architectural decision and migration plan; do not create `src/app/` routes by default.
- Follow the repository's actual `package.json` scripts. Do not assume an `expo lint` command or an ESLint setup is present.
- Native `ios/` and `android/` folders are generated when applicable. Use `app.json` and config plugins rather than editing generated files manually.
- Expo Go does not support all native modules or the app's Microsoft deep-link login. Use a development build for those flows.

## TypeScript and component structure

- Keep TypeScript strict. Prefer precise types, discriminated unions, typed boundaries, and exhaustive cases; avoid `any`, unnecessary non-null assertions, and unsafe casts.
- Keep React components presentation-focused; move networking to `src/api/`, authentication to `src/auth/`, organization orchestration to `src/organizations/`, and reusable UI to appropriate `src/components/` modules.
- Use React hooks correctly (stable dependencies, cleanup, avoiding stale async state updates). Avoid unnecessary rerenders and expensive work during render, especially on resource-constrained physical Android devices.
- Model explicit loading, empty, offline, auth-expired, validation, and error states. Provide accessible buttons, readable form errors, sensible keyboard behavior, and safe-area support.

## Security, multi-tenancy, and data preservation

- Only the authenticated .NET API decides identity, organization membership, and authorization. A UI visibility check is not authorization.
- Never log, commit, or expose tokens, private data, or secrets. Refresh tokens belong in SecureStore; access tokens should remain in memory. Never put secrets in `EXPO_PUBLIC_*` variables.
- Send bearer tokens to remote APIs over trusted HTTPS. The existing local `http://localhost:5003` allowance is for **development/USB ADB reverse only**; never weaken it for an arbitrary Wi-Fi IP.
- Keep bookings, rooms, and state scoped to the selected organization; clear user-dependent state on logout or identity changes.
- Do not destroy local files, reset databases, or erase another user's work. Keep cloud/local data migration explicit and verified; never imply that switching API URLs syncs data.

## Testing and delivery

- For behavior changes, add tests for success, failure, edge cases, security, and state transitions. Use the established `tests/` and `e2e/` structures.
- Before completion, run: `npm run typecheck`, `npm test`, and `npx expo-doctor`. For user-visible booking/API-flow changes also run `npm run test:e2e` where supported, and check a physical Android device when native behavior changes.
- Check the diff, installed dependencies, CI results, and docs. Do not claim a test passed until it did.
- Keep PRs focused and reviewable; document risk, validation, and limitations in English. Do not merge or deploy without explicit authorization.
- Preserve the option to use the same app with an HTTPS-hosted API or a locally hosted API; understand that Expo's `EXPO_PUBLIC_API_URL` is embedded at build/bundle time until an explicitly designed runtime selector is delivered.

## Technical understanding (part of the Definition of Done)

The repository owner must be able to explain, demonstrate, troubleshoot, and defend every important part of this app.

- When implementing or significantly changing a feature, give the owner a walkthrough: the problem solved, how it works, the files/components/functions involved, the data and request flow, why this design was chosen over alternatives, how authentication, token handling, validation, and security are handled, how it is tested, and its failure modes and limitations. Reference real code; never invent details or claim untested behavior is tested.
- Keep [`docs/PROJECT_WALKTHROUGH.md`](docs/PROJECT_WALKTHROUGH.md) accurate in the same PR as the change, using its status labels (Tested, Manual, In review, Not implemented).
- Record significant architectural decisions as short ADRs in [`docs/adr/`](docs/adr/README.md). Avoid documentation that nobody needs.
- Be transparent about AI assistance: keep `Co-Authored-By` trailers on AI-assisted commits, and never present AI-generated code as hand-written.
