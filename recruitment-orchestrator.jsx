import { useState, useEffect, useRef } from "react";

// ─── API & Model ─────────────────────────────────────────────────────────────
const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// ─── Design Tokens ───────────────────────────────────────────────────────────
const C = {
  bg: "#080A0D", surface: "#0E1118", card: "#131720",
  border: "#1A2035", borderHi: "#252E45",
  amber: "#F59E0B", amberBg: "#F59E0B18",
  green: "#22C55E", greenBg: "#22C55E18",
  blue: "#60A5FA", blueBg: "#60A5FA18",
  red: "#F87171", redBg: "#F8717118",
  t1: "#E8ECF5", t2: "#8892AA", t3: "#424E68",
};

// ─── Mock IT Candidates ───────────────────────────────────────────────────────
const CANDIDATES = [
  { id:1, name:"Sarah Chen",    title:"Senior React Developer", exp:7, loc:"Austin, TX",       visa:"Green Card", skills:["React","TypeScript","Node.js","AWS","GraphQL"],       rate:65, avail:"2 weeks" },
  { id:2, name:"Raj Patel",     title:"Full Stack Engineer",    exp:5, loc:"Houston, TX",       visa:"H1B",        skills:["React","Python","PostgreSQL","Docker","REST APIs"],    rate:58, avail:"Immediate" },
  { id:3, name:"Michael Torres",title:"Frontend Developer",     exp:3, loc:"New York, NY",      visa:"US Citizen", skills:["React","JavaScript","Redux","CSS","REST APIs"],        rate:48, avail:"Immediate" },
  { id:4, name:"Priya Kumar",   title:"Software Engineer",      exp:6, loc:"Seattle, WA",       visa:"H4 EAD",     skills:["React","TypeScript","Java","Kubernetes","AWS"],        rate:62, avail:"3 weeks"  },
  { id:5, name:"James Wilson",  title:"React/Node Developer",   exp:4, loc:"Chicago, IL",       visa:"US Citizen", skills:["React","Node.js","MongoDB","Express","Vue.js"],        rate:52, avail:"1 week"  },
];

// ─── Sample JD ────────────────────────────────────────────────────────────────
const SAMPLE_JD = `Position: Senior React Developer
Client: Leading FinTech Company
Location: Austin, TX (Hybrid – 3 days onsite)
Duration: 6 months contract (extension possible)
Bill Rate: $85–95/hr

Must Have:
- 5+ years of React development experience
- Strong TypeScript proficiency
- Node.js and RESTful APIs
- AWS experience (EC2, S3, Lambda)
- GraphQL

Nice to Have:
- FinTech or banking domain experience
- Docker / Kubernetes
- Redux or MobX state management

Visa: USC / GC Only
Start: ASAP`;

