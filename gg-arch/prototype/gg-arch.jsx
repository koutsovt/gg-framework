import { useState, useRef, useEffect } from "react";

const PHASES = ["context", "tensions", "personas", "review", "record"];
const PHASE_LABELS = {
  context: "Decision Context",
  tensions: "Tension Map",
  personas: "Reviewer Personas",
  review: "Adversarial Review",
  record: "Decision Record",
};

const SYSTEM_PROMPT = `You are gg-arch, a thinking tool for solution architects. You help architects stress-test architecture decisions through structured adversarial review.

You operate in a specific phase-based pipeline. Always respond ONLY in valid JSON matching the requested schema. No markdown, no preamble, no backticks.`;

const TENSION_PROMPT = (context) => `Analyse this architecture decision context and extract the key tensions — competing concerns that the architect must navigate.

CONTEXT:
${context}

Respond with ONLY a JSON object matching this schema:
{
  "tensions": [
    {
      "id": "t1",
      "label": "Short label e.g. Security vs Adoption Speed",
      "pole_a": "One side of the tension",
      "pole_b": "The other side",
      "severity": "high" | "medium" | "low",
      "description": "Why this tension matters for this specific decision"
    }
  ],
  "summary": "One paragraph summarising the overall tension landscape"
}

Extract 4-7 tensions. Be specific to the decision context, not generic.`;

const PERSONA_PROMPT = (context, tensions) => `Based on this architecture decision context and tension map, generate reviewer personas who would evaluate this decision in a governance review.

CONTEXT:
${context}

TENSIONS:
${JSON.stringify(tensions, null, 2)}

Respond with ONLY a JSON object matching this schema:
{
  "personas": [
    {
      "id": "p1",
      "name": "The [Role] Reviewer",
      "perspective": "What they care about most",
      "background": "Brief background that explains their viewpoint",
      "likely_concerns": ["concern1", "concern2"],
      "communication_style": "How they typically deliver feedback",
      "relevant_tensions": ["t1", "t2"]
    }
  ]
}

Generate exactly 5 personas. Each should map to specific tensions. Make them feel like real governance reviewers, not caricatures.`;

const REVIEW_PROMPT = (context, tensions, persona) => `You are now acting as this specific reviewer persona. Review the architecture decision and provide your critique.

DECISION CONTEXT:
${context}

TENSIONS IN PLAY:
${JSON.stringify(tensions, null, 2)}

YOUR PERSONA:
${JSON.stringify(persona, null, 2)}

Stay in character. Be specific and constructive. Reference the actual details of the decision, not generic advice.

Respond with ONLY a JSON object:
{
  "verdict": "approve" | "approve_with_conditions" | "request_changes" | "reject",
  "confidence": "high" | "medium" | "low",
  "key_concern": "The single most important issue from your perspective",
  "detailed_feedback": "2-3 paragraphs of specific, actionable feedback in character",
  "questions": ["Specific question 1", "Specific question 2"],
  "conditions": ["Condition for approval 1", "Condition 2"] 
}`;

const RECORD_PROMPT = (context, tensions, personas, reviews, responses) => `Synthesise the entire adversarial review into a structured decision record.

ORIGINAL CONTEXT:
${context}

TENSIONS IDENTIFIED:
${JSON.stringify(tensions, null, 2)}

REVIEWER PERSONAS AND THEIR CRITIQUES:
${JSON.stringify(reviews, null, 2)}

ARCHITECT'S RESPONSES TO CRITIQUES:
${JSON.stringify(responses, null, 2)}

Produce a decision record. Respond with ONLY a JSON object:
{
  "decision_title": "Short title for the decision",
  "decision_date": "${new Date().toISOString().split("T")[0]}",
  "summary": "2-3 sentence summary of the decision and outcome",
  "tensions_navigated": [
    {
      "tension": "Label",
      "resolution": "How it was resolved or accepted",
      "tradeoff_accepted": "What was given up"
    }
  ],
  "objections_addressed": [
    {
      "reviewer": "Persona name",
      "objection": "Their key concern",
      "response": "How it was addressed",
      "status": "resolved" | "accepted_risk" | "deferred"
    }
  ],
  "conditions_for_success": ["condition1", "condition2"],
  "open_risks": ["risk1", "risk2"],
  "reasoning_trace": "A narrative paragraph capturing WHY this decision was made the way it was — the reasoning that would otherwise be lost"
}`;

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    console.error("Parse error:", text);
    return null;
  }
}

const VERDICT_COLORS = {
  approve: { bg: "#ecfdf5", border: "#6ee7b7", text: "#065f46", label: "Approve" },
  approve_with_conditions: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", label: "Approve with Conditions" },
  request_changes: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412", label: "Request Changes" },
  reject: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", label: "Reject" },
};

