# ADR-0001: Deterministic core with zero LLM dependency

## Status

Accepted

## Context

ggquant validates whether a trading setup has a real statistical edge. The core
pipeline (definition, detection, simulation, honesty harness) must produce
identical results on identical inputs. Any non-determinism — model calls, random
seeds without fixation, floating-point re-ordering — makes the verdict
meaningless.

## Decision

Stages 01–04 are pure deterministic code. No LLM calls, no `gg-ai` imports. All
randomness uses a seeded PRNG (`Rng` with xoshiro128\*\*). The optional
philosophy-veto layer (future) is separable and out of scope for the core.

## Consequences

- The harness verdict is reproducible: same setup + same bars = same verdict.
- Testing is straightforward — no mocks for model calls in the core.
- An LLM integration layer can be added later without touching the core.
