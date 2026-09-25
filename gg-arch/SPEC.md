# gg-arch — Project Specification

## Memory Schemas

### Org Context (`~/.gg-arch/org-context.json`)

```json
{
  "organisation": {
    "name": "La Trobe University",
    "abbreviation": "LTU"
  },
  "strategy": {
    "pillars": [
      "Strategic Plan 2025-2030",
      "Digital Strategy"
    ],
    "principles": [
      "Buy over build",
      "Microsoft-first platform alignment",
      "Anthropic as primary AI model provider"
    ]
  },
  "governance": {
    "review_body": "Technology Review Board (TRB)",
    "submission_format": "TDA (Technical Design Architecture)",
    "review_criteria": [
      "Strategic alignment",
      "Security and compliance",
      "Cost and licensing",
      "Operational feasibility",
      "Integration architecture"
    ],
    "known_biases": []
  },
  "team": {
    "name": "AI Enablement & Organisational (AIEO)",
    "parent": "Digital Strategy & Engagement (DS&E)",
    "key_stakeholders": []
  },
  "platform": {
    "identity": "Microsoft Entra ID",
    "cloud": "Microsoft Azure",
    "productivity": "Microsoft 365",
    "integrations": []
  }
}
```

### Decisions (`~/.gg-arch/decisions.json`)

```json
{
  "decisions": [
    {
      "id": "string (kebab-case slug)",
      "date": "YYYY-MM-DD",
      "title": "Human-readable decision title",
      "context_summary": "Brief description of what was decided",
      "tensions": [
        {
          "label": "Tension label",
          "resolution": "How it was resolved",
          "tradeoff_accepted": "What was given up"
        }
      ],
      "objections": [
        {
          "reviewer_type": "Security | Strategic | Operational | Cost | Stakeholder",
          "concern": "The key concern raised",
          "response": "How the architect addressed it",
          "status": "resolved | accepted_risk | deferred"
        }
      ],
      "reasoning_trace": "Narrative paragraph capturing why",
      "outcome": {
        "status": "approved | approved_with_conditions | sent_back | pending | null",
        "date": "YYYY-MM-DD | null",
        "notes": "What actually happened"
      },
      "tags": ["identity", "ai", "integration"]
    }
  ]
}
```

### Learned Patterns (`~/.gg-arch/patterns.json`)

```json
{
  "reviewer_patterns": [
    {
      "reviewer_type": "Security",
      "pattern": "Always asks about identity lifecycle management",
      "confidence": "high",
      "evidence_count": 3,
      "first_seen": "2026-03-26",
      "last_seen": "2026-03-26"
    }
  ],
  "framing_patterns": [
    {
      "pattern": "Cost arguments require three-year TCO framing to land",
      "confidence": "medium",
      "evidence_count": 2
    }
  ],
  "governance_patterns": [
    {
      "pattern": "TRB values strategic alignment over technical elegance",
      "confidence": "high",
      "evidence_count": 5
    }
  ]
}
```

## Prompt Templates

Each prompt template is a function that takes structured inputs and returns a string. All prompts instruct the model to respond ONLY in valid JSON matching a provided schema. No markdown, no preamble, no backticks.

### System Prompt (frozen after session init)

```
You are gg-arch, a thinking tool for solution architects. You help architects stress-test architecture decisions through structured adversarial review.

You operate in a phase-based pipeline. Always respond ONLY in valid JSON matching the requested schema. No markdown, no preamble, no backticks.

ORGANISATIONAL CONTEXT:
{org_context}

LEARNED PATTERNS:
{patterns}
```

### Phase Prompts

1. **extract-tensions(context: string) → TensionMap**
2. **generate-personas(context: string, tensions: Tension[], precedents?: Decision[]) → Persona[]**
3. **run-review(context: string, tensions: Tension[], persona: Persona) → Review**
4. **synthesise-record(context, tensions, reviews, responses) → DecisionRecord**
5. **test-narrative(framing: string, persona: Persona) → NarrativeAssessment**
6. **extract-stakeholders(document: string) → StakeholderMap**
7. **compare-precedent(context: string, decisions: Decision[]) → PrecedentComparison**

## Zod Schemas

Define these as the source of truth for all data flowing through the system:

