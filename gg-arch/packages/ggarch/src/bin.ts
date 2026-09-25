#!/usr/bin/env node

import { Command } from "commander";
import { reviewCommand } from "./commands/review.js";
import { listDecisions, viewDecision, outcomeCommand, searchCommand } from "./commands/decisions.js";
import { patternsCommand } from "./commands/patterns.js";
import { configOrgCommand, configShowCommand } from "./commands/config.js";
import { exportCommand } from "./commands/export.js";

const program = new Command();

program
  .name("gg-arch")
  .description("A thinking tool for solution architects. Structured adversarial review for architecture decisions.")
  .version("0.1.0");

// ─── review ─────────────────────────────────────────────────

program
  .command("review")
  .description("Start an interactive decision review pipeline")
  .option("-i, --input <file>", "Read context from a file (md, txt)")
  .option("-c, --context <text>", "Inline context string")
  .option("-p, --personas <number>", "Number of reviewer personas", "5")
  .option("-m, --model <model>", "Override LLM model")
  .action(async (opts) => {
    await reviewCommand({
      input: opts.input,
      context: opts.context,
      personas: parseInt(opts.personas, 10),
      model: opts.model,
    });
  });

// ─── decisions ──────────────────────────────────────────────

const decisions = program
  .command("decisions")
  .description("Manage past decision records");

decisions
  .command("list")
  .description("List all past decisions")
  .action(async () => {
    await listDecisions();
  });

decisions
  .command("view <id>")
  .description("View a specific decision record")
  .action(async (id: string) => {
    await viewDecision(id);
  });

decisions
  .command("outcome <id>")
  .description("Update the outcome of a past decision")
  .requiredOption("-s, --status <status>", "Outcome status (approved, approved_with_conditions, sent_back, rejected, pending)")
  .option("-n, --notes <notes>", "Outcome notes", "")
  .action(async (id: string, opts: { status: string; notes: string }) => {
    await outcomeCommand(id, opts.status, opts.notes);
  });

decisions
  .command("search <query>")
  .description("Search decisions by keyword")
  .action(async (query: string) => {
    await searchCommand(query);
  });

decisions
  .command("export <id>")
  .description("Export a decision record")
  .option("-f, --format <format>", "Export format (md, json)", "md")
  .action(async (id: string, opts: { format: string }) => {
    await exportCommand(id, opts.format);
  });

// ─── patterns ───────────────────────────────────────────────

program
  .command("patterns")
  .description("View learned patterns from past reviews")
  .option("-t, --type <type>", "Filter by type (reviewer, framing, governance)")
  .action(async (opts) => {
    await patternsCommand(opts.type);
  });

// ─── config ─────────────────────────────────────────────────

const config = program
  .command("config")
  .description("Configure gg-arch settings");

config
  .command("org")
  .description("Configure organisational context interactively")
  .action(async () => {
    await configOrgCommand();
  });

config
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    await configShowCommand();
  });

// ─── Run ────────────────────────────────────────────────────

program.parse();
