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
// Real runtime: 8.2 + 14.4 + 7.7 + 13.3 = 43.6 s
// Animation compressed to ~11 s   →   compression ratio  43.6s / 11s ≈ 3.96×
// Each real second ≈ 253 ms in animation
//   iter1 agent  8.2s → 2072ms (split 1036 + 1036)
//   iter1 VTR   14.4s → 3643ms
//   iter2 agent  7.7s → 1948ms (split 974 + 974)
//   iter2 VTR   13.3s → 3363ms
//   total animation: 11026ms ≈ 11 s

const AUTO_STEPS = [
  { text: "Controller parses error log and routes to SDC Agent",      type: "normal", phase: "iter1-agent", duration: 1036 },
  { text: "SDC Agent retrieves RAG context and calls LLM (Iter 1)",   type: "normal", phase: "iter1-agent", duration: 1036 },
  { text: "Iter 1 VTR validation run — constraint still rejected",    type: "fail",   phase: "iter1-vtr",   duration: 3643 },
  { text: "Controller feeds error back, starts Iteration 2",          type: "retry",  phase: "iter2-agent", duration: 974  },
  { text: "SDC Agent asks LLM again with updated feedback (Iter 2)",  type: "normal", phase: "iter2-agent", duration: 974  },
  { text: "Iter 2 VTR validation run — timing constraints loaded ✓",  type: "pass",   phase: "iter2-vtr",   duration: 3363 },
];

// ── HUMAN animation ───────────────────────────────────────────────────────────
// Real estimated debug time: ~5 min (est.)
// Ref: https://docs.verilogtorouting.org/en/v9.0.0/vpr/sdc_commands/
//
// Animation compressed to ~25 s  →  compression ratio  300s / 25s = 12×
// Automated is ~11s, so human is ~2.3× slower in animation,
// which mirrors the real gap (5 min vs 43.6 s ≈ 6.9×) directionally.
const HUMAN_STEPS = [
  { delay: 400,  type: "cmd",    line: "$ cat stereovision0.sdc" },
  { delay: 500,  type: "output", line: "1  create_clock -period 10 tm3_clk_v0" },
  { delay: 300,  type: "output", line: "2  set_clock_latency [get_clocks {tm3_clk_v0}]" },
  { delay: 600,  type: "cmd",    line: "$ ./vpr k6_frac... --sdc_file stereovision0.sdc" },
  { delay: 800,  type: "error",  line: "Error: set_clock_latency missing latency value." },
  // reading error, thinking — ~40s real → 3300ms
  { delay: 3300, type: "cmd",    line: "$ grep -rn 'set_clock_latency' vtr_docs/" },
  { delay: 900,  type: "output", line: "vpr/sdc_commands.rst:  set_clock_latency ..." },
  // opens browser, navigates to VTR SDC docs — ~60s real → 5000ms
  { delay: 5000, type: "cmd",    line: "$ open https://docs.verilogtorouting.org/en/v9.0.0/vpr/sdc_commands/" },
  // scrolling through doc looking for set_clock_latency — ~90s real → 7500ms
  { delay: 7500, type: "output", line: "(scanning set_clock_latency syntax... found -source flag)" },
  // editing the file — ~20s real → 1700ms
  { delay: 1700, type: "cmd",    line: "$ nano stereovision0.sdc" },
  { delay: 1200, type: "output", line: "  2  set_clock_latency -source 1.0 [get_clocks {tm3_clk_v0}]" },
  { delay: 500,  type: "cmd",    line: "$ ./vpr k6_frac... --sdc_file stereovision0.sdc" },
  { delay: 800,  type: "success",line: "Timing constraints loaded successfully." },
];
// cumulative: 400+500+300+600+800+3300+900+5000+7500+1700+1200+500+800 = 23500ms ≈ 25s ✓


