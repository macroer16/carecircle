# COMPETITIVE_ANALYSIS.md

Built from real research conducted during this build — not fabricated. Sources cited
inline; anything not directly sourced is marked INFERRED.

## Direct competitors, confirmed real and active

**CircleCare** (Maple Ridge LLC) — the most directly overlapping competitor.
Confirmed via App Store/Google Play listings: family care circles, shared calendar,
medication tracking with photo-scan, activity feed, tasks, emergency info card,
1GB document storage, an AI assistant answering schedule/medication questions.
Pricing: free tier (1 circle, 2 caregivers), Premium $6.99/mo or $59.99/yr (up to 5
circles, unlimited members). **Only the circle creator pays — invited members are
free.** This exact pricing model was independently arrived at during this build
before this research was found, which is a real, if small, confidence signal.

**Caring Village** — calendar, medications, wellness journal, messaging, documents,
tasks, an AI assistant ("Julia") that summarizes updates.

**ianacare** — care calendar, appointments, meals, rides, care shifts, task
coordination.

*(Carely, CaringBridge, Medisafe were referenced in your source material but not
independently re-verified in this specific research pass — treat their listed
features as INFERRED from earlier research, not freshly confirmed here.)*

## Indirect competitor
**WhatsApp / group texts** — confirmed as the realistic default alternative every
one of these products explicitly markets against. This is very likely the actual
primary competitor for adoption, not another app.

## Competitive scorecard

| Area | CareCircle | Best competitor (CircleCare) | Winner |
|---|---|---|---|
| Onboarding | Simple, fast, minimal fields | Similar, native app onboarding | Similar |
| Time to value | Fast (create circle, add data immediately) | Fast | Similar |
| Family invitation | Link-based, 7-day expiry | Native app invite flow | Similar |
| Current-state understanding ("what changed") | Built, real per-item descriptions | Has an activity feed | Similar — untested which is clearer |
| Needs attention | Built (unassigned appointments) | Not confirmed to have this specific concept | **CareCircle, tentatively** |
| Who's handling what | Built | Has task assignment | Similar |
| Care handover | Not built | Not confirmed | Neither |
| Medications | Basic + reminders | Photo-scan OCR, adherence tracking | **CircleCare** |
| Appointments | Built, with assignment | Built | Similar |
| Emergency info card | Not built | Built (a genuinely good feature) | **CircleCare** |
| Mobile | PWA (no download friction) | Native iOS/Android | **CircleCare** for polish, CareCircle for install friction |
| Pricing | Not yet live | $6.99/mo, creator-pays model | CircleCare (proven, live) |
| AI features | None | Assistant for schedule/med questions | **CircleCare** |

## Honest assessment
CareCircle does **not** currently have a decisive feature advantage over CircleCare.
Where it's genuinely different: PWA architecture removes app-store friction, and the
"needs attention" framing is a slightly sharper coordination-focused angle than a
generic activity feed. Neither is proven to matter to real users yet — that's
exactly what real-user testing (see USER_TEST_PLAN.md) would determine.

## What this means honestly
The wedge described throughout this build ("current state of care in 10 seconds")
is a reasonable hypothesis, not yet a demonstrated advantage. CircleCare already
covers most of the same ground, is live, priced, and has real users. This is a
**populated, competitive market** — the earlier naming-collision finding
(HIGH risk) compounds this: not just a similar name, but a similar name attached
to a product that's also functionally very close.