```typescript
// packages/ggarch/src/schemas.ts

const TensionSchema = z.object({
  id: z.string(),
  label: z.string(),
  pole_a: z.string(),
  pole_b: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  description: z.string(),
});

const TensionMapSchema = z.object({
  tensions: z.array(TensionSchema),
  summary: z.string(),
});

const PersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  perspective: z.string(),
  background: z.string(),
  likely_concerns: z.array(z.string()),
  communication_style: z.string(),
  relevant_tensions: z.array(z.string()),
});

const ReviewSchema = z.object({
  verdict: z.enum(["approve", "approve_with_conditions", "request_changes", "reject"]),
  confidence: z.enum(["high", "medium", "low"]),
  key_concern: z.string(),
  detailed_feedback: z.string(),
  questions: z.array(z.string()),
  conditions: z.array(z.string()),
});

const DecisionRecordSchema = z.object({
  decision_title: z.string(),
  decision_date: z.string(),
  summary: z.string(),
  tensions_navigated: z.array(z.object({
    tension: z.string(),
    resolution: z.string(),
    tradeoff_accepted: z.string(),
  })),
  objections_addressed: z.array(z.object({
    reviewer: z.string(),
    objection: z.string(),
    response: z.string(),
    status: z.enum(["resolved", "accepted_risk", "deferred"]),
  })),
  conditions_for_success: z.array(z.string()),
  open_risks: z.array(z.string()),
  reasoning_trace: z.string(),
});

const OutcomeSchema = z.object({
  status: z.enum(["approved", "approved_with_conditions", "sent_back", "rejected", "pending"]),
  date: z.string().nullable(),
  notes: z.string(),
});
```

## CLI Command Structure

```
gg-arch
├── review                    # Start interactive decision review pipeline
│   ├── --input <file>        # Read context from file (md, txt, docx)
│   ├── --context <string>    # Inline context
│   ├── --personas <n>        # Number of personas (default: 5)
│   └── --model <model>       # Override LLM model
├── decisions
│   ├── list                  # List all past decisions
│   ├── view <id>             # View specific decision record
│   ├── outcome <id>          # Update decision outcome
│   │   ├── --status <s>
│   │   └── --notes <string>
│   ├── search <query>        # Search decisions by keyword
│   └── export <id>           # Export decision record
│       └── --format <md|json|pptx>
├── patterns                  # View learned patterns
│   └── --type <reviewer|framing|governance>
├── config
│   ├── org                   # Edit org context interactively
│   ├── model                 # Set default model
│   └── show                  # Show current config
└── version
```

## Interactive Review Flow (CLI)

The `gg-arch review` command runs an interactive terminal session:

```
$ gg-arch review --input ./chatgpt-edu-tda.md

  gg-arch · Structured adversarial review

  ▸ Phase 1/5 · Analysing decision context...

  Found 6 tensions:

  ■ HIGH   Security vs Adoption Speed
           Enforced SAML SSO is more secure but creates friction
  ■ HIGH   Data Sovereignty vs Feature Access
           MDCA controls protect data but may limit functionality
  ■ MED    Granular RBAC vs Administrative Simplicity
           More role groups = better control, more maintenance
  ■ MED    Strategic Alignment vs Tactical Expedience
           Architecture should align with Entra ID modernisation
  ■ LOW    Inclusive Access vs Risk Management
           HDR students need access, but group mapping is complex
  ■ LOW    Vendor Flexibility vs Platform Depth
           OpenAI dependency vs multi-vendor optionality

  Proceed to persona generation? [Y/n]

  ▸ Phase 2/5 · Generating reviewer personas...

  5 reviewers ready:

  1. The Security Reviewer
     Focuses on data flows, conditional access, identity lifecycle
  2. The Strategic Alignment Reviewer
     Checks fit with Strategic Plan 2025-2030 and Digital Strategy
  3. The Operational Feasibility Reviewer
     Asks about day-2 operations, RBAC maintenance, support model
  4. The Cost & Licensing Reviewer
     Examines M365 tier implications, hidden licensing costs, TCO
  5. The Stakeholder Impact Reviewer
     Evaluates change management, faculty adoption, student experience

  Start adversarial review? [Y/n]

  ▸ Phase 3/5 · The Security Reviewer is evaluating...

  ┌─────────────────────────────────────────────────┐
  │ VERDICT: Approve with Conditions                │
  │                                                 │
  │ Key Concern:                                    │
  │ The SCIM provisioning creates an identity       │
  │ lifecycle dependency that isn't addressed in     │
  │ the design. What happens when a student          │
  │ graduates mid-semester?                          │
  │                                                 │
  │ Questions:                                      │
  │ 1. Is there a deprovisioning SLA?               │
  │ 2. What happens to data when access is revoked? │
  │                                                 │
  │ Conditions:                                     │
  │ • Document identity lifecycle for all user types │
  │ • Define deprovisioning trigger and SLA          │
  └─────────────────────────────────────────────────┘

  Your response:
  ▸ _

```