const DEMO_CASE = {
  humanTimeRef: "https://docs.verilogtorouting.org/en/v9.0.0/vpr/sdc_commands/",
  runtimeRows: [
    { stage: "Iteration 1: Agent + RAG + LLM inference", status: "Passed",  time: "8.2 s"  },
    { stage: "Iteration 1: VTR validation run",           status: "Failed",  time: "14.4 s" },
    { stage: "Iteration 2: Agent + RAG + LLM inference", status: "Passed",  time: "7.7 s"  },
    { stage: "Iteration 2: VTR validation run",           status: "Passed",  time: "13.3 s" },
    { stage: "Total example runtime",                     status: "Success", time: "43.6 s" },
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
      command: "./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --sdc_file A.sdc",
      fixedLine: "set_clock_latency -source 1.0 [get_clocks {tm3_clk_v0}]",
      explanation: "Second iteration adds '-source 1.0'. The missing latency type caused the error; adding it satisfies VPR SDC syntax.",
      avgTokens: "185.8",
    },
    llama8b: {
      name: "Llama 3.1-8B",
      command: "/home/taehoonk/fall2025/vtr-verilog-to-routing/vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --sdc_file modified.sdc",
      fixedLine: "set_clock_latency -source [get_clocks {tm3_clk_v0}] -early 0.0 / -late 0.0",
      explanation: "The original SDC file was missing the clock latency value required for VPR to load timing constraints. Added -early and -late options to specify the clock latency value, assuming it to be 0.0.",
      avgTokens: "272.8",
    },
    gpt41: {
      name: "GPT-OSS-120B",
      command: "./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --sdc_file A.sdc",
      fixedLine: "set_clock_latency -source 0 [get_clocks {tm3_clk_v0}]",
      explanation: "set_clock_latency requires a latency type (e.g. -source). Adding '-source 0' (zero source latency) satisfies the SDC syntax, allowing VPR to load timing constraints successfully.",
      avgTokens: "1292.7",
    },
    gptoss: {
      name: "GPT-OSS-20B",
      command: "./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --sdc_file A.sdc",
      fixedLine: "set_clock_latency -source 0.0 [get_clocks {tm3_clk_v0}]",
      explanation: "The error was caused by a missing clock latency type in the SDC. Adding the required '-source' option (with a latency value of 0.0) satisfies VPR syntax and resolves the load timing constraints error.",
      avgTokens: "1443.6",
    },
    qwen: {
      name: "Qwen3-32B",
      command: "./vpr/vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --sdc_file A.sdc",
      fixedLine: "set_clock_latency -source 0.5 [get_clocks {tm3_clk_v0}]",
      explanation: "Line 2 of the SDC file used set_clock_latency without specifying the required latency type (-source or -network). The fix adds '-source' with a default value of 0.5 ns to satisfy the syntax requirement while preserving the original intent of defining clock latency.",
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
            <Panel title="Manual debugging workflow" icon={<User size={15} />} eyebrow="Human effort" completionBadge={{ label: "~5 min (est.)", variant: "badge-slow", show: humanDone }}>
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
                  Animation compressed. Est. avg debug time ~5 min → ~25 s in demo{" "}
                  <span className="compress-ratio">(12×)</span>.
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
            <Panel title="VTR-LLM repair workflow" icon={<Bot size={15} />} eyebrow="Automated system" completionBadge={{ label: "43.6 s (avg)", variant: "badge-fast", show: autoDone }}>
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
                  Animation compressed. Avg processing time 43.6 s → ~11 s in demo{" "}
                  <span className="compress-ratio">(3.96×)</span>.{" "}
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
                  <div className="line-error">{"1  create_clock -period 10 tm3_clk_v0"}</div>
                  <div className="line-error">{"2  set_clock_latency [get_clocks {tm3_clk_v0}]"}</div>
                </div>
              </div>
              <div className="error-meta">
                <div className="error-meta-row">
                  <span className="error-meta-label">SDC line with error</span>
                  <code className="error-meta-code">{"set_clock_latency [get_clocks {tm3_clk_v0}]"}</code>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">Issue</span>
                  <span className="error-meta-value">Missing <code>-source</code> flag and latency value</span>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">Explanation</span>
                  <span className="error-meta-value">Add <code>-source 1.0</code> to specify the required source latency before the clock target</span>
                </div>
              </div>
            </Panel>

            <Panel title="2. Generated fix" icon={<CheckCircle2 size={15} />} eyebrow="System output">
              <div className="code-shell">
                <div className="traffic-lights">
                  <span className="dot dot-red" /><span className="dot dot-yellow" /><span className="dot dot-green" />
                </div>
                <div className="code-lines">
                  <div className="line-default">Controller decided to use SDC_RAG mode.</div>
                  <div className="line-default">Modified Command Suggestion:</div>
                  <div className="line-default">{"A. ./vpr k6_frac_N10_frac_chain_mem32K_40nm.xml stereovision0.pre-vpr.blif --sdc_file modified.sdc"}</div>
                  <div className="line-default">&nbsp;</div>
                  <div className="line-default">B.</div>
                  <div className="line-default">{"1. create_clock -period 10 tm3_clk_v0"}</div>
                  <div className="line-success">{"2. set_clock_latency -source 1.0 [get_clocks {tm3_clk_v0}]"}</div>
                  <div className="line-default">&nbsp;</div>
                  <div className="line-default">{"C. The original SDC command missed the latency value."}</div>
                  <div className="line-default">{"   The repair adds '-source 1.0' so the constraint becomes valid."}</div>
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
                  <option value="llama8b">Llama 3.1-8B</option>
                  <option value="gpt41">GPT-OSS-120B</option>
                  <option value="gptoss">GPT-OSS-20B</option>
                  <option value="qwen">Qwen3-32B</option>
                </select>
              </div>
              <div className="error-meta">
                <div className="error-meta-row">
                  <span className="error-meta-label">Command</span>
                  <code className="error-meta-code" style={{ color: "var(--muted)" }}>{model.command}</code>
                </div>
                <div className="error-meta-divider" />
                <div className="error-meta-row">
                  <span className="error-meta-label">Fixed SDC line</span>
                  <code className="error-meta-code error-meta-code-green">{model.fixedLine}</code>
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
                  src="/assets/debug-demo.mp4"
                  controls
                  className="modal-video"
                  onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                />
                <div className="modal-placeholder" style={{ display: "none" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span>Video not yet available.<br/>Place <code>debug-demo.mp4</code> in <code>/assets/</code></span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </>
  );
}

function Panel({ title, icon, eyebrow, children, completionBadge }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.6 }}
      className="panel"
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
.panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.panel-eyebrow { margin-bottom: 0.25rem; color: rgba(147,236,255,0.8); font-size: clamp(0.75rem,0.9vw,0.84rem); letter-spacing: 0.18em; text-transform: uppercase; }
.panel-title { margin: 0; color: #f4f8ff; font-size: clamp(1.15rem,1.8vw,1.5rem); letter-spacing: -0.02em; }
.panel-icon { display: flex; align-items: center; justify-content: center; width: 2.2rem; aspect-ratio: 1; border-radius: 999rem; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: var(--cyan); flex-shrink: 0; }

.code-shell { border-radius: 1.5rem; border: 1px solid var(--border); background: #08101b; padding: clamp(1rem,2vw,1.2rem); font-family: "SFMono-Regular", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: clamp(0.82rem,1vw,0.96rem); line-height: 1.8; min-height: 14rem; }
.code-shell-scroll { min-height: 18rem; max-height: 28rem; overflow-y: auto; scroll-behavior: smooth; }
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
.step-list-scroll { display: flex; flex-direction: column; gap: 0.8rem; min-height: 28rem; max-height: 34rem; overflow-y: auto; padding-right: 0.25rem; }
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

.time-badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.7rem; border-radius: 999rem; border: 1px solid; font-size: 0.8rem; font-weight: 500; white-space: nowrap; }
.badge-fast { border-color: rgba(139,244,198,0.35); background: rgba(139,244,198,0.12); color: #8bf4c6; }
.badge-slow { border-color: rgba(255,210,122,0.35); background: rgba(255,210,122,0.1); color: #ffd27a; }
.time-badge-link { text-decoration: none; transition: 0.2s ease; cursor: pointer; }
.time-badge-link:hover { filter: brightness(1.15); }

.compression-note { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.7rem 0.9rem; border-radius: 0.9rem; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); font-size: clamp(0.76rem,0.88vw,0.82rem); line-height: 1.6; color: var(--muted-2); margin-top: 0.75rem; }
.compress-ratio { color: var(--cyan); font-family: "SFMono-Regular", ui-monospace, monospace; font-size: 0.82rem; }
.compress-link { color: rgba(147,236,255,0.7); text-decoration: underline; text-underline-offset: 2px; transition: color 0.2s; }
.compress-link:hover { color: var(--cyan); }

.video-btn { display: inline-flex; align-items: center; gap: 0.55rem; margin-top: 0.75rem; padding: 0.55rem 1rem; border-radius: 999rem; border: 1px solid rgba(147,236,255,0.25); background: rgba(147,236,255,0.08); color: var(--cyan); font-size: 0.85rem; cursor: pointer; transition: 0.2s ease; width: fit-content; }
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
.modal-video-wrap { position: relative; width: 100%; background: #000; }
.modal-video { width: 100%; display: block; max-height: 70vh; }
.modal-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 4rem 2rem; color: var(--muted-2); font-size: 0.9rem; text-align: center; line-height: 1.6; }
.modal-placeholder code { font-family: "SFMono-Regular", ui-monospace, monospace; color: var(--cyan); font-size: 0.85rem; }

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
}
`;