// ─── Agent System Prompts ─────────────────────────────────────────────────────
const PROMPTS = {
  jd: `You are a JD parsing specialist for a US IT staffing agency.
Return ONLY a valid JSON object — no markdown, no preamble, no explanation.

Schema:
{"role_title":"","client_industry":"","location":{"city":"","state":"","remote_ok":false,"hybrid":false},"duration":"","bill_rate":{"min":0,"max":0},"must_have_skills":[],"nice_to_have_skills":[],"experience_years":0,"visa_restrictions":"","start_date":"","priority":"urgent","flags":[]}

Rules: Extract only what is explicitly stated. Use null for missing fields. Add ambiguities to flags[].`,

  bool: `You are a Boolean search specialist for US IT staffing.
Return ONLY a valid JSON object — no markdown, no preamble, no explanation.

Schema:
{"jobdiva_strings":[{"label":"","purpose":"","string":""}],"linkedin_strings":[{"label":"","purpose":"","string":""}],"tips":[""]}

Generate 3 JobDiva strings and 3 LinkedIn RPS strings. Use AND/OR/NOT. Include skill synonyms and title variants. tips[] = 3 specific sourcing tips for this role.`,

  screen: `You are a candidate screener for US IT staffing.
Return ONLY a valid JSON object — no markdown, no preamble, no explanation.

Schema:
{"ranked_candidates":[{"id":0,"name":"","score":0,"grade":"A","skill_match":0,"exp_match":0,"loc_match":0,"rate_match":0,"visa_ok":true,"rec":"","flags":[],"proceed":true}],"summary":""}

Scoring: skill_match×0.4 + exp_match×0.3 + loc_match×0.2 + rate_match×0.1 = score (0–100). All sub-scores 0–100.
Grade: A≥85, B≥70, C≥55, D<55. proceed=true only if score≥70 AND visa_ok=true.
rec = one clear sentence on the candidate's fit.`,

  out: `You are an outreach writer for US IT staffing.
Return ONLY a valid JSON object — no markdown, no preamble, no explanation.

Schema:
{"candidates":[{"id":0,"name":"","email":{"subject":"","body":""},"inmail":{"subject":"","body":""},"rtr":{"subject":"","body":""}}]}

Rules: Reference the candidate's current title and one matching skill. Email body <120 words. InMail body <80 words.
RTR body must include: role title, client industry (NOT client name), location, rate range, and explicit consent statement asking them to reply with agreement.`,

  sub: `You are a submission quality specialist for US IT staffing.
Return ONLY a valid JSON object — no markdown, no preamble, no explanation.

Schema:
{"submissions":[{"id":0,"name":"","status":"ready","checks":{"rtr_signed":true,"resume_current":true,"rate_ok":true,"visa_ok":true,"format_ok":true},"client_email":{"subject":"","body":""},"jd_notes":"","action":null}],"ready":0,"held":0,"notes":""}

status="hold" if any check fails. For demo: assume rtr_signed=true and resume_current=true for all candidates.
client_email should be professional, reference role title and candidate name. jd_notes = JobDiva activity note (1 line). action = remediation required or null.`,
};

// ─── Claude API caller ────────────────────────────────────────────────────────
async function callAgent(systemPrompt, userContent) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  const t = d.content[0].text.trim();
  try { return JSON.parse(t); } catch {
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1].trim()); } catch {} }
    const j = t.match(/(\{[\s\S]*\})/s);
    if (j) { try { return JSON.parse(j[1]); } catch {} }
    throw new Error("Agent returned non-JSON response. Retry.");
  }
}

