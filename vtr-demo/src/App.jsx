import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Bot,
  User,
  FileText,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock3,
  BarChart3,
} from "lucide-react";

// ── AUTOMATED animation ──────────────────────────────────────────────────────
// Real runtime: 12.0 + 21.0 = 33 s (single iteration, passed first try)
// Animation compressed to ~8 s   →   compression ratio  33s / 8s ≈ 4×
//   iter1 agent  12.0s → 2910ms (split 1455 + 1455)
//   iter1 VTR    21.0s → 5090ms
//   total animation: 8000ms ≈ 8 s

const AUTO_STEPS = [
  { text: "Controller parses error log and routes to Floorplan Agent",       type: "normal", phase: "iter1-agent", duration: 1455 },
  { text: "Floorplan Agent retrieves RAG context and calls LLM (Iter 1)",    type: "normal", phase: "iter1-agent", duration: 1455 },
  { text: "Iter 1 VTR validation run — placement constraints loaded ✓",      type: "pass",   phase: "iter1-vtr",   duration: 5090 },
];

// ── HUMAN animation ───────────────────────────────────────────────────────────
// Real estimated debug time: ~6 min (360s)
// Ref: https://docs.verilogtorouting.org/en/latest/vpr/placement_constraints/
//
// Animation compressed to ~26 s  →  compression ratio  360s / 26s ≈ 14×
// Automated is ~8s, so human is ~3.25× slower in animation — clearly visible.
const HUMAN_STEPS = [
  // Step 1: run VPR with floorplan → seg fault, no error message
  { delay: 400,  type: "cmd",    line: "$ stdbuf -oL -eL $VTR_ROOT/vpr/vpr k6_frac... --read_vpr_constraints A.xml 2>&1 | tee run.log" },
  { delay: 900, type: "error",  line: "Segmentation fault (core dumped)" },

  // Step 2: remove --read_vpr_constraints, rerun → success (fault is in FP file)
  { delay: 2000, type: "cmd",    line: "$ stdbuf -oL -eL $VTR_ROOT/vpr/vpr k6_frac... 2>&1 | tee run2.log" },
  { delay: 800, type: "output", line: "(no floorplan) VPR completed successfully. Fault is in the floorplan file." },

  // Step 3: inspect floorplan for typos / bad values → looks fine
  { delay: 2650, type: "cmd",    line: "$ cat A.xml" },
  { delay: 650, type: "output", line: '  <add_region x_low="0" y_low="0" x_high="10" y_high="20" layer_low="0" layer_high="1"/>' },
  { delay: 550, type: "output", line: "(no obvious typos or out-of-range values visible)" },

  // Step 4: check VPR docs FP section → no mention of seg fault causes
  { delay: 3950, type: "cmd",    line: "$ open https://docs.verilogtorouting.org/en/latest/vpr/placement_constraints/" },
  { delay: 650, type: "output", line: "(read through docs — no mention of seg fault causes)" },

  // Step 5: paste floorplan into GPT, ask what is wrong
  { delay: 2650, type: "cmd",    line: `# [browser] paste A.xml into ChatGPT: "what's wrong with this floorplan?"` },
  { delay: 800, type: "output", line: "GPT: The XML looks syntactically valid. Could be a constraint value issue." },

  // Step 6: ask GPT what causes seg faults with FP constraints and how to check
  { delay: 2650, type: "cmd",    line: `# [browser] "what could cause a VPR seg fault with floorplan constraints?"` },
  { delay: 950, type: "output", line: "GPT: One cause — layer_high > 0 on a 2D (single-layer) architecture. Check arch XML." },

  // Step 7: run grep to check for <layers> tag — no output means 2D arch, fix layer_high → 0
  { delay: 2650, type: "cmd",    line: '$ grep "<layers>" k6_frac_N10_frac_chain_mem32K_40nm.xml' },
  { delay: 650, type: "output", line: "(no output — architecture has no <layers> tag, confirmed 2D)" },
  { delay: 550, type: "cmd",    line: '$ nano A.xml   # set layer_high="0"' },
  { delay: 800, type: "output", line: '  <add_region x_low="0" y_low="0" x_high="10" y_high="20" layer_low="0" layer_high="0"/>' },

  // Step 8: rerun → success
  { delay: 1300, type: "cmd",    line: "$ stdbuf -oL -eL $VTR_ROOT/vpr/vpr k6_frac... --read_vpr_constraints A.xml 2>&1 | tee run3.log" },
  { delay: 800, type: "success",line: "Placement constraints loaded successfully. VPR completed." },
];
// cumulative: 400 + 900 + 2000 + 800 + 2650 + 650 + 550 + 3950 + 650 + 2650 + 800 + 2650 + 950 + 2650 + 650 + 550 + 800 + 1300 + 800 = 26350ms ≈ 26s ✓
// real ~6 min (360s) → 26s in demo, compression ≈ 14×


