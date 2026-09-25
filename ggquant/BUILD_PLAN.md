# BUILD_PLAN.md — ggquant

Phased build sequence. **Build the spine before the breadth.** Complete one
vertical slice end-to-end before widening. Each phase is scoped as a discrete
unit of work — roughly one ggcoder session per phase.

Read `SPEC.md` for the design and `CLAUDE.md` for the constraints before
starting Phase 1.

---

## Phase 0 — Package scaffold

- Create the `ggquant` package in the monorepo, sibling to `gg-ai` / `ggarch`.
- TypeScript config consistent with the monorepo. Test runner wired up.
- Add `ggarch` as a dependency (for Stage 05).
- No logic yet. Just a package that builds and runs an empty test suite.

**Done when:** `ggquant` builds clean and an empty test run passes.

---

## Phase 1 — Definition Layer (Stage 01)

The keystone. Everything else references it.

- The `Setup` type and the seven block interfaces: Detection, Context filter,
  Entry trigger, Invalidation, Target, Position model, Metadata.
- The compile-or-reject validator: walks the setup tree, returns either a
  compiled setup or a list of typed rejections.
- The four reject rules: unbound parameter, discretion word (banned lexicon),
  underspecified reference, missing/unreachable invalidation.
- Tests: a fully-bound setup compiles; each reject rule fires on a crafted bad
  setup; the banned-lexicon check quotes the offending word.

**Done when:** a hand-written valid setup compiles, and four hand-written
invalid setups each reject for the right reason.

---

## Phase 2 — FVG detector (Stage 02)

The first and only detector for now. Build it fully to the contract.

**Before writing code:** open `docs/visuals/fvg-detector-instrument.html`. It is
the executable spec for this phase — the detector's behaviour, the maturity
index, and the lookahead probe are all shown running. The TypeScript detector
must match it.

- The detector contract types: the typed event object, the left-bounded window
  input, the maturity index.
- `fvg(window, min_size_atr, atr_period)` — pure function. ATR computed with no
  lookahead.
- Its own unit test suite: textbook gap found; boundary gap rejected; later-fill
  gap still detected at formation; maturity index never precedes bar 3.
- The lookahead probe as an automated test.
- Wire up the `/verify-detector` command (see `.gg/commands/verify-detector.md`).

**Done when:** `/verify-detector fvg` passes — unit suite green, lookahead probe
green.

---

## Phase 3 — Trajectory Simulator (Stage 03)

- Pure function: `(compiled setup, bars) → trade ledger`.
- Realistic fill model: spread, slippage, cost. Costs are not optional.
- Structured ledger output: entry, exit, R achieved, bars held, exit reason.
- Tests: a known setup over crafted bars produces the expected ledger;
  zero-cost vs realistic-cost runs differ as expected.

**Done when:** a compiled FVG setup runs over a fixture bar series and produces
a correct, deterministic trade ledger.

---

## Phase 4 — Honesty Harness (Stage 04)

The point of the instrument. All four tests.

- Out-of-sample holdout with walk-forward folds.
- Baseline comparator: random entries, matched session / hold / target R.
- Degrees-of-freedom audit: parameter sweep, plateau vs spike detection.
- Trade-order Monte Carlo: shuffle distribution of equity curves and drawdowns.
- The structured verdict object: pass/fail per test + promote/shelve.
- Build **correct single-threaded first.** Then add worker-thread parallelism
  for folds, shuffles, and Monte Carlo iterations.
- Content-hash caching of the pure layers so an incremental change reruns
  sub-second.

**Done when:** the FVG setup gets a full four-test verdict, and an incremental
parameter change reruns sub-second via the cache.

---

## Phase 5 — Decision Log integration (Stage 05)

- The typed `DecisionRecord` shape (see SPEC §6).
- Emit at all three points: setup compiled, parameter chosen, harness verdict.
- Wire emission into `ggarch`. No logging system built here — `ggarch` stores.
- Seed the package with `ADR-0001`..`0005` already in `docs/adr/`.

**Done when:** running a setup through the pipeline produces ADR records in
`ggarch`, and parameter choices are timestamped before their backtest result.

---

## Phase 6+ — Widen (only now)

- The second detector (order block, sweep, MSS, displacement — pick one),
  built to the exact same contract with its own test suite and probe.
- Each subsequent detector is the same five-clause contract.
- Optional, much later: the LLM philosophy-veto layer (separable, uses `gg-ai`).

**Do not start Phase 6 until Phases 1–5 are complete.** Building all detectors
first feels productive and proves nothing — the pipeline is the deliverable, not
the detector count.
