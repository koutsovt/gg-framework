# ADR-0004: Four-test honesty harness

## Status

Accepted

## Context

A backtest that shows profit is not proof of edge. Overfitting, data snooping,
lucky trade ordering, and insufficient out-of-sample testing are the default
failure modes. The harness must be designed to kill false edges, not confirm
them.

## Decision

Every setup must pass all four tests to earn "promote":

1. **Out-of-sample holdout** — walk-forward folds; the setup must perform on data
   it was not fitted to.
2. **Baseline comparison** — random entries with matched parameters must do
   worse; the setup must beat chance.
3. **Degrees-of-freedom audit** — parameter sweeps must show broad plateaus, not
   sharp spikes; the edge must not depend on a lucky parameter.
4. **Trade-order Monte Carlo** — shuffling trade order must not destroy the
   result; the edge must not be a lucky sequence.

Speed comes from caching and parallelism. The four tests are fixed — dropping a
test or shrinking iterations to go faster is the instrument lying faster.

## Consequences

- Most setups will be shelved. That is the instrument working correctly.
- The "promote" recommendation is the strongest claim the package makes.
- No test can be skipped or weakened for performance reasons.
