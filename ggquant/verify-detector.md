# /verify-detector

Verify a single detector against its contract. Runs the detector's own unit
test suite and its lookahead probe in one step.

## Usage

```
/verify-detector <detector-name>
```

Example: `/verify-detector fvg`

## What it does

For the named detector:

1. **Run the unit test suite.** The detector's isolated tests — textbook
   pattern found, boundary case rejected, maturity index never precedes the
   formation's final bar, and any detector-specific cases.

2. **Run the lookahead probe.** Run the detector on a bar window, then re-run it
   on the same window with future bars appended. Assert the labels over the
   shared region are byte-identical. Any divergence means the detector reads the
   future — a hard fail.

3. **Report.** Print a pass/fail line for the unit suite and a pass/fail line
   for the lookahead probe. The detector is "verified" only if both pass.

## Why this exists

A detector bug and a strategy with no edge produce the same symptom — a bad
equity curve. Detectors must be proven correct in isolation, separate from any
strategy, or the honesty harness verdict means nothing. An unverified detector
in the registry is worse than a missing one: it silently poisons every setup
that composes it.

Run this every session that touches a detector, and before composing a detector
into any setup.