const DEMO_CASE = {
  humanTimeRef: "https://docs.verilogtorouting.org/en/latest/vpr/placement_constraints/",
  runtimeRows: [
    { stage: "Iteration 1: Agent + RAG + LLM inference", status: "Passed",  time: "12.0 s" },
    { stage: "Iteration 1: VTR validation run",           status: "Passed",  time: "33.0 s" },
    { stage: "Total example runtime",                     status: "Success", time: "33.0 s" },
  ],
  docLinks: [
    { label: "VPR Command Line Options", href: "https://docs.verilogtorouting.org/en/latest/vpr/command_line_usage/" },
    { label: "VPR SDC Commands",         href: "https://docs.verilogtorouting.org/en/latest/vpr/sdc_commands/" },
    { label: "VPR Placement Constraints",href: "https://docs.verilogtorouting.org/en/latest/vpr/placement_constraints/" },
    { label: "VTR Documentation",        href: "https://docs.verilogtorouting.org/" },
  ],
  models: {
    llama: {
      name: "Llama 3.3 70B",
      command: "./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --pack --place --route --read_vpr_constraints A.xml",
      fixedLine: '<add_region x_low="0" y_low="0" x_high="10" y_high="10"/>',
      explanation: "The changes fix the region-related error by ensuring the region spans at least 10 grid units and adjusting y_high to match x_high for a square region, while removing the unnecessary layer parameters.",
      avgTokens: "185.8",
    },
    llama8b: {
      name: "Llama 3.1-8B",
      command: "/home/taehoonk/fall2025/vtr-verilog-to-routing/vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --pack --place --route --read_vpr_constraints modified_floorplan.xml --timing_analysis on",
      fixedLine: '<add_region x_low="0" y_low="0" x_high="10" y_high="10" layer_low="0" layer_high="1"/>',
      explanation: "Model adjusted y_high from 20 to 10 but kept the invalid layer_high=\"1\" attribute. VPR rejected this as an unrecognized child element — the root cause was never addressed. All 3 iterations produced the same incorrect fix.",
      avgTokens: "272.8",
      failed: true,
    },
    gptoss: {
      name: "GPT-OSS-20B",
      command: "./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --pack --place --route --read_vpr_constraints A.xml",
      fixedLine: '<add_region x_low="0" y_low="0" x_high="10" y_high="20"/>',
      explanation: "Removed the unsupported layer_low and layer_high attributes from the region so that the constraints are valid for the 2D architecture, which resolved the grid construction failure.",
      avgTokens: "1443.6",
    },
    qwen: {
      name: "Qwen3-32B",
      command: "./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --pack --place --route --read_vpr_constraints A.xml",
      fixedLine: '<add_region x_low="0" y_low="0" x_high="10" y_high="20"/>',
      explanation: "Removed layer_low and layer_high attributes from the add_region tag since they are optional and the architecture uses a 2D grid. The default layer 0 is assumed when not specified.",
      avgTokens: "1541.3",
    },
  },
};

