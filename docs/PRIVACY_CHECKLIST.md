# PRIVACY_CHECKLIST.md

**This is engineering-level analysis, not legal advice.** Get a real UK data protection
professional to review before public launch — this checklist tells you what to bring to
that review, not a substitute for it.

## What CareCircle actually stores
Names, emails, medication names/dosages, appointment/doctor details, free-text notes
that may reference health status.

## Why this matters legally
Medication information and health-referencing notes are **"special category data"**
under UK GDPR (confirmed directly against ICO guidance during this build). This is a
real, non-optional classification — not a choice you can avoid by calling it something
else.

## What this requires, per the ICO
- [ ] An **Article 6 lawful basis** (consent, for a consumer app like this)
- [ ] A separate **Article 9 condition** for the special category data specifically
      (explicit, specific, unbundled consent — not a general "I agree to terms" checkbox)
- [ ] Data minimisation — only collect what's needed for coordination, nothing extra
- [ ] A clear retention policy and deletion mechanism (account deletion already built)
- [ ] Consideration of a **DPIA** (Data Protection Impact Assessment) — the ICO
      indicates this is expected for likely-high-risk processing, which multi-user
      shared health-adjacent data plausibly is

## What's actually implemented right now
- [x] Account deletion (real, working, with sole-owner protection)
- [x] RLS enforces that only invited circle members can see any given circle's data
- [x] No advertising, no data sale, no third-party tracking
- [ ] **Not yet built:** an explicit, unbundled consent screen at signup — current
      signup has a general statement, not the specific Article 9-appropriate consent
      flow described above. This is a real gap, not hidden.
- [ ] **Not yet written:** an actual privacy policy document/page

## Before public launch, in order
1. Have a real privacy policy written (a solo founder can start from an ICO-provided
   template, but should still get it reviewed)
2. Build the specific, unbundled consent step at signup
3. Get the actual data flows reviewed by someone qualified, given the special-category
   classification

## What this checklist does NOT do
It does not make CareCircle GDPR compliant on its own. It identifies exactly what
compliance requires so a real review is efficient, not a blind starting point.
