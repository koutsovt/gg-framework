import { writeFileSync } from "node:fs";
import { findDecision } from "@gg-arch/ai";

export async function exportCommand(
  id: string,
  format: string
): Promise<void> {
  const chalk = (await import("chalk")).default;
  const decision = findDecision(id);

  if (!decision) {
    console.log(chalk.red(`\n  Decision "${id}" not found.\n`));
    return;
  }

  if (format === "json") {
    const filename = `${id}.json`;
    writeFileSync(filename, JSON.stringify(decision, null, 2), "utf-8");
    console.log(chalk.green(`\n  ✓ Exported to ${filename}\n`));
    return;
  }

  // Default: markdown
  const lines: string[] = [];
  lines.push(`# Decision Record: ${decision.title}`);
  lines.push(``);
  lines.push(`**Date:** ${decision.date}`);
  lines.push(`**ID:** ${decision.id}`);
  if (decision.tags.length > 0) {
    lines.push(`**Tags:** ${decision.tags.join(", ")}`);
  }
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(decision.context_summary);
  lines.push(``);

  if (decision.tensions.length > 0) {
    lines.push(`## Tensions Navigated`);
    lines.push(``);
    for (const t of decision.tensions) {
      lines.push(`### ${t.label}`);
      lines.push(``);
      lines.push(`- **Resolution:** ${t.resolution}`);
      lines.push(`- **Tradeoff accepted:** ${t.tradeoff_accepted}`);
      lines.push(``);
    }
  }

  if (decision.objections.length > 0) {
    lines.push(`## Objections Addressed`);
    lines.push(``);
    lines.push(`| Reviewer | Concern | Response | Status |`);
    lines.push(`|----------|---------|----------|--------|`);
    for (const o of decision.objections) {
      lines.push(`| ${o.reviewer_type} | ${o.concern} | ${o.response} | ${o.status} |`);
    }
    lines.push(``);
  }

  if (decision.reasoning_trace) {
    lines.push(`## Reasoning Trace`);
    lines.push(``);
    lines.push(decision.reasoning_trace);
    lines.push(``);
  }

  if (decision.outcome) {
    lines.push(`## Outcome`);
    lines.push(``);
    lines.push(`- **Status:** ${decision.outcome.status}`);
    if (decision.outcome.date) lines.push(`- **Date:** ${decision.outcome.date}`);
    if (decision.outcome.notes) lines.push(`- **Notes:** ${decision.outcome.notes}`);
    lines.push(``);
  }

  const filename = `${id}.md`;
  writeFileSync(filename, lines.join("\n"), "utf-8");
  console.log(chalk.green(`\n  ✓ Exported to ${filename}\n`));
}