## Package Dependencies

### Root
- pnpm workspaces
- typescript 5.x
- tsup
- vitest

### packages/gg-ai
- zod
- (no LLM dependency — pure data/memory layer)

### packages/gg-agent
- @anthropic-ai/sdk
- zod
- ora (terminal spinner)
- chalk (terminal colours)
- inquirer (interactive prompts)

### packages/ggarch
- zod
- commander (CLI framework)
- (imports from gg-ai and gg-agent)

## File Structure

```
gg-arch/
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── gg-ai/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── memory/
│   │   │   │   ├── org-context.ts      # Load/save org context
│   │   │   │   ├── decisions.ts        # Load/save/query decisions
│   │   │   │   ├── patterns.ts         # Load/save/update patterns
│   │   │   │   └── types.ts            # Memory type definitions
│   │   │   └── prompt/
│   │   │       ├── builder.ts          # System prompt assembly
│   │   │       └── templates.ts        # Prompt template functions
│   │   └── tests/
│   ├── gg-agent/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── loop/
│   │   │   │   ├── pipeline.ts         # Phase-based pipeline orchestrator
│   │   │   │   └── phases.ts           # Phase definitions and transitions
│   │   │   ├── llm/
│   │   │   │   ├── client.ts           # Anthropic API client wrapper
│   │   │   │   └── parse.ts            # JSON response parsing + Zod validation
│   │   │   └── ui/
│   │   │       ├── terminal.ts         # Terminal output formatting
│   │   │       └── prompts.ts          # Interactive input prompts
│   │   └── tests/
│   └── ggarch/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── bin.ts                  # CLI entry point
│       │   ├── schemas.ts              # All Zod schemas
│       │   ├── tools/
│       │   │   ├── extract-tensions.ts
│       │   │   ├── generate-personas.ts
│       │   │   ├── run-review.ts
│       │   │   ├── synthesise-record.ts
│       │   │   ├── test-narrative.ts
│       │   │   ├── extract-stakeholders.ts
│       │   │   └── compare-precedent.ts
│       │   ├── commands/
│       │   │   ├── review.ts           # Interactive review command
│       │   │   ├── decisions.ts        # Decision management commands
│       │   │   ├── patterns.ts         # Pattern viewing command
│       │   │   ├── config.ts           # Configuration commands
│       │   │   └── export.ts           # Export command
│       │   └── prompts/
│       │       ├── system.ts           # System prompt template
│       │       ├── tension.ts          # Tension extraction prompt
│       │       ├── persona.ts          # Persona generation prompt
│       │       ├── review.ts           # Review prompt
│       │       ├── record.ts           # Decision record prompt
│       │       └── narrative.ts        # Narrative testing prompt
│       └── tests/
└── prototype/
    └── gg-arch.jsx                     # React prototype (reference implementation)
```

## Post-Session Pattern Learning

After each completed review session, before saving the decision record:

1. Compare current review outcomes against `patterns.json`
2. If a reviewer type raised a concern matching an existing pattern, increment `evidence_count`
3. If a new pattern is detected (concern type not seen before), prompt the architect: "I noticed the Security Reviewer flagged identity lifecycle management. This is the first time this has come up. Should I track this as a pattern?"
4. If the architect's response successfully addressed an objection using a specific framing, note the framing pattern
5. Save updated patterns

This is the mechanism by which the tool learns the governance environment over time. It's explicit, architect-confirmed, and deterministic — not a black-box heuristic.
