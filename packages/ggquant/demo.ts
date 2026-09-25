#!/usr/bin/env npx tsx
// ──────────────────────────────────────────────────────────────────────
// ggquant demo — end-to-end: define setup → compile → simulate → harness
// Run: npx tsx demo.ts
// ──────────────────────────────────────────────────────────────────────

import type { Bar } from "./src/detector-types.js";
import type { Setup } from "./src/types.js";
import type { CostModel } from "./src/simulator-types.js";
import { compileSetup } from "./src/definition-layer.js";
import { simulate } from "./src/simulator.js";
import { runHarness, DEFAULT_HARNESS_CONFIG } from "./src/index.js";
import { Rng } from "./src/rng.js";

// ── 1. Generate synthetic bar data ──────────────────────────────────

function generateBars(count: number, seed: number): Bar[] {
  const rng = new Rng(seed);
  const bars: Bar[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    const move = (rng.next() - 0.48) * 2; // slight upward drift
    const range = 0.5 + rng.next() * 1.5;
    const o = price;
    const c = price + move;
    const h = Math.max(o, c) + rng.next() * range;
    const l = Math.min(o, c) - rng.next() * range;
    bars.push({ o, h, l, c });
    price = c;
  }

  // Inject some FVG patterns (bullish gaps) to give the detector something to find
  for (let i = 20; i < count - 3; i += 40) {
    const base = bars[i]!;
    // bar i+1: strong bullish candle creating gap
    bars[i + 1] = { o: base.c, h: base.c + 4, l: base.c - 0.1, c: base.c + 3.5 };
    // bar i+2: gap up — low of i+2 > high of i → bullish FVG
    bars[i + 2] = {
      o: base.c + 3.5,
      h: base.c + 5,
      l: base.h + 0.5,
      c: base.c + 4.5,
    };
  }

  return bars;
}

// ── 2. Define a setup ────────────────────────────────────────────────

const setup: Setup = {
  metadata: {
    name: "FVG Reversion Demo",
    version: "1.0.0",
    author: "ggquant-demo",
    thesis:
      "Bullish FVGs with gap > 0.5 ATR in trending markets provide a limit-entry edge when price revisits the midpoint.",
  },
  detection: {
    detector: "fvg",
    params: { min_size_atr: 0.5, atr_period: 14 },
  },
  contextFilter: {
    sessionWindow: {
      label: "London",
      startTime: "08:00",
      endTime: "17:00",
      timezone: "Europe/London",
    },
  },
  entryTrigger: {
    orderType: "limit",
    priceRef: "fvg_midpoint",
  },
  invalidation: {
    priceRef: "fvg_lower",
    offsetPoints: 0.5,
    timeStopBars: 20,
  },
  target: {
    levels: [{ kind: "r_multiple", value: 2 }],
  },
  positionModel: {
    riskFraction: 0.01,
  },
};

// ── 3. Compile ───────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════");
console.log("  ggquant demo — deterministic ICT setup validation");
console.log("═══════════════════════════════════════════════════════\n");

console.log("▸ Step 1: Compile setup definition...");
const result = compileSetup(setup);

if (result._tag === "Rejected") {
  console.log("  ✗ Setup rejected:");
  for (const r of result.rejections) {
    console.log(`    - [${r.rule}] ${r.message} (${r.path})`);
  }
  process.exit(1);
}

console.log("  ✓ Setup compiled successfully\n");

// ── 4. Simulate ──────────────────────────────────────────────────────

const bars = generateBars(500, 12345);
const cost: CostModel = {
  spreadPoints: 0.1,
  slippagePoints: 0.05,
  commissionPerTrade: 0.02,
};

console.log(`▸ Step 2: Simulate over ${bars.length} bars...`);
const ledger = simulate(result, bars, cost);
console.log(`  ✓ ${ledger.entries.length} trades generated\n`);

