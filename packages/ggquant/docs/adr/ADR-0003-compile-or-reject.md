# ADR-0003: Definition Layer compile-or-reject

## Status

Accepted

## Context

A trading setup must be fully specified before it can be backtested. Vague
parameters ("a strong gap"), unbound ranges ("0.3–0.7"), and missing invalidation
logic produce untestable setups that poison the harness verdict.

## Decision

The Definition Layer validates a `Setup` against four rejection rules:

1. **Unbound parameter** — empty params, ranges instead of values.
2. **Discretion word** — banned lexicon (`strong`, `clean`, `obvious`, etc.).
3. **Underspecified reference** — vague references (`the killzone`, `the zone`).
4. **Missing/unreachable invalidation** — no stop, zero time-stop, or unreachable
   targets.

A setup either compiles to a `CompiledSetup` or returns typed `Rejection[]`.
There is no "compile with warnings" — it is binary.

## Consequences

- The banned-lexicon check is intentionally dumb. The friction is the feature.
- Every field in a compiled setup is fully bound and machine-readable.
- The simulator can trust that a `CompiledSetup` is well-formed.
