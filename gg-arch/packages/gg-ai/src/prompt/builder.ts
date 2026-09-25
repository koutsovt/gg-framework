import { loadOrgContext, loadPatterns, recentDecisions } from "../memory/store.js";

export function buildSystemPrompt(): string {
  const org = loadOrgContext();
  const patterns = loadPatterns();
  const recent = recentDecisions(5);

  const parts: string[] = [
    `You are gg-arch, a thinking tool for solution architects. You help architects stress-test architecture decisions through structured adversarial review.`,
    ``,
    `You operate in a phase-based pipeline. Always respond ONLY in valid JSON matching the requested schema. No markdown, no preamble, no backticks.`,
  ];

  if (org.organisation.name) {
    parts.push(``, `ORGANISATIONAL CONTEXT:`);
    parts.push(`Organisation: ${org.organisation.name} (${org.organisation.abbreviation})`);
    if (org.strategy.pillars.length > 0) {
      parts.push(`Strategic pillars: ${org.strategy.pillars.join(", ")}`);
    }
    if (org.strategy.principles.length > 0) {
      parts.push(`Principles: ${org.strategy.principles.join(", ")}`);
    }
    if (org.governance.review_body) {
      parts.push(`Governance: ${org.governance.review_body} via ${org.governance.submission_format}`);
    }
    if (org.governance.review_criteria.length > 0) {
      parts.push(`Review criteria: ${org.governance.review_criteria.join(", ")}`);
    }
    if (org.team.name) {
      parts.push(`Team: ${org.team.name} (${org.team.parent})`);
    }
    if (org.platform.identity) {
      parts.push(`Platform: ${org.platform.identity}, ${org.platform.cloud}, ${org.platform.productivity}`);
    }
  }

  const allPatterns = [
    ...patterns.reviewer_patterns.map((p) => `[${p.reviewer_type}] ${p.pattern} (confidence: ${p.confidence})`),
    ...patterns.framing_patterns.map((p) => `[Framing] ${p.pattern} (confidence: ${p.confidence})`),
    ...patterns.governance_patterns.map((p) => `[Governance] ${p.pattern} (confidence: ${p.confidence})`),
  ];

  if (allPatterns.length > 0) {
    parts.push(``, `LEARNED PATTERNS FROM PAST REVIEWS:`);
    allPatterns.forEach((p) => parts.push(`- ${p}`));
  }

  if (recent.length > 0) {
    parts.push(``, `RECENT DECISIONS (for context and calibration):`);
    recent.forEach((d) => {
      const outcome = d.outcome ? ` → ${d.outcome.status}` : ` → pending`;
      parts.push(`- ${d.date}: ${d.title}${outcome}`);
    });
  }

  return parts.join("\n");
}

export function buildUserPrompt(phasePrompt: string, dynamicContext?: string): string {
  const parts: string[] = [];
  if (dynamicContext) {
    parts.push(dynamicContext);
    parts.push(``);
  }
  parts.push(phasePrompt);
  return parts.join("\n");
}