export default function VtrDemoApp() {
  const [running, setRunning] = useState(false);
  const [autoDone, setAutoDone] = useState(false);
  const [humanDone, setHumanDone] = useState(false);
  const [activeAutoStep, setActiveAutoStep] = useState(-1);
  const [doneAutoSteps, setDoneAutoSteps] = useState([]);
  const [revealedHuman, setRevealedHuman] = useState([]);
  const [selectedModel, setSelectedModel] = useState("llama");
  const [videoOpen, setVideoOpen] = useState(false);
  const timers = useRef([]);
  const humanScrollRef = useRef(null);

  const done = autoDone && humanDone;

  // prevent mobile viewport zoom when content changes
  useEffect(() => {
    const meta = document.querySelector("meta[name=viewport]");
    if (meta) {
      meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    } else {
      const m = document.createElement("meta");
      m.name = "viewport";
      m.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
      document.head.appendChild(m);
    }
  }, []);

  useEffect(() => {
    const el = humanScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealedHuman]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const addTimer = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };

  const handleRun = () => {
    clearTimers();
    setRunning(true);
    setAutoDone(false);
    setHumanDone(false);
    setActiveAutoStep(-1);
    setDoneAutoSteps([]);
    setRevealedHuman([]);

    // ── AUTOMATED ──
    let autoCum = 0;
    AUTO_STEPS.forEach((step, i) => {
      addTimer(() => setActiveAutoStep(i), autoCum);
      addTimer(() => {
        setDoneAutoSteps(prev => [...prev, { index: i, failed: step.type === "fail" }]);
        if (i < AUTO_STEPS.length - 1) setActiveAutoStep(-1);
      }, autoCum + step.duration);
      autoCum += step.duration;
    });
    addTimer(() => setAutoDone(true), autoCum + 200);

    // ── HUMAN ──
    let humanCum = 0;
    HUMAN_STEPS.forEach((step, i) => {
      humanCum += step.delay;
      addTimer(() => setRevealedHuman(prev => [...prev, i]), humanCum);
    });
    addTimer(() => { setHumanDone(true); setRunning(false); }, humanCum + 400);
  };

  const humanLineClass = (type) => {
    if (type === "error")         return "line-error";
    if (type === "success")       return "line-success";
    if (type === "output")        return "line-muted";
    if (type === "doc-header")    return "line-doc-header";
    if (type === "doc-body")      return "line-doc-body";
    if (type === "doc-highlight") return "line-doc-highlight";
    return "line-default";
  };

  const model = DEMO_CASE.models[selectedModel];
  const humanPreviewCount = 3;

  return (
    <>
      <style>{styles}</style>
      <div className="app-shell">
        <div className="background-layer">
          <div className="glow glow-top" />
          <div className="glow glow-bottom" />
          <div className="grid-overlay" />
        </div>

        <main className="page">
          {/* ── HERO ── */}
          <section className="hero stack-lg">
            <motion.div
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }} className="eyebrow-pill"
            >
              <RotateCcw size={15} />
              <span>VTR-LLM Project Website</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.05 }} className="hero-title"
            >
              VTR-LLM
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }} className="hero-subtitle"
            >
              A multi-agent LLM system that automatically diagnoses, repairs,
              and validates VTR configuration errors.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.14 }} className="hero-note"
            >
              Below is one example repair trace showing the automated debugging loop.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.18 }} className="button-row"
            >
              <button onClick={handleRun} className="primary-btn" disabled={running}>
                <Play size={15} />
                <span>{running ? "Running…" : "View example"}</span>
              </button>
              <a href="#runtime" className="secondary-btn">
                <span>See iteration timeline</span>
                <ChevronRight size={15} />
              </a>
            </motion.div>
          </section>

          {/* ── SIDE BY SIDE WORKFLOWS ── */}
          <section className="section-grid two-col">
            {/* MANUAL */}
            <Panel title="Manual debugging workflow" icon={<User size={15} />} eyebrow="Human effort" completionBadge={{ label: "~6 min (est.)", variant: "badge-slow", show: humanDone }} extraClass="panel-fixed">
              <div className="code-shell code-shell-scroll" ref={humanScrollRef}>
                <div className="traffic-lights">
                  <span className="dot dot-red" /><span className="dot dot-yellow" /><span className="dot dot-green" />
                </div>
                <div className="code-lines">
                  {(running || humanDone || autoDone)
                    ? HUMAN_STEPS.map((step, i) =>
                        revealedHuman.includes(i) ? (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            className={humanLineClass(step.type)}
                          >
                            {step.line}
                          </motion.div>
                        ) : null
                      )
                    : HUMAN_STEPS.slice(0, 3).map((step, i) => (
                        <div key={i} className={humanLineClass(step.type)}>{step.line}</div>
                      ))
                  }
                  {running && !humanDone && <span className="cursor-block" />}
                </div>
              </div>
              <div className="compression-note">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>
                  Animation compressed. Est. avg debug time ~6 min → ~26 s in demo{" "}
                  <span className="compress-ratio">(14×)</span>.
                </span>
              </div>
              <button className="video-btn" onClick={() => setVideoOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Watch real debug session recording
              </button>
            </Panel>

            {/* AUTOMATED */}
            <Panel title="VTR-LLM repair workflow" icon={<Bot size={15} />} eyebrow="Automated system" completionBadge={{ label: "33 s", variant: "badge-fast", show: autoDone }} extraClass="panel-fixed">
              <div className="step-list-scroll">
                {AUTO_STEPS.map((step, i) => {
                  const isActive = i === activeAutoStep;
                  const doneEntry = doneAutoSteps.find(d => d.index === i);
                  const isDone = !!doneEntry;
                  const isFailed = doneEntry?.failed;
                  const isPass = step.type === "pass" && isDone;

                  let cardClass = "step-card";
                  if (isActive) cardClass += " step-active";
                  else if (isDone && isFailed) cardClass += " step-failed";
                  else if (isDone) cardClass += " step-done";

                  return (
                    <motion.div
                      key={i}
                      initial={false}
                      animate={{ opacity: isActive || isDone ? 1 : 0.45, scale: isActive ? 1.01 : 1 }}
                      className={cardClass}
                    >
                      <div className="step-icon-wrap">
                        {isDone && isFailed
                          ? <XCircle size={14} className="icon-failed" />
                          : isDone
                          ? <CheckCircle2 size={14} className="icon-done" />
                          : <span>{i + 1}</span>
                        }
                      </div>
                      <div className="step-copy">
                        <div className="step-title">{step.text}</div>
                        {isActive && !isDone && <div className="step-state state-active">Running…</div>}
                        {isDone && isFailed && <div className="step-state state-failed">Validation failed — launching Iteration 2</div>}
                        {isDone && step.type === "retry" && <div className="step-state state-retry">Controller re-queues with error context</div>}
                        {isPass && <div className="step-state state-done">Passed — repair complete</div>}
                        {isDone && !isFailed && step.type === "normal" && <div className="step-state state-done">Completed</div>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <div className="compression-note">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>
                  Animation compressed. Processing time 33 s → ~8 s in demo{" "}
                  <span className="compress-ratio">(4×)</span>.{" "}
                  Times reflect avg across tested benchmarks.
                </span>
              </div>
            </Panel>
          </section>


          <section className="section-grid two-col">
            <Panel title="1. Original error" icon={<XCircle size={15} />} eyebrow="Example input">
              <div className="code-shell">
                <div className="traffic-lights">
                  <span className="dot dot-red" /><span className="dot dot-yellow" /><span className="dot dot-green" />
                </div>
                <div className="code-lines">
                  <div className="line-default">{'<vpr_constraints tool_name="vpr">'}</div>
                  <div className="line-default">{'  <partition_list>'}</div>
                  <div className="line-default">{'    <partition name="ALU_PART">'}</div>
                  <div className="line-default">{'      <add_atom name_pattern="alu.*"/>'}</div>
                  <div className="line-error">{'      <add_region x_low="0" y_low="0" x_high="10" y_high="20" layer_low="0" layer_high="1"/>'}</div>
                  <div className="line-default">{'    </partition>'}</div>
                  <div className="line-default">{'  </partition_list>'}</div>
                  <div className="line-default">{'</vpr_constraints>'}</div>
                </div>
              </div>
              <div className="error-meta">
                <div className="error-meta-row">
                  <span className="error-meta-label">Line with error</span>
                  <code className="error-meta-code">{'<add_region ... layer_low="0" layer_high="1"/>'}</code>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">Issue</span>
                  <span className="error-meta-value">The architecture is 2D so layer 1 does not exist</span>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">Explanation</span>
                  <span className="error-meta-value">Restore <code>layer_high</code> to <code>0</code> — both layer values must be 0 for a 2D architecture</span>
                </div>
              </div>
            </Panel>

            <Panel title="2. Generated fix" icon={<CheckCircle2 size={15} />} eyebrow="System output">
              <div className="code-shell">
                <div className="traffic-lights">
                  <span className="dot dot-red" /><span className="dot dot-yellow" /><span className="dot dot-green" />
                </div>
                <div className="code-lines">
                  <div className="line-default">Controller decided to use FP_RAG mode.</div>
                  <div className="line-default">Modified Command Suggestion:</div>
                  <div className="line-default">{"A. ./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif"}</div>
                  <div className="line-default">{"   --pack --place --route --read_vpr_constraints A.xml"}</div>
                  <div className="line-default">&nbsp;</div>
                  <div className="line-default">B.</div>
                  <div className="line-default">{'1. <vpr_constraints tool_name="vpr">'}</div>
                  <div className="line-default">{"2.   <partition_list>"}</div>
                  <div className="line-default">{'3.     <partition name="ALU_PART">'}</div>
                  <div className="line-default">{'4.       <add_atom name_pattern="alu.*"/>'}</div>
                  <div className="line-success">{'5.       <add_region x_low="0" y_low="0" x_high="10" y_high="10"/>'}</div>
                  <div className="line-default">{"6.     </partition>"}</div>
                  <div className="line-default">{"7.   </partition_list>"}</div>
                  <div className="line-default">{"8. </vpr_constraints>"}</div>
                  <div className="line-default">&nbsp;</div>
                  <div className="line-default">{"C. The changes fix the region-related error by ensuring the region"}</div>
                  <div className="line-default">{"   spans at least 10 grid units and adjusting y_high to match x_high"}</div>
                  <div className="line-default">{"   for a square region, removing unnecessary layer parameters."}</div>
                </div>
              </div>
            </Panel>
          </section>

          {/* ── RUNTIME + WHY ── */}
          <section id="runtime" className="section-grid two-col">
            <Panel title="3. Repair iteration timeline" icon={<Clock3 size={15} />} eyebrow="Validation loop">
              <div className="table-shell">
                <div className="table-head runtime-grid">
                  <div>Stage</div><div>Status</div><div>Time</div>
                </div>
                {DEMO_CASE.runtimeRows.map((row) => (
                  <div key={row.stage} className="table-row runtime-grid">
                    <div className="table-stage">{row.stage}</div>
                    <div>
                      <span className={
                        row.status === "Failed"  ? "status-badge badge-failed" :
                        row.status === "Passed"  ? "status-badge badge-done"   :
                                                   "status-badge badge-total"
                      }>{row.status}</span>
                    </div>
                    <div className="mono-cyan">{row.time}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Why this matters" icon={<BarChart3 size={15} />} eyebrow="Practical impact">
              <div className="stack-md body-copy">
                <div className="info-card">
                  Manual debugging often requires reading error logs, looking up documentation,
                  editing commands or constraint files, and rerunning VTR repeatedly. VTR-LLM
                  automates this loop with controller routing, specialized agents, LLM generation,
                  and validation.
                </div>
                <div className="info-card">
                  Even when an initial repair attempt fails, the system uses feedback from
                  validation to launch another iteration and converge to a valid fix, reducing the
                  human effort required to debug VTR configuration errors.
                </div>
              </div>
            </Panel>
          </section>

          {/* ── DOCS + MODEL ── */}
          <section className="section-grid two-col">
            <Panel title="Related documents" icon={<FileText size={15} />} eyebrow="Reference links">
              <div className="link-list">
                {DEMO_CASE.docLinks.map((doc) => (
                  <a key={doc.href} href={doc.href} target="_blank" rel="noreferrer" className="doc-link-card">
                    <div>
                      <div className="doc-title">{doc.label}</div>
                      <div className="doc-subtitle">Open source documentation relevant to this repair task.</div>
                    </div>
                    <ChevronRight size={15} className="doc-arrow" />
                  </a>
                ))}
              </div>
            </Panel>

            <Panel title="Model behavior on the same repair task" icon={<Bot size={15} />} eyebrow="Model comparison">
              <div className="model-select-wrap">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="model-select"
                >
                  <option value="llama">Llama 3.3 70B</option>
                  <option value="llama8b">Llama 3.1-8B ✗</option>
                  <option value="gptoss">GPT-OSS-20B</option>
                  <option value="qwen">Qwen3-32B</option>
                </select>
              </div>
              {model.failed && (
                <div className="model-fail-banner">
                  <XCircle size={14} style={{ flexShrink: 0 }} />
                  Failed after 3 iterations — root cause not identified
                </div>
              )}
              <div className="error-meta">
                <div className="error-meta-row">
                  <span className="error-meta-label">Command</span>
                  <code className="error-meta-code" style={{ color: "var(--muted)" }}>{model.command}</code>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">{model.failed ? "Attempted fix" : "Fixed line"}</span>
                  <code className={`error-meta-code${model.failed ? "" : " error-meta-code-green"}`}>{model.fixedLine}</code>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">Explanation</span>
                  <span className="error-meta-value">{model.explanation}</span>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">Avg output tokens</span>
                  <span className="error-meta-value mono-cyan">{model.avgTokens}</span>
                </div>
              </div>
            </Panel>
          </section>

          {/* ── ACCOMPLISHMENTS ── */}
          <section className="section-grid">
            <div className="accomplish-panel">
              <div className="accomplish-header">
                <div className="accomplish-eyebrow">Accomplishments</div>
                <h2 className="accomplish-title">Publications &amp; Recognition</h2>
              </div>
              <div className="accomplish-card">
                <div className="accomplish-badge">Under Review</div>
                <div className="accomplish-paper-title">VTR-LLM: Multi-Agent LLM Framework for Automated Debugging of FPGA CAD Flows</div>
                <div className="accomplish-authors">Mohamed A. Elgammal · Jamie Wu · Lynne Liu · Taehoon Kim · Vaughn Betz</div>
                <div className="accomplish-affil">Electrical and Computer Engineering Department, University of Toronto, Canada</div>
              </div>
            </div>
          </section>

          {/* ── FOOTER ── */}
          <footer className="site-footer">
            <div className="footer-title">VTR-LLM: Automated Debugging of FPGA CAD Flows with Multi-Agent LLMs</div>
            <div className="footer-meta">
              <span className="footer-item"><span className="footer-label">Project</span> 2025142</span>
              <span className="footer-sep">·</span>
              <span className="footer-item"><span className="footer-label">Supervisor</span> Dr. Vaughn Betz</span>
              <span className="footer-sep">·</span>
              <span className="footer-item"><span className="footer-label">Administrator</span> Dr. Eric Lefebvre</span>
              <span className="footer-sep">·</span>
              <span className="footer-item"><span className="footer-label">Team</span> Kailin Liu, Yu Kai Wu, Taehoon Kim</span>
            </div>
            <div className="footer-uni">
              The Edward S. Rogers Sr. Department of Electrical &amp; Computer Engineering — University of Toronto
            </div>
          </footer>
        </main>

        {/* ── VIDEO MODAL ── */}
        {videoOpen && (
          <div className="modal-backdrop" onClick={() => setVideoOpen(false)}>
            <motion.div
              className="modal-box"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <span className="modal-title">Real debug session recording</span>
                <button className="modal-close" onClick={() => setVideoOpen(false)} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="modal-video-wrap">
                <video
                  src="/src/assets/human_debug.mov"
                  controls
                  className="modal-video"
                  onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                />
                <div className="modal-placeholder" style={{ display: "none" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span>Video not yet available.<br/>Place <code>human_debug.mov</code> in <code>src/assets/</code></span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </>
  );
}

function Panel({ title, icon, eyebrow, children, completionBadge, extraClass }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.6 }}
      className={`panel${extraClass ? " " + extraClass : ""}`}
    >
      <div className="panel-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel-eyebrow">{eyebrow}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <h2 className="panel-title">{title}</h2>
            {completionBadge && (
              <motion.span
                className={`time-badge ${completionBadge.variant}`}
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={completionBadge.show ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.85, y: 4 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {completionBadge.label}
              </motion.span>
            )}
          </div>
        </div>
        <div className="panel-icon">{icon}</div>
      </div>
      {children}
    </motion.section>
  );
}

const styles = `
:root {
  color-scheme: dark;
  --bg: #07111f;
  --panel: rgba(255,255,255,0.045);
  --border: rgba(255,255,255,0.1);
  --border-soft: rgba(255,255,255,0.08);
  --text: #e5eefc;
  --muted: #9fb0c8;
  --muted-2: #6f8098;
  --cyan: #93ecff;
  --green: #8bf4c6;
  --rose: #ff9fb3;
  --amber: #ffd27a;
  --shadow: 0 1.5rem 5rem rgba(0,0,0,0.22);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}
a { color: inherit; text-decoration: none; }
button { font: inherit; }

.app-shell { min-height: 100vh; position: relative; }

.background-layer { position: fixed; inset: 0; overflow: hidden; pointer-events: none; }
.glow { position: absolute; border-radius: 999rem; filter: blur(5rem); }
.glow-top { left: 50%; top: 0; width: 70vw; height: 42vh; transform: translateX(-50%); background: rgba(34,211,238,0.1); }
.glow-bottom { right: 8%; bottom: 8%; width: 30vw; height: 28vh; background: rgba(139,92,246,0.1); }
.grid-overlay { position: absolute; inset: 0; opacity: 0.08; background-image: linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px); background-size: clamp(2.5rem,5vw,4rem) clamp(2.5rem,5vw,4rem); }

.page { position: relative; width: min(92vw, 78rem); margin: 0 auto; padding: clamp(2rem,4vw,3rem) 0; display: flex; flex-direction: column; gap: clamp(4rem,8vw,7rem); }

.section-grid { display: grid; gap: clamp(1rem,2vw,1.4rem); }
.two-col { grid-template-columns: 1fr; }
@media (min-width: 64rem) { .two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.hero { padding-top: clamp(2rem,4vw,4rem); }
.stack-lg { display: flex; flex-direction: column; gap: clamp(1rem,2vw,1.5rem); }
.stack-md { display: flex; flex-direction: column; gap: 1rem; }

.eyebrow-pill { display: inline-flex; align-items: center; gap: 0.6rem; width: fit-content; padding: 0.55rem 1rem; border-radius: 999rem; border: 1px solid rgba(34,211,238,0.2); background: rgba(34,211,238,0.1); color: var(--cyan); font-size: clamp(0.75rem,1vw,0.9rem); }
.hero-title { margin: 0; max-width: 12ch; font-size: clamp(2.5rem,7vw,5.6rem); line-height: 0.95; letter-spacing: -0.04em; }
.hero-subtitle { margin: 0; max-width: 62ch; font-size: clamp(1rem,1.4vw,1.18rem); line-height: 1.7; color: var(--muted); }
.hero-note { margin: 0; max-width: 64ch; font-size: clamp(0.92rem,1vw,1rem); line-height: 1.75; color: var(--muted-2); }

.button-row { display: flex; flex-wrap: wrap; gap: 0.9rem; }
.primary-btn, .secondary-btn { display: inline-flex; align-items: center; gap: 0.7rem; border-radius: 999rem; padding: 0.85rem 1.2rem; transition: 0.2s ease; }
.primary-btn { border: 1px solid rgba(147,236,255,0.3); background: rgba(147,236,255,0.15); color: #effcff; cursor: pointer; }
.primary-btn:hover:not(:disabled) { background: rgba(147,236,255,0.22); border-color: rgba(147,236,255,0.5); }
.primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.secondary-btn { border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: var(--text); }
.secondary-btn:hover { background: rgba(255,255,255,0.1); }

.panel { border-radius: 2rem; border: 1px solid var(--border); background: var(--panel); padding: clamp(1rem,2vw,1.4rem); backdrop-filter: blur(1rem); box-shadow: var(--shadow); }
.panel-fixed { height: 70vh; overflow: hidden; display: flex; flex-direction: column; }
.panel-fixed .compression-note { flex-shrink: 0; }
.panel-fixed .video-btn { flex-shrink: 0; width: 100%; justify-content: center; box-sizing: border-box; }
.panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.panel-eyebrow { margin-bottom: 0.25rem; color: rgba(147,236,255,0.8); font-size: clamp(0.75rem,0.9vw,0.84rem); letter-spacing: 0.18em; text-transform: uppercase; }
.panel-title { margin: 0; color: #f4f8ff; font-size: clamp(1.15rem,1.8vw,1.5rem); letter-spacing: -0.02em; }
.panel-icon { display: flex; align-items: center; justify-content: center; width: 2.2rem; aspect-ratio: 1; border-radius: 999rem; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: var(--cyan); flex-shrink: 0; }

.code-shell { border-radius: 1.5rem; border: 1px solid var(--border); background: #08101b; padding: clamp(1rem,2vw,1.2rem); font-family: "SFMono-Regular", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: clamp(0.82rem,1vw,0.96rem); line-height: 1.8; min-height: 14rem; }
.code-shell-scroll { flex: 1 1 0; min-height: 0; height: auto; overflow-y: auto; scroll-behavior: smooth; }
.code-shell-scroll::-webkit-scrollbar { width: 4px; }
.code-shell-scroll::-webkit-scrollbar-track { background: transparent; }
.code-shell-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
.traffic-lights { display: flex; gap: 0.45rem; margin-bottom: 0.8rem; }
.dot { width: 0.7rem; aspect-ratio: 1; border-radius: 999rem; }
.dot-red { background: rgba(251,113,133,0.8); }
.dot-yellow { background: rgba(253,224,71,0.8); }
.dot-green { background: rgba(74,222,128,0.8); }
.code-lines { display: flex; flex-direction: column; gap: 0.35rem; }
.line-default { color: #d8e1f1; }
.line-muted { color: var(--muted-2); font-style: italic; }
.line-error { color: var(--rose); }
.line-success { color: var(--green); }
.line-doc-header { color: var(--cyan); font-weight: 600; border-top: 1px solid rgba(147,236,255,0.15); margin-top: 0.4rem; padding-top: 0.4rem; }
.line-doc-body { color: #b0c4de; padding-left: 0.2rem; }
.line-doc-highlight { color: var(--amber); font-style: italic; padding-left: 0.2rem; }
.mono-cyan { color: var(--cyan); }
.cursor-block { display: inline-block; width: 0.62ch; height: 1.1em; margin-left: 0.08rem; transform: translateY(0.2em); background: var(--cyan); animation: blink 1s steps(1) infinite; }
@keyframes blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

.step-list { display: flex; flex-direction: column; gap: 0.8rem; }
.step-list-scroll { display: flex; flex-direction: column; gap: 0.8rem; flex: 1 1 0; min-height: 0; height: auto; overflow-y: auto; padding-right: 0.25rem; }
.step-list-scroll::-webkit-scrollbar { width: 4px; }
.step-list-scroll::-webkit-scrollbar-track { background: transparent; }
.step-list-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
.step-card { display: flex; gap: 0.85rem; padding: 1rem; border-radius: 1.25rem; border: 1px solid var(--border); background: rgba(255,255,255,0.05); }
.step-active { border-color: rgba(147,236,255,0.3); background: rgba(147,236,255,0.1); }
.step-done { border-color: rgba(139,244,198,0.2); background: rgba(139,244,198,0.1); }
.step-failed { border-color: rgba(255,159,179,0.2); background: rgba(255,159,179,0.1); }
.step-icon-wrap { display: flex; align-items: center; justify-content: center; width: 1.6rem; aspect-ratio: 1; border-radius: 999rem; background: rgba(255,255,255,0.1); color: var(--text); flex-shrink: 0; margin-top: 0.12rem; font-size: 0.82rem; }
.icon-failed { color: var(--rose); }
.icon-done { color: var(--green); }
.step-copy { display: flex; flex-direction: column; gap: 0.3rem; }
.step-title { color: #f4f8ff; font-size: clamp(0.96rem,1vw,1rem); font-weight: 500; }
.step-state { font-size: clamp(0.82rem,0.95vw,0.9rem); }
.state-active { color: var(--cyan); }
.state-failed { color: var(--rose); }
.state-retry { color: var(--amber); }
.state-done { color: var(--green); }

.table-shell { overflow: hidden; border-radius: 1.5rem; border: 1px solid var(--border); background: rgba(255,255,255,0.05); }
.runtime-grid { grid-template-columns: 1.6fr 0.8fr 0.6fr; }
.model-grid { grid-template-columns: 1fr 1fr 0.75fr; }
.table-head, .table-row { display: grid; gap: 0.75rem; padding: 1rem; }
.table-head { border-bottom: 1px solid var(--border); color: var(--muted-2); font-size: clamp(0.8rem,0.95vw,0.9rem); text-transform: uppercase; letter-spacing: 0.16em; }
.table-row { border-bottom: 1px solid var(--border-soft); font-size: clamp(0.9rem,1vw,0.96rem); }
.table-row:last-child { border-bottom: 0; }
.table-stage { color: #eef4ff; }
.status-badge { display: inline-flex; padding: 0.4rem 0.75rem; border-radius: 999rem; border: 1px solid; font-size: clamp(0.78rem,0.95vw,0.88rem); }
.badge-failed { border-color: rgba(255,159,179,0.3); background: rgba(255,159,179,0.1); color: #ffd9e1; }
.badge-done { border-color: rgba(139,244,198,0.3); background: rgba(139,244,198,0.1); color: #dfffee; }
.badge-total { border-color: rgba(147,236,255,0.3); background: rgba(147,236,255,0.1); color: var(--cyan); }

.body-copy { font-size: clamp(0.95rem,1vw,1rem); line-height: 1.8; color: var(--muted); }
.info-card { border-radius: 1.25rem; border: 1px solid var(--border); padding: 1rem; background: rgba(255,255,255,0.05); }

.link-list { display: flex; flex-direction: column; gap: 0.8rem; }
.doc-link-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-radius: 1.25rem; border: 1px solid var(--border); background: rgba(255,255,255,0.05); padding: 1rem; transition: 0.2s ease; }
.doc-link-card:hover { border-color: rgba(147,236,255,0.3); background: rgba(147,236,255,0.1); }
.doc-title { color: #f4f8ff; font-size: clamp(0.96rem,1vw,1rem); font-weight: 500; }
.doc-subtitle { margin-top: 0.2rem; color: var(--muted); font-size: clamp(0.84rem,0.95vw,0.9rem); }
.doc-arrow { color: var(--muted-2); flex-shrink: 0; }

.model-select-wrap { margin-bottom: 1rem; }
.model-select { appearance: none; background: #08101b; color: var(--text); border: 1px solid rgba(147,236,255,0.3); border-radius: 0.8rem; padding: 0.55rem 1rem; font-size: 0.9rem; font-family: inherit; cursor: pointer; outline: none; min-width: 200px; }
.model-select:focus { border-color: rgba(147,236,255,0.6); }
.model-fail-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.9rem; border-radius: 0.8rem; border: 1px solid rgba(255,159,179,0.3); background: rgba(255,159,179,0.08); color: var(--rose); font-size: 0.85rem; margin-bottom: 0.75rem; }

.time-badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.7rem; border-radius: 999rem; border: 1px solid; font-size: 0.8rem; font-weight: 500; white-space: nowrap; }
.badge-fast { border-color: rgba(139,244,198,0.35); background: rgba(139,244,198,0.12); color: #8bf4c6; }
.badge-slow { border-color: rgba(255,210,122,0.35); background: rgba(255,210,122,0.1); color: #ffd27a; }
.time-badge-link { text-decoration: none; transition: 0.2s ease; cursor: pointer; }
.time-badge-link:hover { filter: brightness(1.15); }

.compression-note { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.7rem 0.9rem; border-radius: 0.9rem; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); font-size: clamp(0.72rem,0.88vw,0.82rem); line-height: 1.6; color: var(--muted-2); margin-top: 0.75rem; white-space: normal; word-break: break-word; overflow: visible; }
.compress-ratio { color: var(--cyan); font-family: "SFMono-Regular", ui-monospace, monospace; font-size: 0.82rem; }
.compress-link { color: rgba(147,236,255,0.7); text-decoration: underline; text-underline-offset: 2px; transition: color 0.2s; }
.compress-link:hover { color: var(--cyan); }

.video-btn { display: flex; align-items: center; justify-content: center; gap: 0.55rem; margin-top: 0.75rem; padding: 0.55rem 1rem; border-radius: 999rem; border: 1px solid rgba(147,236,255,0.25); background: rgba(147,236,255,0.08); color: var(--cyan); font-size: 0.85rem; cursor: pointer; transition: 0.2s ease; width: 100%; box-sizing: border-box; }
.video-btn:hover { background: rgba(147,236,255,0.15); border-color: rgba(147,236,255,0.45); }

.error-meta { margin-top: 0.75rem; border-radius: 1.25rem; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); overflow: hidden; }
.error-meta-row { display: grid; grid-template-columns: 7rem 1fr; gap: 0.75rem; padding: 0.7rem 1rem; align-items: start; }
.error-meta-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 0; }
.error-meta-label { color: var(--muted-2); font-size: 0.82rem; padding-top: 0.05rem; white-space: nowrap; }
.error-meta-value { color: var(--muted); font-size: 0.88rem; line-height: 1.6; }
.error-meta-value code { font-family: "SFMono-Regular", ui-monospace, monospace; color: var(--cyan); font-size: 0.83rem; }
.error-meta-code { font-family: "SFMono-Regular", ui-monospace, monospace; font-size: 0.83rem; color: var(--rose); line-height: 1.6; word-break: break-all; }
.error-meta-code-green { color: var(--green); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.5rem; }
.modal-box { background: #0e1c2e; border: 1px solid rgba(255,255,255,0.12); border-radius: 1.5rem; width: min(90vw, 56rem); overflow: hidden; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
.modal-title { color: #f4f8ff; font-size: 1rem; font-weight: 500; }
.modal-close { display: flex; align-items: center; justify-content: center; width: 2rem; aspect-ratio: 1; border-radius: 999rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--muted); cursor: pointer; transition: 0.2s; }
.modal-close:hover { background: rgba(255,255,255,0.1); color: var(--text); }
.modal-video-wrap { position: relative; width: 100%; background: #000; max-height: 80vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.modal-video { width: 100%; height: auto; max-height: 75vh; display: block; object-fit: contain; }
.modal-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 4rem 2rem; color: var(--muted-2); font-size: 0.9rem; text-align: center; line-height: 1.6; }
.modal-placeholder code { font-family: "SFMono-Regular", ui-monospace, monospace; color: var(--cyan); font-size: 0.85rem; }

.accomplish-panel { border-radius: 2rem; border: 1px solid var(--border); background: var(--panel); padding: clamp(1rem,2vw,1.4rem); backdrop-filter: blur(1rem); box-shadow: var(--shadow); }
.accomplish-header { margin-bottom: 1rem; }
.accomplish-eyebrow { color: rgba(147,236,255,0.8); font-size: clamp(0.75rem,0.9vw,0.84rem); letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 0.25rem; }
.accomplish-title { margin: 0; color: #f4f8ff; font-size: clamp(1.15rem,1.8vw,1.5rem); letter-spacing: -0.02em; }
.accomplish-card { display: flex; flex-direction: column; gap: 0.5rem; border-radius: 1.25rem; border: 1px solid rgba(147,236,255,0.15); background: rgba(147,236,255,0.05); padding: 1.1rem 1.2rem; }
.accomplish-badge { display: inline-flex; align-self: flex-start; padding: 0.3rem 0.75rem; border-radius: 999rem; border: 1px solid rgba(255,210,122,0.35); background: rgba(255,210,122,0.1); color: var(--amber); font-size: 0.78rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.accomplish-paper-title { color: #f4f8ff; font-size: clamp(0.96rem,1.1vw,1.05rem); font-weight: 600; line-height: 1.5; }
.accomplish-authors { color: var(--cyan); font-size: clamp(0.84rem,0.95vw,0.9rem); line-height: 1.6; }
.accomplish-affil { color: var(--muted-2); font-size: clamp(0.78rem,0.88vw,0.84rem); }

.site-footer { border-top: 1px solid rgba(255,255,255,0.08); border-radius: 2rem; background: rgba(255,255,255,0.045); backdrop-filter: blur(1rem); padding: clamp(1.5rem,3vw,2rem) clamp(1.2rem,2vw,1.8rem); margin-top: clamp(1rem,2vw,1.5rem); display: flex; flex-direction: column; gap: 0.6rem; }
.footer-title { color: #f4f8ff; font-size: clamp(0.95rem,1.2vw,1.05rem); font-weight: 500; letter-spacing: -0.01em; }
.footer-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.5rem; font-size: clamp(0.8rem,0.95vw,0.88rem); color: var(--muted); }
.footer-label { color: var(--muted-2); margin-right: 0.25rem; }
.footer-sep { color: rgba(255,255,255,0.2); }
.footer-uni { font-size: clamp(0.76rem,0.88vw,0.82rem); color: var(--muted-2); }

@media (max-width: 52rem) {
  .runtime-grid, .model-grid { grid-template-columns: 1fr; }
  .table-head { display: none; }
  .table-row { grid-template-columns: 1fr; gap: 0.55rem; }
  .panel-header, .doc-link-card { flex-direction: column; align-items: flex-start; }
  .panel-fixed { height: 80vh; }
}
`;