if (ledger.entries.length > 0) {
  const wins = ledger.entries.filter((e) => e.rAchieved > 0).length;
  const totalR = ledger.entries.reduce((s, e) => s + e.rAchieved, 0);
  const avgR = totalR / ledger.entries.length;

  console.log("  ┌──────────────────────────────────────┐");
  console.log(`  │  Trades: ${String(ledger.entries.length).padStart(5)}                       │`);
  console.log(
    `  │  Win Rate: ${((wins / ledger.entries.length) * 100).toFixed(1).padStart(5)}%                    │`,
  );
  console.log(`  │  Avg R: ${avgR.toFixed(3).padStart(7)}                      │`);
  console.log(`  │  Total R: ${totalR.toFixed(3).padStart(7)}                    │`);
  console.log("  └──────────────────────────────────────┘\n");

  // Show first 5 trades
  console.log("  First 5 trades:");
  for (const t of ledger.entries.slice(0, 5)) {
    const icon = t.rAchieved > 0 ? "✓" : "✗";
    console.log(
      `    ${icon} Bar ${t.entryBar}→${t.exitBar}  ${t.direction.padEnd(5)}  R=${t.rAchieved.toFixed(3).padStart(7)}  exit=${t.exitReason}`,
    );
  }
  console.log();
}

// ── 5. Run Honesty Harness ───────────────────────────────────────────

console.log("▸ Step 3: Run honesty harness (4 tests)...");
const t0 = performance.now();
const verdict = runHarness(result, bars, cost, {
  ...DEFAULT_HARNESS_CONFIG,
  baselineIterations: 100,
  monteCarloIterations: 500,
});
const elapsed = (performance.now() - t0).toFixed(0);

console.log(`  Completed in ${elapsed}ms\n`);

const pass = (b: boolean) => (b ? "✓ PASS" : "✗ FAIL");

console.log("  ┌─────────────────────────────────────────────────────┐");
console.log(`  │  Test 1 — Holdout (walk-forward):  ${pass(verdict.holdout.pass).padEnd(10)}       │`);
console.log(
  `  │    OOS win rate: ${(verdict.holdout.avgOosWinRate * 100).toFixed(1)}%  OOS avg R: ${verdict.holdout.avgOosAvgR.toFixed(3)}     │`,
);
console.log(`  │                                                     │`);
console.log(`  │  Test 2 — Baseline comparison:     ${pass(verdict.baseline.pass).padEnd(10)}       │`);
console.log(
  `  │    Strategy: ${(verdict.baseline.strategyWinRate * 100).toFixed(1)}% / ${verdict.baseline.strategyAvgR.toFixed(3)}R                    │`,
);
console.log(
  `  │    Baseline: ${(verdict.baseline.baselineWinRate * 100).toFixed(1)}% / ${verdict.baseline.baselineAvgR.toFixed(3)}R                    │`,
);
console.log(`  │                                                     │`);
console.log(`  │  Test 3 — DoF audit:               ${pass(verdict.dofAudit.pass).padEnd(10)}       │`);
for (const s of verdict.dofAudit.sweeps) {
  console.log(
    `  │    ${s.paramName}: CV=${s.avgRCv.toFixed(2)} ${s.isRobust ? "(robust)" : "(fragile)"}                  │`,
  );
}
console.log(`  │                                                     │`);
console.log(`  │  Test 4 — Monte Carlo:             ${pass(verdict.monteCarlo.pass).padEnd(10)}       │`);
console.log(
  `  │    Real: ${verdict.monteCarlo.realTotalR.toFixed(2)}R  Pctl: ${verdict.monteCarlo.realPercentile.toFixed(0)}%                      │`,
);
console.log(
  `  │    Shuffled 5-95%: [${verdict.monteCarlo.p5TotalR.toFixed(2)}, ${verdict.monteCarlo.p95TotalR.toFixed(2)}]               │`,
);
console.log(`  │                                                     │`);
console.log(
  `  │  ══════════════════════════════════════════════════ │`,
);
console.log(
  `  │  VERDICT: ${verdict.recommendation.toUpperCase().padEnd(7)}                                   │`,
);
console.log("  └─────────────────────────────────────────────────────┘");

// ── 6. Show rejected setup example ───────────────────────────────────

console.log("\n\n▸ Bonus: Rejected setup example...");
const badSetup: Setup = {
  ...setup,
  metadata: {
    ...setup.metadata,
    name: "Bad Setup",
    thesis: "Price usually bounces around a strong obvious level.",
  },
};

const badResult = compileSetup(badSetup);
if (badResult._tag === "Rejected") {
  console.log("  ✗ Rejected (as expected):");
  for (const r of badResult.rejections) {
    console.log(`    - [${r.rule}] ${r.message}`);
  }
}

console.log("\nDone.");
