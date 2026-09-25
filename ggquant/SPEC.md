# ggquant — Design Specification

> An instrument for deciding whether an ICT trading setup has a real edge,
> or is hindsight pattern-matching. It is **not** a strategy, **not** a bot,
> and **not** an execution system. Its output is a *verdict*, not a return number.

---

## 0. Purpose and non-goals

### What this is

`ggquant` is a deterministic pipeline that takes a precisely-defined trading
setup and answers one question: **is there an edge here, or am I narrating
charts?** It is designed to make that answer hard to fake.

The core insight driving every design decision: a strategy that returns 40% but
collapses out-of-sample is a **fail**; a strategy that returns 8% on a broad
parameter plateau and survives a holdout is a **pass**. The instrument measures
*fragility*, not profit.

### What this is NOT

- **Not a strategy.** It is the harness around one. It cannot create an edge
  that does not exist; it can only reveal whether one is present.
- **Not a live trading bot.** There is no order-execution path. The instrument
  validates setups on historical data. Live execution is a separate system with
  separate risk, deliberately out of scope.
- **Not a TradingView replacement.** TradingView is used for charting and visual
  detector cross-checks only — see §8.
- **Not an auto-tuner of the edge.** See §7 on the execution-vs-edge split.

### The honesty principle

Automating ICT *removes the discretionary judgment* a human ICT trader is quietly
relying on. A human skips ambiguous setups without noticing; an algorithm takes
every setup that matches the rules. So the first thing this instrument does is
**expose whether the edge was ever in the rules or only in the discretion.**
That is a feature. Most setups will fail. Failing cheaply on data is the point.

---

## 1. The five-stage pipeline

```
  Stage 01            Stage 02           Stage 03          Stage 04           Stage 05
┌───────────┐      ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│ Definition │ ───▶ │  Detector  │──▶ │ Trajectory │──▶ │  Honesty   │──▶ │  Decision  │
│   Layer    │      │  Registry  │    │ Simulator  │    │  Harness   │    │    Log     │
└───────────┘      └────────────┘    └────────────┘    └────────────┘    └────────────┘
 compile-or-       pure-function      trade ledger      4-test verdict     ADR records
 reject setups     pattern library    with costs        (fragility)        via ggarch
```

Each stage is described below. Stages 01–04 are **pure deterministic code with
zero LLM dependency**. Stage 05 emits records to `ggarch`.

---

## 2. Stage 01 — The Definition Layer

The keystone. This is where ICT either becomes falsifiable or quietly stays
narration.

**Design principle:** a field compiles only if two different people, handed the
same bars, would produce the identical label. Anything that needs judgment to
resolve is a rejection, not a default.

### The seven required blocks

A `Setup` is a typed object. Every field must be fully bound — no undefined free
parameters.

1. **Detection** — what pattern arms the setup. A reference to a registered
   detector plus its parameters fully specified, e.g.
   `fvg(min_size_atr: 0.5, atr_period: 3, direction: bullish)`.

2. **Context filter** — conditions that must hold for the detection to count:
   session window with explicit numeric edges and timezone
   (`London: 07:00–10:00, Europe/London` — never "London killzone"), required
   higher-timeframe state, day-of-week filter. Each is a boolean function of data.

3. **Entry trigger** — the exact event converting an armed setup into a
   position: `limit at FVG midpoint`, or `market on close of confirmation candle`.
   Must name the price and the moment.

4. **Invalidation** — where the setup is wrong: a price level derived by rule,
   plus a time-stop (`invalid if not filled within N bars`). No setup without an
   invalidation — it is also the stop.

5. **Target** — exit logic by rule: fixed R multiple, opposing liquidity level,
   or partial-scale ladder. Each level computed, not chosen.

6. **Position model** — risk per trade as a fixed fraction; how size derives
   from the stop distance. Bound so the simulator can compute it.

7. **Metadata** — setup name, version, author, and a free-text **thesis** field:
   why this should have an edge. Not executed, but required — it is the
   hypothesis the honesty harness will try to kill, and it is logged (Stage 05)
   *before* testing.

### The four compile-or-reject rules

The compiler walks the setup tree and **rejects** on four fault classes:

