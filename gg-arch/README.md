# gg-arch

A thinking tool for solution architects. Structured adversarial review for architecture decisions.

## What it does

Feed in an architecture decision. Get back:

1. **Tension map** — the competing concerns your decision must navigate
2. **Reviewer personas** — calibrated governance reviewers mapped to your tensions
3. **Adversarial review** — each persona critiques your decision, you respond
4. **Decision record** — structured reasoning trace capturing *why*, not just *what*

The tool learns your governance environment over time. Reviewer personas calibrate from past reviews. Patterns emerge from accumulated sessions.

## Quick start

```bash
# Clone and install
git clone https://github.com/KenKaiii/gg-arch.git
cd gg-arch
pnpm install
pnpm build

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Configure your org context
pnpm --filter ggarch dev -- config org

# Run your first review
pnpm --filter ggarch dev -- review
```

## Architecture

Three-package monorepo:

```
packages/
  gg-ai/      Memory layer (org context, decisions, patterns)
  gg-agent/   LLM client with Zod-validated JSON responses
  ggarch/     CLI + domain tools (tensions, personas, reviews, records)
```

## Commands

```bash
gg-arch review                          # Interactive review pipeline
gg-arch review --input ./tda-draft.md   # From file
gg-arch decisions list                  # List past decisions
gg-arch decisions view <id>             # View decision record
gg-arch decisions outcome <id> -s approved -n "TRB approved"
gg-arch decisions search identity       # Search by keyword
gg-arch decisions export <id> -f md     # Export as markdown
gg-arch patterns                        # View learned patterns
gg-arch config org                      # Configure org context
gg-arch config show                     # Show config
```

## Memory

Stored in `~/.gg-arch/`:

- `org-context.json` — organisational constants (strategy, governance, platform)
- `decisions.json` — past decisions with reasoning traces
- `patterns.json` — learned reviewer/framing/governance patterns

## License

MIT
