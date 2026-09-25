import { loadPatterns } from "@gg-arch/ai";

export async function patternsCommand(type?: string): Promise<void> {
  const chalk = (await import("chalk")).default;
  const store = loadPatterns();

  const all = [
    ...store.reviewer_patterns.map((p) => ({ ...p, category: "Reviewer", label: p.reviewer_type })),
    ...store.framing_patterns.map((p) => ({ ...p, category: "Framing", label: "Framing" })),
    ...store.governance_patterns.map((p) => ({ ...p, category: "Governance", label: "Governance" })),
  ];

  const filtered = type
    ? all.filter((p) => p.category.toLowerCase() === type.toLowerCase())
    : all;

  if (filtered.length === 0) {
    console.log(chalk.gray("\n  No patterns learned yet. Complete some reviews to build up patterns.\n"));
    return;
  }

  console.log();
  console.log(chalk.bold(`  ${filtered.length} learned pattern(s):`));
  console.log();

  const confColors: Record<string, (s: string) => string> = {
    high: chalk.green,
    medium: chalk.yellow,
    low: chalk.gray,
  };

  for (const p of filtered) {
    const cc = confColors[p.confidence] || chalk.gray;
    console.log(`  ${chalk.bold(`[${p.label}]`)} ${p.pattern}`);
    console.log(chalk.gray(`    ${cc(p.confidence)} · ${p.evidence_count} occurrence(s) · last seen ${p.last_seen}`));
  }
  console.log();
}
