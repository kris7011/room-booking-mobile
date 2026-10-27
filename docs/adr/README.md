# Architecture Decision Records

Short records of decisions that shape the app. Each states the context, the
decision, the alternatives and the consequences.

ADR 0001 was **recorded retroactively** on 2026-10-24: the decision was made
earlier, and its rationale is reconstructed from the code, code comments and
README, not from notes written at the time.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-native-sign-in-and-token-storage.md) | Native sign-in as a public client with PKCE; refresh token in SecureStore | Accepted |
| [0002](0002-api-target-and-token-transport.md) | API chosen at bundle time; token transport enforced in the app | Accepted (PR #9 merged) |
| [0003](0003-safe-booking-retries.md) | Safe booking retries with an Idempotency-Key per booking operation | Proposed (Phase 5D, in review) |
| [0004](0004-organization-access-sync.md) | Synchronise organisation access at lifecycle moments, not by polling | Proposed (Phase 5D, in review) |
