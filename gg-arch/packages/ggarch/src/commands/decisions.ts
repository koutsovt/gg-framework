import {
  loadDecisions,
  findDecision,
  updateDecisionOutcome,
  searchDecisions,
  type DecisionOutcome,
} from "@gg-arch/ai";

async function loadChalk() {
  const chalk = await import("chalk");
  return chalk.default;
}

export async function listDecisions(): Promise<void> {
  const chalk = await loadChalk();
  const store = loadDecisions();

  if (store.decisions.length === 0) {
    console.log(chalk.gray("\n  No decisions recorded yet. Run `gg-arch review` to start.\n"));
    return;
  }

  console.log();
  console.log(chalk.bold(`  ${store.decisions.length} decision(s) recorded:`));
  console.log();

  const sorted = [...store.decisions].sort((a, b) => b.date.localeCompare(a.date));

  for (const d of sorted) {
    const outcome = d.outcome
      ? ` → ${d.outcome.status}`
      : chalk.gray(" → pending");
    console.log(`  ${chalk.gray(d.date)}  ${chalk.bold(d.id)}${outcome}`);
    console.log(chalk.gray(`            ${d.title}`));
  }
  console.log();
}

export async function viewDecision(id: string): Promise<void> {
  const chalk = await loadChalk();
  const decision = findDecision(id);

  if (!decision) {
    console.log(chalk.red(`\n  Decision "${id}" not found.\n`));
    return;
  }

  console.log();
  console.log(chalk.bold(`  ${decision.title}`));
  console.log(chalk.gray(`  ${decision.date} · ${decision.id}`));
  console.log();
  console.log(chalk.italic(`  ${decision.context_summary}`));
  console.log();

  if (decision.tensions.length > 0) {
    console.log(chalk.bold("  TENSIONS"));
    for (const t of decision.tensions) {
      console.log(`  • ${chalk.bold(t.label)}`);
      console.log(chalk.gray(`    Resolution: ${t.resolution}`));
      console.log(chalk.gray(`    Tradeoff: ${t.tradeoff_accepted}`));
    }
    console.log();
  }

  if (decision.objections.length > 0) {
    console.log(chalk.bold("  OBJECTIONS"));
    for (const o of decision.objections) {
      const sc = o.status === "resolved" ? chalk.green : o.status === "accepted_risk" ? chalk.yellow : chalk.blue;
      console.log(`  • ${chalk.bold(o.reviewer_type)} ${sc(`[${o.status}]`)}`);
      console.log(chalk.gray(`    ${o.concern}`));
      console.log(chalk.gray(`    → ${o.response}`));
    }
    console.log();
  }

  if (decision.reasoning_trace) {
    console.log(chalk.bold("  REASONING TRACE"));
    console.log(chalk.hex("#f59e0b")(`  ${decision.reasoning_trace}`));
    console.log();
  }

  if (decision.outcome) {
    console.log(chalk.bold("  OUTCOME"));
    console.log(`  Status: ${decision.outcome.status}`);
    if (decision.outcome.date) console.log(`  Date: ${decision.outcome.date}`);
    if (decision.outcome.notes) console.log(`  Notes: ${decision.outcome.notes}`);
    console.log();
  }

  if (decision.tags.length > 0) {
    console.log(chalk.gray(`  Tags: ${decision.tags.join(", ")}`));
    console.log();
  }
}

export async function outcomeCommand(
  id: string,
  status: string,
  notes: string
): Promise<void> {
  const chalk = await loadChalk();
  const outcome: DecisionOutcome = {
    status: status as DecisionOutcome["status"],
    date: new Date().toISOString().split("T")[0],
    notes,
  };

  const updated = updateDecisionOutcome(id, outcome);
  if (updated) {
    console.log(chalk.green(`\n  ✓ Updated outcome for "${id}" → ${status}\n`));
  } else {
    console.log(chalk.red(`\n  Decision "${id}" not found.\n`));
  }
}

export async function searchCommand(query: string): Promise<void> {
  const chalk = await loadChalk();
  const results = searchDecisions(query);

  if (results.length === 0) {
    console.log(chalk.gray(`\n  No decisions matching "${query}".\n`));
    return;
  }

  console.log();
  console.log(chalk.bold(`  ${results.length} result(s) for "${query}":`));
  console.log();

  for (const d of results) {
    console.log(`  ${chalk.gray(d.date)}  ${chalk.bold(d.id)}`);
    console.log(chalk.gray(`            ${d.title}`));
  }
  console.log();
}
