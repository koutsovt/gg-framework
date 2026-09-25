# ADR-0002: Detectors are pure functions

## Status

Accepted

## Context

A detector identifies geometric patterns in bar data (e.g. Fair Value Gaps).
Detectors must be testable in isolation, composable into setups, and provably
free of lookahead bias.

## Decision

Every detector is a pure function: `(bars: readonly Bar[], params) → readonly
Event[]`. No state, no I/O, no randomness. A detector at bar `t` reads bar `t`
and earlier — never `t+1`. The window is left-bounded so lookahead is
structurally impossible.

## Consequences

- Every detector ships with its own unit test suite AND a lookahead probe.
- Detectors label geometry; they never decide entry, target, or invalidation.
- The registry maps names to `DetectorFn` — adding a new detector is adding one
  pure function plus tests.
