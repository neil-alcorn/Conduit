<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/concept/vision-and-architecture.md
# description: Repo-native summary of the concept document for communication, architecture, and onboarding.
# owner:       BOTH
# update:      Update when the product narrative or architecture intent changes.
# schema:      none
# last_update: 2026-04-04
# ─────────────────────────────────────────────────────────────────────
-->

# Vision And Architecture

## What The Concept Document Is For

The concept document is primarily a communication and architecture-intent document.

It is the best source for:

- mission
- design principles
- terminology
- why CONDUIT exists
- why human review moves upstream
- why context, security, and audience impact are structural concerns

## Still Accurate

- the mission is still aligned with the current repo direction
- the design principles still fit the implemented architecture
- the core primitives are still right:
  - Information Highways
  - Work Type Directives
  - Convoys and Work Streams
  - Gate Sync
  - Eisenhower Initiative
- the people-first framing is still important and should remain part of future communication
- the three-repo model is still the right long-term architecture

## What Has Evolved Since The Document

- the repo now has more explicit security enforcement than the concept doc alone implies
- `conduit-core` is now real and has a stronger shared-contract surface
- `conduit-app` is still intentionally deferred
- some command surfaces are implemented as guarded scaffolds rather than full workflow engines yet

## Best Use Going Forward

Use the concept document when you need to:

- explain CONDUIT to leadership or partners
- onboard a developer to the “why”
- justify architectural choices
- preserve consistent vocabulary

Use repo-native docs when you need to:

- understand what is implemented right now
- understand security boundaries
- hand work to the next engineer or agent
- know what is still missing

## Recommendation

Yes, the concept doc should be treated as the communication document.

It is still valuable and should be kept.

The markdown docs in this repo should be treated as the operational companion set to that concept document.
