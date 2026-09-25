# ADR-0005: Decision Log emits to ggarch

## Status

Accepted

## Context

The single most important guard against curve-fitting is timestamping the
parameter rationale before the backtest result is seen. You cannot quietly
rationalise a number after seeing it win if the reasoning was already recorded.

## Decision

ggquant emits typed `DecisionRecord` objects at three points:

1. **Setup compiled** — the full setup, every bound parameter, and the thesis.
2. **Parameter chosen** — the value and rationale, emitted BEFORE the backtest.
3. **Harness verdict** — pass/fail per test, the numbers, and promote/shelve.

Storage is ggarch's responsibility. ggquant defines a `DecisionStore` interface
and ships an `InMemoryStore` for testing. When ggarch is built, it implements
`DecisionStore` and the records flow to persistent storage.

## Consequences

- No logging system is built in ggquant — ggarch is the system of record.
- The `DecisionStore` interface is the only integration point.
- Parameter rationale timestamps are structurally earlier than verdict timestamps.