// ─── Small UI Components ──────────────────────────────────────────────────────
function Chip({ label, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600,
      fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".03em",
      whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function Spinner({ label = "Agent processing…" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 0" }}>
      <div style={{ width: 28, height: 28, border: `2px solid ${C.border}`, borderTopColor: C.amber, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      <span style={{ color: C.t3, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
    </div>
  );
}

function AgentCard({ title, badge, status, children }) {
  const isRunning = status === "running";
  const isDone = status === "done";
  return (
    <div style={{
      background: C.card, borderRadius: 10, padding: 16,
      border: `1px solid ${isRunning ? C.amber + "55" : isDone ? C.green + "44" : C.border}`,
      transition: "border-color .3s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isRunning && <span style={{ width: 8, height: 8, background: C.amber, borderRadius: "50%", display: "inline-block", animation: "pulse 1s infinite" }} />}
          {isDone && <span style={{ color: C.green, fontSize: 14, lineHeight: 1 }}>✓</span>}
          {status === "idle" && <span style={{ width: 8, height: 8, background: C.t3, borderRadius: "50%", display: "inline-block" }} />}
          <span style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>{title}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {badge && <Chip label={badge} color={C.blue} />}
          {isRunning && <Chip label="RUNNING" color={C.amber} />}
          {isDone && <Chip label="DONE" color={C.green} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ color: C.t3, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function InfoBox({ children, color = C.amber }) {
  return (
    <div style={{ background: color + "18", border: `1px solid ${color}33`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
      {children}
    </div>
  );
}

function DataGrid({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
      {items.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
        <div key={k} style={{ background: C.surface, borderRadius: 6, padding: "8px 10px" }}>
          <div style={{ color: C.t3, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>{k}</div>
          <div style={{ color: C.t1, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{String(v)}</div>
        </div>
      ))}
    </div>
  );
}

const gradeColor = g => ({ A: C.green, B: C.blue, C: C.amber, D: C.red }[g] || C.t2);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function App() {
  const [jd, setJd] = useState("");
  const [stage, setStage] = useState(0);   // how far pipeline has run
  const [view, setView] = useState(0);     // which tab user is viewing
  const [busy, setBusy] = useState({});
  const [fin, setFin] = useState({});
  const [err, setErr] = useState(null);
  const [approved, setApproved] = useState(new Set());
  const [msgTab, setMsgTab] = useState({});
  const resRef = useRef({ parsed: null, bools: null, scored: null, out: null, subs: null, approved: [] });
  const [res, setResState] = useState(resRef.current);

  function setRes(updater) {
    setResState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      resRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin  { to { transform: rotate(360deg); } }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      @keyframes fadeUp{ from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      * { box-sizing: border-box; }
      textarea { resize: vertical !important; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: ${C.bg}; }
      ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
    `;
    document.head.appendChild(style);
  }, []);

  const go = k => setBusy(p => ({ ...p, [k]: true }));
  const done = k => { setBusy(p => ({ ...p, [k]: false })); setFin(p => ({ ...p, [k]: true })); };

  // ── Orchestrator pipeline ──────────────────────────────────────────────────
  async function runPipeline() {
    setErr(null);
    if (!jd.trim()) { setErr("Please paste a job description first."); return; }

    // STAGE 1: JD Parser
    setStage(1); setView(1); go("jd");
    let parsed;
    try {
      parsed = await callAgent(PROMPTS.jd, `Parse this job description:\n\n${jd}`);
      setRes(p => ({ ...p, parsed })); done("jd");
    } catch (e) { setErr(`JD Parser failed: ${e.message}`); setBusy(p => ({ ...p, jd: false })); return; }

    // STAGE 2: Batch 1 (parallel)
    setStage(2); setView(2); go("bool"); go("screen");
    try {
      const [bools, scored] = await Promise.all([
        callAgent(PROMPTS.bool, `Generate Boolean search strings for:\n${JSON.stringify(parsed)}`),
        callAgent(PROMPTS.screen, `Job requirements:\n${JSON.stringify(parsed)}\n\nCandidate profiles:\n${JSON.stringify(CANDIDATES)}`),
      ]);
      setRes(p => ({ ...p, bools, scored }));
      done("bool"); done("screen");
      // Auto-select candidates the screener recommends
      const auto = new Set((scored.ranked_candidates || []).filter(c => c.proceed).map(c => c.id));
      setApproved(auto);
    } catch (e) { setErr(`Batch 1 failed: ${e.message}`); setBusy(p => ({ ...p, bool: false, screen: false })); return; }

    // STAGE 3: Human review gate
    setStage(3); setView(3);
  }

  async function runDelivery() {
    if (approved.size === 0) { setErr("Select at least one candidate to continue."); return; }
    setErr(null);
    const appCands = CANDIDATES.filter(c => approved.has(c.id));
    setRes(p => ({ ...p, approved: appCands }));
    const current = resRef.current;

    // STAGE 4: Batch 2 (parallel)
    setStage(4); setView(4); go("out"); go("sub");
    try {
      const jdStr = JSON.stringify(current.parsed);
      const candStr = JSON.stringify(appCands);
      const rateStr = `$${current.parsed?.bill_rate?.min}–${current.parsed?.bill_rate?.max}/hr`;
      const [out, subs] = await Promise.all([
        callAgent(PROMPTS.out, `JD summary:\n${jdStr}\n\nApproved candidates:\n${candStr}`),
        callAgent(PROMPTS.sub, `JD summary:\n${jdStr}\nBill rate: ${rateStr}\nApproved candidates:\n${candStr}`),
      ]);
      setRes(p => ({ ...p, out, subs }));
      done("out"); done("sub");
    } catch (e) { setErr(`Batch 2 failed: ${e.message}`); setBusy(p => ({ ...p, out: false, sub: false })); return; }

    setStage(5); setView(5);
  }

  function reset() {
    setStage(0); setView(0); setBusy({}); setFin({}); setErr(null);
    setApproved(new Set()); setMsgTab({});
    const empty = { parsed: null, bools: null, scored: null, out: null, subs: null, approved: [] };
    resRef.current = empty; setResState(empty); setJd("");
  }

  // ── Stage renderers ────────────────────────────────────────────────────────

  function StageIntake() {
    return (
      <div style={{ animation: "fadeUp .4s ease" }}>
        <InfoBox color={C.blue}>
          <span style={{ fontSize: 20 }}>🤖</span>
          <div>
            <div style={{ fontWeight: 700, color: C.t1, fontSize: 13, marginBottom: 3 }}>Full Orchestrator Demo</div>
            <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.6 }}>
              Paste any IT job description. The orchestrator runs 5 Claude agents automatically —
              JD parsing → Boolean generation + candidate screening (parallel) → your review → outreach drafting + submission packaging (parallel).
            </div>
          </div>
        </InfoBox>
        <SectionLabel>Job Description</SectionLabel>
        <textarea
          value={jd} onChange={e => setJd(e.target.value)}
          placeholder="Paste your client's job description here…"
          style={{
            width: "100%", minHeight: 220, background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: 14, color: C.t1, fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.7, outline: "none",
          }}
        />
        <button onClick={() => setJd(SAMPLE_JD)} style={{
          marginTop: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.t2,
          borderRadius: 6, padding: "5px 14px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
        }}>
          ↗ Load sample FinTech JD
        </button>
      </div>
    );
  }

  function StageParsed() {
    const d = res.parsed;
    return (
      <AgentCard title="JD Parser Agent" badge="Claude Sonnet" status={fin.jd ? "done" : busy.jd ? "running" : "idle"}>
        <div style={{ color: C.t2, fontSize: 11, marginBottom: 10 }}>
          Extracts role title, skills, rate, visa restrictions, and flags ambiguities — no assumptions, explicit data only.
        </div>
        {busy.jd && !d && <Spinner label="Parsing job description…" />}
        {d && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <DataGrid items={[
              ["Role Title", d.role_title], ["Industry", d.client_industry],
              ["City", d.location?.city], ["State", d.location?.state],
              ["Duration", d.duration], ["Bill Rate", d.bill_rate ? `$${d.bill_rate.min}–$${d.bill_rate.max}/hr` : null],
              ["Experience", d.experience_years ? `${d.experience_years}+ yrs` : null],
              ["Visa", d.visa_restrictions], ["Start", d.start_date], ["Priority", d.priority?.toUpperCase()],
            ]} />
            <SectionLabel>Must-Have Skills</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {(d.must_have_skills || []).map(s => <Chip key={s} label={s} color={C.green} />)}
            </div>
            {d.nice_to_have_skills?.length > 0 && <>
              <SectionLabel>Nice to Have</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {d.nice_to_have_skills.map(s => <Chip key={s} label={s} color={C.blue} />)}
              </div>
            </>}
            {d.flags?.length > 0 && <>
              <SectionLabel>Flags for Review</SectionLabel>
              {d.flags.map(f => (
                <div key={f} style={{ color: C.amber, fontSize: 12, padding: "5px 10px", background: C.amberBg, borderRadius: 5, marginBottom: 4 }}>⚑ {f}</div>
              ))}
            </>}
          </div>
        )}
      </AgentCard>
    );
  }

  function StageBatch1() {
    const { bools, scored } = res;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <InfoBox color={C.amber}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.6 }}>
            Both agents ran simultaneously via <code style={{ color: C.amber, fontSize: 11 }}>Promise.all()</code> — Boolean generation and candidate screening executed in parallel, not in sequence.
          </div>
        </InfoBox>

        {/* Boolean Generator */}
        <AgentCard title="Boolean Generator Agent" badge="Claude Sonnet" status={fin.bool ? "done" : busy.bool ? "running" : "idle"}>
          <div style={{ color: C.t2, fontSize: 11, marginBottom: 10 }}>
            Builds Boolean search strings with skill synonyms and title variants for JobDiva and LinkedIn RPS.
          </div>
          {busy.bool && !bools && <Spinner label="Generating Boolean strings…" />}
          {bools && (
            <div style={{ animation: "fadeUp .3s ease" }}>
              <SectionLabel>JobDiva ATS Strings</SectionLabel>
              {(bools.jobdiva_strings || []).map((s, i) => (
                <div key={i} style={{ background: C.surface, borderRadius: 6, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: C.green, fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                    <span style={{ color: C.t3, fontSize: 11 }}>{s.purpose}</span>
                  </div>
                  <code style={{ color: C.t1, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", display: "block", wordBreak: "break-all", lineHeight: 1.7 }}>{s.string}</code>
                </div>
              ))}
              <SectionLabel>LinkedIn RPS Strings</SectionLabel>
              {(bools.linkedin_strings || []).map((s, i) => (
                <div key={i} style={{ background: C.surface, borderRadius: 6, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: C.blue, fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                    <span style={{ color: C.t3, fontSize: 11 }}>{s.purpose}</span>
                  </div>
                  <code style={{ color: C.t1, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", display: "block", wordBreak: "break-all", lineHeight: 1.7 }}>{s.string}</code>
                </div>
              ))}
              {bools.tips?.length > 0 && <>
                <SectionLabel>Sourcing Tips</SectionLabel>
                {bools.tips.map((t, i) => (
                  <div key={i} style={{ color: C.t2, fontSize: 12, padding: "5px 10px", paddingLeft: 12, borderLeft: `2px solid ${C.border}`, marginBottom: 5, lineHeight: 1.5 }}>💡 {t}</div>
                ))}
              </>}
            </div>
          )}
        </AgentCard>

        {/* Screener */}
        <AgentCard title="Candidate Screener Agent" badge="Claude Sonnet" status={fin.screen ? "done" : busy.screen ? "running" : "idle"}>
          <div style={{ color: C.t2, fontSize: 11, marginBottom: 10 }}>
            Scores each candidate 0–100 across skill match (40%), experience (30%), location (20%), rate (10%).
          </div>
          {busy.screen && !scored && <Spinner label="Scoring 5 candidate profiles…" />}
          {scored && (
            <div style={{ animation: "fadeUp .3s ease" }}>
              <div style={{ color: C.t2, fontSize: 12, padding: "8px 12px", background: C.surface, borderRadius: 6, marginBottom: 12, lineHeight: 1.5 }}>
                {scored.summary}
              </div>
              {(scored.ranked_candidates || []).sort((a, b) => b.score - a.score).map(c => {
                const cand = CANDIDATES.find(x => x.id === c.id);
                return (
                  <div key={c.id} style={{ background: C.surface, borderRadius: 8, padding: 12, marginBottom: 8, border: `1px solid ${c.proceed ? C.green + "44" : C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ color: C.t1, fontWeight: 700, fontSize: 13 }}>{c.name}</div>
                        <div style={{ color: C.t2, fontSize: 11 }}>{cand?.title} · {cand?.loc}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: gradeColor(c.grade), fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{c.grade}</div>
                        <div style={{ color: C.t3, fontSize: 10 }}>{c.score}/100</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginBottom: 8 }}>
                      {[["Skills", c.skill_match], ["Exp", c.exp_match], ["Location", c.loc_match], ["Rate", c.rate_match]].map(([k, v]) => (
                        <div key={k} style={{ background: C.card, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                          <div style={{ color: C.t3, fontSize: 9, textTransform: "uppercase", letterSpacing: ".06em" }}>{k}</div>
                          <div style={{ color: C.t1, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ color: C.t2, fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>{c.rec}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {c.proceed ? <Chip label="✓ PROCEED" color={C.green} /> : <Chip label="SKIP" color={C.red} />}
                      {!c.visa_ok && <Chip label="VISA ISSUE" color={C.red} />}
                      {(c.flags || []).map(f => <Chip key={f} label={f} color={C.amber} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AgentCard>
      </div>
    );
  }

  function StageReview() {
    const ranked = (res.scored?.ranked_candidates || []).sort((a, b) => b.score - a.score);
    return (
      <div style={{ animation: "fadeUp .4s ease" }}>
        <InfoBox color={C.amber}>
          <span style={{ fontSize: 20 }}>👤</span>
          <div>
            <div style={{ fontWeight: 700, color: C.t1, fontSize: 13, marginBottom: 3 }}>Human Review Gate</div>
            <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.6 }}>
              AI pre-selected candidates scoring ≥70 and visa-cleared. Tap any card to toggle approval before outreach begins.
            </div>
          </div>
        </InfoBox>
        {ranked.map(c => {
          const cand = CANDIDATES.find(x => x.id === c.id);
          const sel = approved.has(c.id);
          return (
            <div key={c.id}
              onClick={() => setApproved(p => { const n = new Set(p); sel ? n.delete(c.id) : n.add(c.id); return n; })}
              style={{
                background: sel ? C.green + "11" : C.card, borderRadius: 10, padding: 14, marginBottom: 8,
                border: `1px solid ${sel ? C.green + "66" : C.border}`, cursor: "pointer", transition: "all .2s",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sel ? 10 : 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", background: sel ? C.green : C.border,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                    flexShrink: 0, transition: "background .2s", color: sel ? "#000" : "transparent",
                  }}>✓</div>
                  <div>
                    <div style={{ color: C.t1, fontWeight: 700, fontSize: 13 }}>{c.name}</div>
                    <div style={{ color: C.t2, fontSize: 11 }}>{cand?.title} · {cand?.loc}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: gradeColor(c.grade), fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 20 }}>{c.grade}</div>
                  <div style={{ color: C.t3, fontSize: 10 }}>${cand?.rate}/hr · {cand?.visa}</div>
                </div>
              </div>
              {sel && (
                <div style={{ paddingTop: 10, borderTop: `1px solid ${C.green}33`, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Chip label={`${cand?.exp} yrs exp`} color={C.blue} />
                  <Chip label={cand?.avail} color={C.blue} />
                  {(cand?.skills || []).map(s => <Chip key={s} label={s} color={C.green} />)}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ textAlign: "center", color: C.t2, fontSize: 12, padding: "8px 0" }}>
          {approved.size} candidate{approved.size !== 1 ? "s" : ""} selected for outreach & submission
        </div>
      </div>
    );
  }

  function StageBatch2() {
    const { out, subs } = res;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <InfoBox color={C.amber}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.6 }}>
            Outreach drafting and submission packaging ran simultaneously via <code style={{ color: C.amber, fontSize: 11 }}>Promise.all()</code>.
          </div>
        </InfoBox>

        {/* Outreach Agent */}
        <AgentCard title="Outreach Agent" badge="Claude Sonnet" status={fin.out ? "done" : busy.out ? "running" : "idle"}>
          <div style={{ color: C.t2, fontSize: 11, marginBottom: 10 }}>
            Generates personalised Outlook email, LinkedIn InMail, and RTR message per candidate.
          </div>
          {busy.out && !out && <Spinner label="Drafting personalised messages…" />}
          {out && (
            <div style={{ animation: "fadeUp .3s ease" }}>
              {(out.candidates || []).map(c => {
                const tab = msgTab[c.id] || "email";
                const tabs = [["email", "📧 Outlook Email"], ["inmail", "💼 LinkedIn InMail"], ["rtr", "📄 RTR"]];
                const content = { email: c.email, inmail: c.inmail, rtr: c.rtr }[tab];
                return (
                  <div key={c.id} style={{ background: C.surface, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: C.t1, fontSize: 13, marginBottom: 10 }}>{c.name}</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      {tabs.map(([k, l]) => (
                        <button key={k} onClick={() => setMsgTab(p => ({ ...p, [c.id]: k }))}
                          style={{
                            background: tab === k ? C.amber : C.card, color: tab === k ? "#000" : C.t2,
                            border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 11,
                            cursor: "pointer", fontFamily: "inherit", fontWeight: tab === k ? 700 : 400, transition: "all .15s",
                          }}>{l}
                        </button>
                      ))}
                    </div>
                    {content && (
                      <div>
                        <div style={{ color: C.t3, fontSize: 11, marginBottom: 6 }}>
                          Subject: <span style={{ color: C.t1 }}>{content.subject}</span>
                        </div>
                        <div style={{
                          color: C.t1, fontSize: 11, lineHeight: 1.7, background: C.card,
                          borderRadius: 6, padding: 10, whiteSpace: "pre-wrap",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>{content.body}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </AgentCard>

        {/* Submission Agent */}
        <AgentCard title="Submission Agent" badge="Claude Sonnet" status={fin.sub ? "done" : busy.sub ? "running" : "idle"}>
          <div style={{ color: C.t2, fontSize: 11, marginBottom: 10 }}>
            Verifies each candidate package against a 5-point checklist before compiling the client submission email.
          </div>
          {busy.sub && !subs && <Spinner label="Compiling submission packages…" />}
          {subs && (
            <div style={{ animation: "fadeUp .3s ease" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div style={{ background: C.greenBg, border: `1px solid ${C.green}44`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ color: C.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 28 }}>{subs.ready ?? 0}</div>
                  <div style={{ color: C.t2, fontSize: 11 }}>Ready to submit</div>
                </div>
                <div style={{ background: C.amberBg, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ color: C.amber, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 28 }}>{subs.held ?? 0}</div>
                  <div style={{ color: C.t2, fontSize: 11 }}>On hold</div>
                </div>
              </div>
              {(subs.submissions || []).map(s => (
                <div key={s.id} style={{ background: C.surface, borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ color: C.t1, fontWeight: 700, fontSize: 13 }}>{s.name}</span>
                    <Chip label={s.status?.toUpperCase()} color={s.status === "ready" ? C.green : C.amber} />
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    {Object.entries(s.checks || {}).map(([k, v]) => (
                      <span key={k} style={{ color: v ? C.green : C.red, fontSize: 11 }}>
                        {v ? "✓" : "✗"} {k.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                  <div style={{ background: C.card, borderRadius: 6, padding: 10, marginBottom: s.jd_notes ? 8 : 0 }}>
                    <div style={{ color: C.t3, fontSize: 10, marginBottom: 4 }}>
                      Client email — Subject: <span style={{ color: C.t1 }}>{s.client_email?.subject}</span>
                    </div>
                    <div style={{ color: C.t1, fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace" }}>
                      {s.client_email?.body}
                    </div>
                  </div>
                  {s.jd_notes && <div style={{ color: C.t2, fontSize: 11, padding: "6px 10px", background: C.card, borderRadius: 6, marginBottom: s.action ? 6 : 0 }}>📝 JobDiva: {s.jd_notes}</div>}
                  {s.action && <div style={{ color: C.amber, fontSize: 11, padding: "5px 10px", background: C.amberBg, borderRadius: 6 }}>⚠ {s.action}</div>}
                </div>
              ))}
              {subs.notes && <div style={{ color: C.t2, fontSize: 12, padding: "8px 12px", background: C.blueBg, borderRadius: 6, borderLeft: `2px solid ${C.blue}` }}>{subs.notes}</div>}
            </div>
          )}
        </AgentCard>
      </div>
    );
  }

  function StageComplete() {
    const r = res;
    const stats = [
      ["JD Parsed", "✓", C.green],
      ["Boolean Strings", (r.bools?.jobdiva_strings?.length || 0) + (r.bools?.linkedin_strings?.length || 0), C.blue],
      ["Candidates Screened", CANDIDATES.length, C.blue],
      ["Approved", r.approved?.length || 0, C.green],
      ["Messages Drafted", (r.out?.candidates?.length || 0) * 3, C.green],
      ["Packages Ready", r.subs?.ready ?? 0, C.green],
    ];
    return (
      <div style={{ animation: "fadeUp .4s ease", textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: C.t1, marginBottom: 6 }}>Pipeline Complete</div>
        <div style={{ color: C.t2, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
          {r.subs?.ready ?? 0} candidate package{(r.subs?.ready ?? 0) !== 1 ? "s" : ""} verified and ready for client submission.<br />
          All 5 agents executed successfully.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
          {stats.map(([k, v, c]) => (
            <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 8px" }}>
              <div style={{ color: c, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 22 }}>{v}</div>
              <div style={{ color: C.t3, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>{k}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setView(1)} style={{ background: C.surface, color: C.t1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Review JD Parse
          </button>
          <button onClick={reset} style={{ background: C.amber, color: "#000", border: "none", borderRadius: 8, padding: "8px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Run New JD →
          </button>
        </div>
      </div>
    );
  }

  // ── Stage tab definitions ──────────────────────────────────────────────────
  const TABS = [
    { id: 0, label: "Intake",    icon: "📋" },
    { id: 1, label: "JD Parse",  icon: "🔍" },
    { id: 2, label: "Sourcing",  icon: "⚡" },
    { id: 3, label: "Review",    icon: "👤" },
    { id: 4, label: "Delivery",  icon: "📤" },
    { id: 5, label: "Complete",  icon: "✅" },
  ];
  const VIEWS = [StageIntake, StageParsed, StageBatch1, StageReview, StageBatch2, StageComplete];
  const isRunning = Object.values(busy).some(Boolean);

  // ── Action bar ─────────────────────────────────────────────────────────────
  function ActionBar() {
    if (isRunning) return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: C.t2, fontSize: 12 }}>
        <span style={{ width: 8, height: 8, background: C.amber, borderRadius: "50%", display: "inline-block", animation: "pulse 1s infinite" }} />
        Agents running — please wait…
      </div>
    );
    if (stage === 0) return (
      <button onClick={runPipeline} style={{ width: "100%", background: C.amber, color: "#000", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: ".02em" }}>
        Run Orchestrator →
      </button>
    );
    if (stage === 3) return (
      <button onClick={runDelivery} style={{ width: "100%", background: C.green, color: "#000", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
        Approve & Run Delivery Agents ({approved.size} selected) →
      </button>
    );
    return null;
  }

  const CurrentView = VIEWS[view];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Syne', sans-serif", color: C.t1 }}>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: ".02em" }}>Recruitment Orchestrator</div>
          <div style={{ color: C.t3, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
            5 Claude agents · JobDiva · Outlook 365 · LinkedIn RPS
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {Object.entries(fin).filter(([, v]) => v).map(([k]) => (
            <div key={k} title={k} style={{ width: 7, height: 7, background: C.green, borderRadius: "50%" }} />
          ))}
          {isRunning && <div style={{ width: 7, height: 7, background: C.amber, borderRadius: "50%", animation: "pulse 1s infinite" }} />}
        </div>
      </div>

      {/* Pipeline nav tabs */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        <div style={{ display: "flex", padding: "0 10px", minWidth: "max-content" }}>
          {TABS.map(t => {
            const isActive = view === t.id;
            const isDone = stage > t.id;
            const canClick = t.id <= stage;
            const agentRunning = (busy.jd && t.id === 1) || ((busy.bool || busy.screen) && t.id === 2) || ((busy.out || busy.sub) && t.id === 4);
            return (
              <button key={t.id} onClick={() => canClick && setView(t.id)} style={{
                background: "transparent", border: "none",
                borderBottom: `2px solid ${isActive ? C.amber : isDone ? C.green : "transparent"}`,
                padding: "10px 12px", cursor: canClick ? "pointer" : "default",
                color: isActive ? C.amber : isDone ? C.green : t.id === stage ? C.t1 : C.t3,
                fontSize: 11, fontWeight: isActive ? 700 : 400,
                display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                transition: "color .2s, border-color .2s", fontFamily: "'Syne', sans-serif",
              }}>
                {t.icon} {t.label}
                {isDone && <span style={{ color: C.green, fontSize: 9 }}>✓</span>}
                {agentRunning && <span style={{ width: 5, height: 5, background: C.amber, borderRadius: "50%", display: "inline-block", animation: "pulse 1s infinite" }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding: "16px 16px 120px", maxWidth: 700, margin: "0 auto" }}>
        {err && (
          <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, color: C.red, borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 14 }}>
            ⚠ {err}
          </div>
        )}
        <CurrentView />
      </div>

      {/* Sticky action bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: "12px 16px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <ActionBar />
        </div>
      </div>
    </div>
  );
}
