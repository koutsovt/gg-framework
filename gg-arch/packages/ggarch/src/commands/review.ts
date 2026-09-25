import { readFileSync } from "node:fs";
import { saveDecision, addReviewerPattern } from "@gg-arch/ai";
import type { DecisionRecord } from "@gg-arch/ai";
import { extractTensions } from "../tools/extract-tensions.js";
import { generatePersonas } from "../tools/generate-personas.js";
import { runReview } from "../tools/run-review.js";
import { synthesiseRecord } from "../tools/synthesise-record.js";
import {
  createEmptySession,
  type SessionState,
  type Tension,
  type Persona,
  type Review,
} from "../schemas.js";

export interface ReviewOptions {
  input?: string;
  context?: string;
  personas?: number;
  model?: string;
}

// Dynamically import ESM-only deps to avoid top-level issues
async function loadDeps() {
  const [chalk, ora, inquirer] = await Promise.all([
    import("chalk"),
    import("ora"),
    import("inquirer"),
  ]);
  return {
    chalk: chalk.default,
    ora: ora.default,
    inquirer: inquirer.default,
  };
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const { chalk, ora, inquirer } = await loadDeps();
  const session = createEmptySession();

  console.log();
  console.log(chalk.bold("  gg-arch") + chalk.gray(" · Structured adversarial review"));
  console.log();

  // ─── Phase 1: Context ──────────────────────────────────────

  if (options.input) {
    session.context = readFileSync(options.input, "utf-8");
    console.log(chalk.gray(`  Loaded context from ${options.input}`));
  } else if (options.context) {
    session.context = options.context;
  } else {
    const { context } = await inquirer.prompt([
      {
        type: "editor",
        name: "context",
        message: "Describe your architecture decision (opens editor):",
      },
    ]);
    session.context = context;
  }

  if (!session.context.trim()) {
    console.log(chalk.red("  No context provided. Exiting."));
    return;
  }

  // ─── Phase 2: Tensions ─────────────────────────────────────

  const spinTensions = ora("  Phase 1/5 · Analysing decision context...").start();
  try {
    const tensionMap = await extractTensions(session.context);
    session.tensions = tensionMap;
    spinTensions.succeed("  Phase 1/5 · Tension map extracted");
  } catch (err) {
    spinTensions.fail("  Failed to extract tensions");
    console.error(chalk.red(`  ${err}`));
    return;
  }

  console.log();
  console.log(chalk.bold(`  Found ${session.tensions.tensions.length} tensions:`));
  console.log();

  const severityIcon: Record<string, string> = {
    high: chalk.red("■ HIGH  "),
    medium: chalk.yellow("■ MED   "),
    low: chalk.green("■ LOW   "),
  };

  for (const t of session.tensions.tensions) {
    console.log(`  ${severityIcon[t.severity]} ${chalk.bold(t.label)}`);
    console.log(chalk.gray(`           ${t.description}`));
  }
  console.log();

  if (session.tensions.summary) {
    console.log(chalk.gray(`  ${session.tensions.summary}`));
    console.log();
  }

  const { proceedPersonas } = await inquirer.prompt([
    { type: "confirm", name: "proceedPersonas", message: "Proceed to persona generation?", default: true },
  ]);
  if (!proceedPersonas) return;

  // ─── Phase 3: Personas ─────────────────────────────────────

  const spinPersonas = ora("  Phase 2/5 · Generating reviewer personas...").start();
  try {
    session.personas = await generatePersonas(session.context, session.tensions.tensions);
    spinPersonas.succeed("  Phase 2/5 · Reviewer personas generated");
  } catch (err) {
    spinPersonas.fail("  Failed to generate personas");
    console.error(chalk.red(`  ${err}`));
    return;
  }

  console.log();
  console.log(chalk.bold(`  ${session.personas.length} reviewers ready:`));
  console.log();

  for (const [i, p] of session.personas.entries()) {
    console.log(`  ${chalk.bold(`${i + 1}. ${p.name}`)}`);
    console.log(chalk.gray(`     ${p.perspective}`));
  }
  console.log();

  const { proceedReviews } = await inquirer.prompt([
    { type: "confirm", name: "proceedReviews", message: "Start adversarial review?", default: true },
  ]);
  if (!proceedReviews) return;

  // ─── Phase 4: Reviews ──────────────────────────────────────

  for (const [i, persona] of session.personas.entries()) {
    const spinReview = ora(`  Phase 3/5 · ${persona.name} is evaluating...`).start();
    try {
      const review = await runReview(session.context, session.tensions!.tensions, persona);
      session.reviews[persona.id] = review;
      spinReview.succeed(`  Phase 3/5 · ${persona.name} complete`);
    } catch (err) {
      spinReview.fail(`  ${persona.name} review failed`);
      console.error(chalk.red(`  ${err}`));
      continue;
    }

    const review = session.reviews[persona.id];
    const verdictColors: Record<string, (s: string) => string> = {
      approve: chalk.green,
      approve_with_conditions: chalk.yellow,
      request_changes: chalk.hex("#f97316"),
      reject: chalk.red,
    };
    const verdictLabels: Record<string, string> = {
      approve: "APPROVE",
      approve_with_conditions: "APPROVE WITH CONDITIONS",
      request_changes: "REQUEST CHANGES",
      reject: "REJECT",
    };

    const vc = verdictColors[review.verdict] || chalk.gray;
    console.log();
    console.log(`  ┌${"─".repeat(58)}┐`);
    console.log(`  │ ${chalk.bold(persona.name).padEnd(67)} │`);
    console.log(`  │ Verdict: ${vc(verdictLabels[review.verdict] || review.verdict).padEnd(56)} │`);
    console.log(`  ├${"─".repeat(58)}┤`);
    console.log(`  │ ${chalk.bold("Key Concern:").padEnd(67)} │`);

    const concern = review.key_concern;
    const lines = wrapText(concern, 56);
    for (const line of lines) {
      console.log(`  │ ${line.padEnd(57)} │`);
    }

    if (review.questions.length > 0) {
      console.log(`  ├${"─".repeat(58)}┤`);
      console.log(`  │ ${chalk.bold("Questions:").padEnd(67)} │`);
      for (const q of review.questions) {
        const qlines = wrapText(`• ${q}`, 56);
        for (const ql of qlines) {
          console.log(`  │ ${ql.padEnd(57)} │`);
        }
      }
    }

    if (review.conditions.length > 0) {
      console.log(`  ├${"─".repeat(58)}┤`);
      console.log(`  │ ${chalk.bold("Conditions:").padEnd(67)} │`);
      for (const c of review.conditions) {
        const clines = wrapText(`• ${c}`, 56);
        for (const cl of clines) {
          console.log(`  │ ${cl.padEnd(57)} │`);
        }
      }
    }
    console.log(`  └${"─".repeat(58)}┘`);
    console.log();

    // Detailed feedback
    console.log(chalk.gray(indentText(review.detailed_feedback, "  ")));
    console.log();

    const { response } = await inquirer.prompt([
      {
        type: "editor",
        name: "response",
        message: `Your response to ${persona.name} (opens editor):`,
      },
    ]);
    session.responses[persona.id] = response;

    // Track pattern
    addReviewerPattern(
      persona.name.replace("The ", "").replace(" Reviewer", ""),
      review.key_concern
    );
  }

  // ─── Phase 5: Decision Record ──────────────────────────────

  const { proceedRecord } = await inquirer.prompt([
    { type: "confirm", name: "proceedRecord", message: "Generate decision record?", default: true },
  ]);
  if (!proceedRecord) return;

  const spinRecord = ora("  Phase 5/5 · Synthesising decision record...").start();
  try {
    session.record = await synthesiseRecord(
      session.context,
      session.tensions!.tensions,
      session.personas,
      session.reviews,
      session.responses
    );
    spinRecord.succeed("  Phase 5/5 · Decision record generated");
  } catch (err) {
    spinRecord.fail("  Failed to generate decision record");
    console.error(chalk.red(`  ${err}`));
    return;
  }

  // Display record
  console.log();
  console.log(chalk.bgHex("#1e293b").white.bold(` DECISION RECORD `));
  console.log(chalk.bold(`  ${session.record.decision_title}`));
  console.log(chalk.gray(`  ${session.record.decision_date}`));
  console.log();
  console.log(chalk.italic(indentText(session.record.summary, "  ")));
  console.log();

  if (session.record.tensions_navigated.length > 0) {
    console.log(chalk.bold("  TENSIONS NAVIGATED"));
    for (const t of session.record.tensions_navigated) {
      console.log(`  ${chalk.bold("•")} ${chalk.bold(t.tension)}`);
      console.log(chalk.gray(`    Resolution: ${t.resolution}`));
      console.log(chalk.gray(`    Tradeoff: ${t.tradeoff_accepted}`));
    }
    console.log();
  }

  if (session.record.objections_addressed.length > 0) {
    console.log(chalk.bold("  OBJECTIONS ADDRESSED"));
    for (const o of session.record.objections_addressed) {
      const statusColor = o.status === "resolved" ? chalk.green : o.status === "accepted_risk" ? chalk.yellow : chalk.blue;
      console.log(`  ${chalk.bold("•")} ${chalk.bold(o.reviewer)} ${statusColor(`[${o.status}]`)}`);
      console.log(chalk.gray(`    ${o.objection}`));
      console.log(chalk.gray(`    → ${o.response}`));
    }
    console.log();
  }

  if (session.record.reasoning_trace) {
    console.log(chalk.bold("  REASONING TRACE"));
    console.log(chalk.hex("#f59e0b")(indentText(session.record.reasoning_trace, "  ")));
    console.log();
  }

  // ─── Save Decision ────────────────────────────────────────

  const { shouldSave } = await inquirer.prompt([
    { type: "confirm", name: "shouldSave", message: "Save this decision record?", default: true },
  ]);

  if (shouldSave) {
    const slug = session.record.decision_title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    const { id } = await inquirer.prompt([
      {
        type: "input",
        name: "id",
        message: "Decision ID (kebab-case):",
        default: slug,
      },
    ]);

    const { tags } = await inquirer.prompt([
      {
        type: "input",
        name: "tags",
        message: "Tags (comma-separated):",
        default: "",
      },
    ]);

    const decisionRecord: DecisionRecord = {
      id,
      date: session.record.decision_date,
      title: session.record.decision_title,
      context_summary: session.record.summary,
      tensions: session.record.tensions_navigated.map((t) => ({
        label: t.tension,
        resolution: t.resolution,
        tradeoff_accepted: t.tradeoff_accepted,
      })),
      objections: session.record.objections_addressed.map((o) => ({
        reviewer_type: o.reviewer.replace("The ", "").replace(" Reviewer", ""),
        concern: o.objection,
        response: o.response,
        status: o.status,
      })),
      reasoning_trace: session.record.reasoning_trace,
      outcome: null,
      tags: tags
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean),
    };

    saveDecision(decisionRecord);
    console.log(chalk.green(`\n  ✓ Saved as "${id}" in ~/.gg-arch/decisions.json`));
  }

  console.log();
}

// ─── Helpers ──────────────────────────────────────────────────

function wrapText(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function indentText(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}
