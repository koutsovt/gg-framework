import { loadOrgContext, saveOrgContext, getConfigDir } from "@gg-arch/ai";

export async function configOrgCommand(): Promise<void> {
  const chalk = (await import("chalk")).default;
  const inquirer = (await import("inquirer")).default;
  const current = loadOrgContext();

  console.log();
  console.log(chalk.bold("  Configure organisational context"));
  console.log(chalk.gray("  This is injected into the system prompt for every review session."));
  console.log();

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "orgName",
      message: "Organisation name:",
      default: current.organisation.name || "La Trobe University",
    },
    {
      type: "input",
      name: "orgAbbrev",
      message: "Abbreviation:",
      default: current.organisation.abbreviation || "LTU",
    },
    {
      type: "input",
      name: "pillars",
      message: "Strategic pillars (comma-separated):",
      default: current.strategy.pillars.join(", ") || "Strategic Plan 2025-2030, Digital Strategy",
    },
    {
      type: "input",
      name: "principles",
      message: "Architecture principles (comma-separated):",
      default: current.strategy.principles.join(", ") || "Buy over build, Microsoft-first platform alignment",
    },
    {
      type: "input",
      name: "reviewBody",
      message: "Governance review body:",
      default: current.governance.review_body || "Technology Review Board (TRB)",
    },
    {
      type: "input",
      name: "submissionFormat",
      message: "Submission format:",
      default: current.governance.submission_format || "TDA (Technical Design Architecture)",
    },
    {
      type: "input",
      name: "reviewCriteria",
      message: "Review criteria (comma-separated):",
      default: current.governance.review_criteria.join(", ") || "Strategic alignment, Security, Cost, Operational feasibility, Integration",
    },
    {
      type: "input",
      name: "teamName",
      message: "Your team:",
      default: current.team.name || "",
    },
    {
      type: "input",
      name: "teamParent",
      message: "Parent division:",
      default: current.team.parent || "",
    },
    {
      type: "input",
      name: "identity",
      message: "Identity platform:",
      default: current.platform.identity || "Microsoft Entra ID",
    },
    {
      type: "input",
      name: "cloud",
      message: "Cloud platform:",
      default: current.platform.cloud || "Microsoft Azure",
    },
    {
      type: "input",
      name: "productivity",
      message: "Productivity suite:",
      default: current.platform.productivity || "Microsoft 365",
    },
  ]);

  const split = (s: string): string[] =>
    s.split(",").map((v: string) => v.trim()).filter(Boolean);

  const orgContext = {
    organisation: { name: answers.orgName, abbreviation: answers.orgAbbrev },
    strategy: {
      pillars: split(answers.pillars),
      principles: split(answers.principles),
    },
    governance: {
      review_body: answers.reviewBody,
      submission_format: answers.submissionFormat,
      review_criteria: split(answers.reviewCriteria),
      known_biases: current.governance.known_biases,
    },
    team: {
      name: answers.teamName,
      parent: answers.teamParent,
      key_stakeholders: current.team.key_stakeholders,
    },
    platform: {
      identity: answers.identity,
      cloud: answers.cloud,
      productivity: answers.productivity,
      integrations: current.platform.integrations,
    },
  };

  saveOrgContext(orgContext);
  console.log(chalk.green(`\n  ✓ Saved to ${getConfigDir()}/org-context.json\n`));
}

export async function configShowCommand(): Promise<void> {
  const chalk = (await import("chalk")).default;
  const ctx = loadOrgContext();

  console.log();
  console.log(chalk.bold("  Current configuration:"));
  console.log();
  console.log(chalk.gray(`  Config dir: ${getConfigDir()}`));
  console.log();
  console.log(JSON.stringify(ctx, null, 2).split("\n").map((l) => `  ${l}`).join("\n"));
  console.log();
}