const SEVERITY_COLORS = {
  high: { bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
  medium: { bg: "#fffbeb", border: "#fcd34d", dot: "#f59e0b" },
  low: { bg: "#f0fdf4", border: "#86efac", dot: "#22c55e" },
};

function PhaseNav({ phase, completedPhases }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 32 }}>
      {PHASES.map((p, i) => {
        const active = p === phase;
        const done = completedPhases.includes(p);
        return (
          <div key={p} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 600,
                  background: active ? "#1e293b" : done ? "#475569" : "#e2e8f0",
                  color: active || done ? "#fff" : "#94a3b8",
                  transition: "all 0.3s ease",
                }}
              >
                {done && !active ? "✓" : i + 1}
              </div>
              <div style={{
                fontSize: 11, fontWeight: active ? 700 : 500, marginTop: 6,
                color: active ? "#1e293b" : done ? "#475569" : "#94a3b8",
                letterSpacing: "0.02em", textTransform: "uppercase",
              }}>
                {PHASE_LABELS[p]}
              </div>
            </div>
            {i < PHASES.length - 1 && (
              <div style={{
                height: 2, flex: "0 0 40px",
                background: done ? "#475569" : "#e2e8f0",
                marginBottom: 20, transition: "background 0.3s ease",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingDots({ text }) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const iv = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "24px 0",
      color: "#64748b", fontSize: 15, fontStyle: "italic",
    }}>
      <div style={{
        width: 20, height: 20, border: "2.5px solid #cbd5e1",
        borderTopColor: "#1e293b", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      {text}{dots}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function TensionCard({ t }) {
  const sc = SEVERITY_COLORS[t.severity] || SEVERITY_COLORS.medium;
  return (
    <div style={{
      background: "#fff", border: `1px solid ${sc.border}`, borderRadius: 10,
      padding: 18, marginBottom: 12, borderLeft: `4px solid ${sc.dot}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{t.label}</div>
        <div style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
          padding: "3px 8px", borderRadius: 4, background: sc.bg, color: sc.dot, border: `1px solid ${sc.border}`,
        }}>{t.severity}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, padding: "8px 10px", background: "#f8fafc", borderRadius: 6, fontSize: 13, color: "#475569" }}>
          <span style={{ fontWeight: 600 }}>↔</span> {t.pole_a}
        </div>
        <div style={{ flex: 1, padding: "8px 10px", background: "#f8fafc", borderRadius: 6, fontSize: 13, color: "#475569", textAlign: "right" }}>
          {t.pole_b} <span style={{ fontWeight: 600 }}>↔</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{t.description}</div>
    </div>
  );
}

function PersonaCard({ persona, onSelect, selected, hasReview }) {
  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? "#f8fafc" : "#fff",
        border: `1.5px solid ${selected ? "#1e293b" : "#e2e8f0"}`,
        borderRadius: 10, padding: 16, cursor: "pointer",
        transition: "all 0.2s ease", marginBottom: 10,
        boxShadow: selected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{persona.name}</div>
        {hasReview && <div style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Reviewed</div>}
      </div>
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 8, fontStyle: "italic" }}>{persona.perspective}</div>
      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{persona.background}</div>
      {selected && persona.likely_concerns && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Likely Concerns</div>
          {persona.likely_concerns.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: "#475569", padding: "3px 0" }}>• {c}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ review, persona, response, onRespond }) {
  const [text, setText] = useState(response || "");
  const vc = VERDICT_COLORS[review.verdict] || VERDICT_COLORS.approve_with_conditions;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#1e293b" }}>{persona.name}</div>
        <div style={{
          padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
          background: vc.bg, color: vc.text, border: `1px solid ${vc.border}`,
        }}>{vc.label}</div>
      </div>
      <div style={{
        background: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 16,
        borderLeft: `3px solid ${vc.border}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Key Concern</div>
        <div style={{ fontSize: 14, color: "#1e293b", fontWeight: 600 }}>{review.key_concern}</div>
      </div>
      <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>
        {review.detailed_feedback}
      </div>
      {review.questions?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Questions for the Architect</div>
          {review.questions.map((q, i) => (
            <div key={i} style={{ fontSize: 13, color: "#475569", padding: "4px 0", paddingLeft: 12, borderLeft: "2px solid #e2e8f0" }}>{q}</div>
          ))}
        </div>
      )}
      {review.conditions?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Conditions</div>
          {review.conditions.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: "#475569", padding: "4px 0", paddingLeft: 12, borderLeft: "2px solid #fcd34d" }}>{c}</div>
          ))}
        </div>
      )}
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Your Response</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Address the concerns, accept the risk, or note what you'll change..."
          style={{
            width: "100%", minHeight: 100, padding: 12, borderRadius: 8,
            border: "1.5px solid #e2e8f0", fontSize: 14, fontFamily: "inherit",
            color: "#334155", lineHeight: 1.6, resize: "vertical",
            background: "#fafafa", boxSizing: "border-box",
          }}
        />
        <button
          onClick={() => onRespond(text)}
          disabled={!text.trim()}
          style={{
            marginTop: 8, padding: "8px 20px", borderRadius: 6,
            background: text.trim() ? "#1e293b" : "#e2e8f0",
            color: text.trim() ? "#fff" : "#94a3b8",
            border: "none", fontSize: 13, fontWeight: 600, cursor: text.trim() ? "pointer" : "default",
          }}
        >
          Submit Response
        </button>
      </div>
    </div>
  );
}

function DecisionRecord({ record }) {
  if (!record) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: "#1e293b", padding: "20px 24px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Decision Record</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{record.decision_title}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{record.decision_date}</div>
      </div>
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 15, color: "#334155", lineHeight: 1.7, marginBottom: 24, fontStyle: "italic", borderLeft: "3px solid #cbd5e1", paddingLeft: 16 }}>
          {record.summary}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Tensions Navigated</div>
        {record.tensions_navigated?.map((t, i) => (
          <div key={i} style={{ background: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 8, border: "1px solid #e2e8f0" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 4 }}>{t.tension}</div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}><strong>Resolution:</strong> {t.resolution}</div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}><strong>Tradeoff:</strong> {t.tradeoff_accepted}</div>
          </div>
        ))}

        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, marginTop: 24 }}>Objections Addressed</div>
        {record.objections_addressed?.map((o, i) => {
          const statusColor = o.status === "resolved" ? "#059669" : o.status === "accepted_risk" ? "#d97706" : "#6366f1";
          return (
            <div key={i} style={{ background: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{o.reviewer}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: statusColor, textTransform: "uppercase" }}>{o.status?.replace("_", " ")}</div>
              </div>
              <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}><strong>Objection:</strong> {o.objection}</div>
              <div style={{ fontSize: 13, color: "#475569" }}><strong>Response:</strong> {o.response}</div>
            </div>
          );
        })}

        {record.conditions_for_success?.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, marginTop: 24 }}>Conditions for Success</div>
            {record.conditions_for_success.map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: "#475569", padding: "6px 0 6px 14px", borderLeft: "2px solid #6ee7b7" }}>{c}</div>
            ))}
          </>
        )}

        {record.open_risks?.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, marginTop: 24 }}>Open Risks</div>
            {record.open_risks.map((r, i) => (
              <div key={i} style={{ fontSize: 13, color: "#475569", padding: "6px 0 6px 14px", borderLeft: "2px solid #fca5a5" }}>{r}</div>
            ))}
          </>
        )}

        {record.reasoning_trace && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, marginTop: 24 }}>Reasoning Trace</div>
            <div style={{
              fontSize: 14, color: "#334155", lineHeight: 1.7,
              background: "#fffbeb", borderRadius: 8, padding: 16,
              border: "1px solid #fcd34d", whiteSpace: "pre-wrap",
            }}>
              {record.reasoning_trace}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function GGArch() {
  const [phase, setPhase] = useState("context");
  const [completedPhases, setCompletedPhases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState(null);

  const [context, setContext] = useState("");
  const [tensions, setTensions] = useState(null);
  const [tensionSummary, setTensionSummary] = useState("");
  const [personas, setPersonas] = useState(null);
  const [selectedPersona, setSelectedPersona] = useState(0);
  const [reviews, setReviews] = useState({});
  const [responses, setResponses] = useState({});
  const [record, setRecord] = useState(null);
  const [currentReviewIdx, setCurrentReviewIdx] = useState(0);

  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase]);

  const markComplete = (p) => setCompletedPhases((prev) => prev.includes(p) ? prev : [...prev, p]);

  const handleAnalyseTensions = async () => {
    if (!context.trim()) return;
    setLoading(true);
    setLoadingText("Analysing decision context and extracting tensions");
    setError(null);
    try {
      const result = await callClaude(TENSION_PROMPT(context));
      if (result?.tensions) {
        setTensions(result.tensions);
        setTensionSummary(result.summary || "");
        markComplete("context");
        setPhase("tensions");
      } else {
        setError("Failed to parse tension analysis. Please try again.");
      }
    } catch (e) {
      setError("API call failed: " + e.message);
    }
    setLoading(false);
  };

  const handleGeneratePersonas = async () => {
    setLoading(true);
    setLoadingText("Generating reviewer personas from tension map");
    setError(null);
    try {
      const result = await callClaude(PERSONA_PROMPT(context, tensions));
      if (result?.personas) {
        setPersonas(result.personas);
        markComplete("tensions");
        setPhase("personas");
      } else {
        setError("Failed to generate personas. Please try again.");
      }
    } catch (e) {
      setError("API call failed: " + e.message);
    }
    setLoading(false);
  };

  const handleStartReviews = async () => {
    markComplete("personas");
    setPhase("review");
    setCurrentReviewIdx(0);
    await runReview(0);
  };

  const runReview = async (idx) => {
    if (!personas || idx >= personas.length) return;
    const persona = personas[idx];
    setLoading(true);
    setLoadingText(`${persona.name} is reviewing your decision`);
    setError(null);
    try {
      const result = await callClaude(REVIEW_PROMPT(context, tensions, persona));
      if (result) {
        setReviews((prev) => ({ ...prev, [persona.id]: result }));
        setSelectedPersona(idx);
      } else {
        setError("Failed to get review. Please try again.");
      }
    } catch (e) {
      setError("API call failed: " + e.message);
    }
    setLoading(false);
  };

  const handleRespond = (personaId, text) => {
    setResponses((prev) => ({ ...prev, [personaId]: text }));
    const nextIdx = currentReviewIdx + 1;
    if (nextIdx < personas.length) {
      setCurrentReviewIdx(nextIdx);
      if (!reviews[personas[nextIdx].id]) {
        runReview(nextIdx);
      } else {
        setSelectedPersona(nextIdx);
      }
    }
  };

  const allReviewed = personas && Object.keys(responses).length === personas.length;

  const handleGenerateRecord = async () => {
    setLoading(true);
    setLoadingText("Synthesising decision record from all reviews and responses");
    setError(null);
    try {
      const reviewData = personas.map((p) => ({
        persona: p.name,
        review: reviews[p.id],
        architect_response: responses[p.id],
      }));
      const result = await callClaude(RECORD_PROMPT(context, tensions, personas, reviewData, responses));
      if (result) {
        setRecord(result);
        markComplete("review");
        setPhase("record");
        markComplete("record");
      } else {
        setError("Failed to generate record. Please try again.");
      }
    } catch (e) {
      setError("API call failed: " + e.message);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setPhase("context");
    setCompletedPhases([]);
    setContext("");
    setTensions(null);
    setTensionSummary("");
    setPersonas(null);
    setSelectedPersona(0);
    setReviews({});
    setResponses({});
    setRecord(null);
    setCurrentReviewIdx(0);
    setError(null);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f1f5f9",
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{
        background: "#1e293b", padding: "20px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: "#fff",
            fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em",
          }}>
            gg-arch
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, letterSpacing: "0.04em" }}>
            Structured adversarial review for architecture decisions
          </div>
        </div>
        {phase !== "context" && (
          <button
            onClick={handleReset}
            style={{
              padding: "6px 16px", borderRadius: 6, background: "transparent",
              color: "#94a3b8", border: "1px solid #475569", fontSize: 12,
              fontWeight: 600, cursor: "pointer",
            }}
          >
            New Decision
          </button>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }} ref={scrollRef}>
        <PhaseNav phase={phase} completedPhases={completedPhases} />

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
            padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#991b1b",
          }}>
            {error}
          </div>
        )}

        {phase === "context" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
              Describe your architecture decision
            </div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
              Paste your TDA draft, describe the decision space, or outline the technical design you need reviewed. Include stakeholder context, constraints, and what you're trying to achieve.
            </div>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={"Example: I need to design the identity and access management architecture for deploying ChatGPT Edu at La Trobe University.\n\nKey constraints:\n- Must integrate with existing Entra ID tenant\n- SAML SSO required for all users\n- SCIM provisioning for automated user lifecycle\n- RBAC groups needed for different access tiers (staff, students, AI champions)\n- M365 licence tiers affect available security controls (MDCA, Conditional Access)\n- Must align with broader Enrolment Identity Modernisation roadmap\n\nStakeholders: IT Security, AIEO, Faculty Deans, IT Operations, Students"}
              style={{
                width: "100%", minHeight: 280, padding: 18, borderRadius: 10,
                border: "1.5px solid #e2e8f0", fontSize: 14, fontFamily: "inherit",
                color: "#334155", lineHeight: 1.7, resize: "vertical",
                background: "#fff", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {context.length > 0 ? `${context.length} characters` : ""}
              </div>
              <button
                onClick={handleAnalyseTensions}
                disabled={!context.trim() || loading}
                style={{
                  padding: "10px 28px", borderRadius: 8,
                  background: context.trim() && !loading ? "#1e293b" : "#e2e8f0",
                  color: context.trim() && !loading ? "#fff" : "#94a3b8",
                  border: "none", fontSize: 14, fontWeight: 600,
                  cursor: context.trim() && !loading ? "pointer" : "default",
                }}
              >
                Analyse Tensions →
              </button>
            </div>
            {loading && <LoadingDots text={loadingText} />}
          </div>
        )}

        {phase === "tensions" && tensions && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Tension Map</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
              These are the competing concerns your decision must navigate. Each tension represents a tradeoff space — there's no right answer, only a position you choose and defend.
            </div>
            {tensionSummary && (
              <div style={{
                background: "#fff", borderRadius: 10, padding: 16, marginBottom: 20,
                border: "1px solid #e2e8f0", fontSize: 14, color: "#334155",
                lineHeight: 1.7, fontStyle: "italic",
              }}>
                {tensionSummary}
              </div>
            )}
            {tensions.map((t, i) => <TensionCard key={i} t={t} />)}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={handleGeneratePersonas}
                disabled={loading}
                style={{
                  padding: "10px 28px", borderRadius: 8,
                  background: loading ? "#e2e8f0" : "#1e293b",
                  color: loading ? "#94a3b8" : "#fff",
                  border: "none", fontSize: 14, fontWeight: 600,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                Generate Reviewers →
              </button>
            </div>
            {loading && <LoadingDots text={loadingText} />}
          </div>
        )}

        {phase === "personas" && personas && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Reviewer Personas</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
              These reviewers will evaluate your decision from different perspectives. Each maps to specific tensions in your decision space.
            </div>
            {personas.map((p, i) => (
              <PersonaCard
                key={p.id}
                persona={p}
                selected={selectedPersona === i}
                onSelect={() => setSelectedPersona(i)}
                hasReview={false}
              />
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={handleStartReviews}
                disabled={loading}
                style={{
                  padding: "10px 28px", borderRadius: 8,
                  background: "#1e293b", color: "#fff",
                  border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Start Reviews →
              </button>
            </div>
          </div>
        )}

        {phase === "review" && personas && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Adversarial Review</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
              Each reviewer critiques your decision. Respond to their concerns — address them, accept the risk, or note what you'll change. All {personas.length} reviews must be addressed to generate the decision record.
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {personas.map((p, i) => {
                const hasReview = !!reviews[p.id];
                const hasResponse = !!responses[p.id];
                const isActive = i === selectedPersona;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPersona(i); if (!reviews[p.id]) runReview(i); }}
                    style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${isActive ? "#1e293b" : hasResponse ? "#6ee7b7" : hasReview ? "#fcd34d" : "#e2e8f0"}`,
                      background: isActive ? "#1e293b" : hasResponse ? "#ecfdf5" : hasReview ? "#fffbeb" : "#fff",
                      color: isActive ? "#fff" : "#334155",
                      cursor: "pointer",
                    }}
                  >
                    {hasResponse ? "✓ " : ""}{p.name.replace("The ", "").replace(" Reviewer", "")}
                  </button>
                );
              })}
            </div>

            {loading && <LoadingDots text={loadingText} />}

            {!loading && personas[selectedPersona] && reviews[personas[selectedPersona].id] && (
              <ReviewPanel
                review={reviews[personas[selectedPersona].id]}
                persona={personas[selectedPersona]}
                response={responses[personas[selectedPersona].id]}
                onRespond={(text) => handleRespond(personas[selectedPersona].id, text)}
              />
            )}

            {allReviewed && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  onClick={handleGenerateRecord}
                  disabled={loading}
                  style={{
                    padding: "10px 28px", borderRadius: 8,
                    background: loading ? "#e2e8f0" : "#1e293b",
                    color: loading ? "#94a3b8" : "#fff",
                    border: "none", fontSize: 14, fontWeight: 600,
                    cursor: loading ? "default" : "pointer",
                  }}
                >
                  Generate Decision Record →
                </button>
              </div>
            )}
            {loading && allReviewed && <LoadingDots text={loadingText} />}
          </div>
        )}

        {phase === "record" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Decision Record</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
              This captures the full reasoning trace — tensions navigated, objections addressed, tradeoffs accepted. The part that usually lives only in the architect's head.
            </div>
            <DecisionRecord record={record} />
          </div>
        )}
      </div>
    </div>
  );
}