- **Unbound parameter.** Any detector parameter left as a range, a default, or
  absent → reject. You must commit to a number. (Sweeping that number is the
  degrees-of-freedom audit's job — but you sweep an *explicit* value.)

- **Discretion words.** Every field is scanned against a banned lexicon —
  "strong", "clean", "significant", "obvious", "clear", "quality", "looks". A
  hit → reject, with the offending word quoted. Intentionally dumb; it will
  produce occasional false positives. **Keep it.** The friction is the feature.

- **Underspecified reference.** "The killzone", "the swing high", "the recent
  low" — any reference that does not resolve to a computed value → reject until
  it is a function (`swing high = highest bar in ±k window`).

- **Missing invalidation / unreachable logic.** No invalidation block → reject.
  Target that can never trigger before invalidation → reject. Entry that can
  fire after its own invalidation → reject.

A setup that passes is one where every field is a bound value or a named pure
function — meaning the simulator gets the same trade ledger every run, on any
machine. **A strategy that cannot compile cannot be wrong, and a strategy that
cannot be wrong was never a strategy.**

---

## 3. Stage 02 — The Detector Registry

The library of pure functions the Definition Layer points into.

**Governing rule:** a detector reports *what is on the chart*, never *what to do
about it*. It labels; it does not decide. Entry, target and invalidation live in
the setup. Keeping that line clean is what makes detectors independently
testable — and independently *wrong* in a catchable way.

### The detector contract — five clauses

1. **Pure function.** Bars in, labelled events out. No state, no I/O, no
   randomness. Same input → identical output, forever.

2. **No lookahead.** A detector at bar *t* may read bar *t* and earlier — never
   *t+1*. Enforced structurally: it is handed a left-bounded window only. This
   is the single most violated rule in backtesting and it silently manufactures
   fake edges.

3. **Events, not booleans.** Output is a list of typed events, each with a time
   index, a price geometry (the levels that define it), and a confidence-free
   label. No "strength" score — that is a discretion word wearing a number.

4. **Maturity timestamp.** Every event carries the bar index at which it became
   *confirmed* — distinct from the bar it physically spans. An FVG is drawn
   across three bars but only knowable after the third closes. The setup may
   only act on an event at or after its maturity index.

5. **Self-parameterised.** All thresholds arrive as explicit arguments bound by
   the setup. The detector ships no defaults — not passed, does not run.

### Worked example — Fair Value Gap (FVG)

> **Executable spec:** `docs/visuals/fvg-detector-instrument.html` is an
> interactive build of this detector — the three-bar frame, the ATR threshold,
> the maturity index, the emitted event object, and the lookahead probe, all
> running. The Phase 2 TypeScript detector must reproduce its behaviour. Open it
> before implementing.

- **Definition (to the candle):** a bullish FVG is a three-bar formation where
  `bar1.high < bar3.low` — an unfilled gap in delivery. Bearish is the mirror:
  `bar1.low > bar3.high`.
- **Inputs:** the bar window, `min_size_atr` (gap height as a multiple of ATR at
  the formation bar), `atr_period`.
- **Logic:** slide a three-bar frame across the window. Bullish gap if
  `bar1.high < bar3.low`; gap height = `bar3.low − bar1.high`; admit only if
  height ≥ `min_size_atr × ATR`. ATR computed strictly from bars at or before
  the formation bar — no lookahead leaking through the volatility measure.
- **Event object:** `type`, `direction`, the three bar indices, the gap's upper
  and lower price bounds, `midpoint = (upper + lower) / 2`, and
  `maturity index = bar 3's index`.
- **What it omits:** it never says "enter at the midpoint." It reports geometry;
  the setup's entry block decides to use the midpoint. Mixing those makes the
  detector un-testable.

### Detector unit testing

Each detector ships its **own** test suite, separate from any strategy:

- a textbook gap is found;
- a one-tick-too-small gap is rejected at the `min_size_atr` boundary;
- a gap that later fills is still *detected* at formation (filling is the
  setup's concern, not the detector's);
- an event's maturity index never precedes its third bar;
- **lookahead probe:** run the detector on a window, then on the same window
  with future bars appended, and assert the labels over the shared region are
  byte-identical. If they differ, the detector reads the future and every
  backtest using it is fiction.

A detector bug and a strategy with no edge produce the *same symptom* — a bad
equity curve. Testing detectors in isolation is what lets the honesty harness's
verdict mean something.

---

## 4. Stage 03 — The Trajectory Simulator

Runs a compiled setup over historical bars, simulates fills, emits a trade
ledger.

- Pure function: `(setup, bars) → trade ledger`.
- Fills modelled with **realistic spread, slippage, and cost.** Costs are not
  optional — half of marginal ICT edges are spread.
- Output is a structured ledger (entry, exit, R achieved, bars held, reason),
  not a summary statistic. The honesty harness consumes the ledger.

---

## 5. Stage 04 — The Honesty Harness

The core of the instrument. A setup earns a "has edge" verdict only if it clears
**all four** tests. Most will not. That is the instrument doing its job.

1. **Out-of-sample holdout.** Define and tune on one slice, then run *once* on
   data never seen. Walk-forward, not a single split. A result that exists only
   in-sample is narration.

2. **Baseline comparison — the most-skipped test.** Run a naive comparator:
   random entries, same session, same hold time, same target R. If ICT logic
   wins 54% and the random baseline wins 52%, the edge is 2% and that is noise.
   No setup gets a verdict without this.

3. **Degrees-of-freedom audit.** Count every tunable parameter. Sweep each. A
   sharp profit spike at one value surrounded by noise is overfit; a broad
   plateau is robust. More parameters → higher overfitting prior → stricter
   holdout bar.

4. **Trade-order Monte Carlo.** Shuffle the trade sequence thousands of times
   for a distribution of equity curves and max drawdowns. If the real result
   sits inside the noise band, there is no edge — only a lucky ordering.

The verdict is a structured object: pass/fail per test, the numbers behind each,
and an overall promote / shelve recommendation. **The verdict is reported, never
auto-applied.**

---

## 6. Stage 05 — The Decision Log (via ggarch)

The instrument does **not** build its own logging system. Stage 05 is literally
"call `ggarch`."

`ggquant` produces typed `DecisionRecord` objects; `ggarch` ingests, structures,
and stores them as ADRs. The contract is one-directional and clean.

### Emit points

- **A `Setup` compiles** → emit a record: the setup, every bound parameter
  value, and the `thesis` field as the rationale.
- **A `min_size_atr` (or any parameter) value is chosen** → emit a record
  capturing *why that number*, written **before** the result is seen.
- **The honesty harness returns a verdict** → emit a record: pass/fail on each
  of the four tests, the numbers, and the promote/shelve decision.

### Why this matters

`ggarch` exists to capture reasoning before code is written. Here it becomes:
capture the parameter choice **before the backtest is run.** That is the single
most important guard against curve-fitting — you cannot quietly rationalise a
number after seeing it win if the reasoning was timestamped before the test.
`ggarch` makes the honesty harness honest about itself.

### `DecisionRecord` shape (indicative)

```
DecisionRecord {
  kind:        "setup-compiled" | "parameter-chosen" | "harness-verdict"
  timestamp:   ISO-8601
  subject:     string            // setup name + version
  rationale:   string            // the "why", written before any result
  payload:     object            // bound params / verdict numbers / etc.
}
```

---

## 7. The execution-vs-edge split

When a failure occurs, there are two classes — and only one may be
auto-corrected.

> **Background:** `docs/visuals/continual-harness-evolution.html` illustrates the
> self-refining-harness pattern (Continual Harness) that inspired this split. It
> shows why mid-loop refinement works for an agent with clean failure signals —
> and, by contrast, why trading's noisy P&L signal makes the same loop dangerous
> for edge changes. Reference material, not a project requirement.

### Execution failures — auto-correct freely

Objective, nothing to do with whether the trade won: a detector mis-tagged a gap
that was not there; an entry fired outside the session window; a stop placed on
the wrong side of the level; slippage past tolerance; a setup that violated its
own written rules. These are observable from the trajectory, not the P&L. The
instrument may repair these automatically — they are bugs.

### Edge failures — never auto-correct in-loop

"This setup lost money" or "win rate dropped this week" is **not** a correctable
signal at trade frequency. P&L over a short window is mostly noise; a correct ICT
entry loses regularly. Rewriting the strategy from recent P&L is curve-fitting to
the last regime. Edge changes go to a **review queue**, not a live edit, and only
graduate after walk-forward / out-of-sample validation and human sign-off.

### Routing

```
trajectory → classify failure
   ├─ execution failure → auto-repair the detector/logic, emit ADR
   └─ edge failure      → log to review queue → offline harness → human → apply
```

A **circuit breaker** applies: if execution corrections spike in frequency, that
is not improvement — it is regime change. Pause auto-correction and escalate to
a human.

---

## 8. TradingView — placement

TradingView sits at the *ends* of the pipeline, never inside it.

- **As a data source (front):** acceptable to bootstrap the simulator, but
  exported history has gaps and varies by feed. Treat as provisional. The
  data-of-record is a proper historical source (broker/exchange API). A holdout
  test on dirty data is not a holdout test.

- **As a visual cross-check (valuable):** Pine Script is itself a detector
  language — a free second implementation. Port a detector's rule to a Pine
  indicator, run it on the same symbol/timeframe, and eyeball whether it tags the
  same events the TypeScript detector emits. Disagreement means one is wrong.

- **What it must not become:** the validation environment. Pine strategy
  backtests have no holdout, no random baseline, no DoF audit, no Monte Carlo —
  the exact "looks validated when it isn't" trap. The verdict comes from the
  honesty harness; TradingView never issues one.

TradingView is an external tool used alongside `ggquant`, **not a dependency.**

---

## 9. Build order (summary — see BUILD_PLAN.md)

Build the spine before the breadth. One vertical slice end-to-end before
widening:

1. Definition Layer schema + compile-or-reject validator
2. FVG detector — contract, implementation, unit suite, lookahead probe
3. Trajectory simulator with realistic costs
4. Honesty harness — all four tests
5. *Then* the second detector

Resist building all detectors first. It feels productive and proves nothing.
