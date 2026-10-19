"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Box, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Code2, Cpu, DollarSign, ExternalLink, FileText, FlaskConical, Globe2, Layers3, LoaderCircle, MapPin, Play, Plus, Radio, Search, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import { ROBOT_GOAL, WEATHER_GOAL } from "@/lib/demo";
import { agentEventSchema, type Bom, type BomRow, type PartRequirement, type VerificationStatus } from "@/lib/schema";
import { money, priceLabel, statusLabels, toCsv } from "@/lib/format";

type Activity = { label: string; done: boolean; error?: string };
type Question = { id: string; text: string };
function Status({ status, label }: { status: VerificationStatus; label?: string }) {
  return <span className={`status status-${status}`}><i />{label ?? statusLabels[status]}</span>;
}
function Checked({ row, field }: { row: BomRow; field: "price" | "leadTimeDays" }) {
  const evidence = row.fields[field].evidence[0];
  return evidence ? <a className="checked-link" href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`Checked ${new Date(evidence.checkedAt).toLocaleString()}`}>Source · {new Date(evidence.checkedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}<ArrowUpRight size={10} /></a> : <span className="checked-link">Unverified</span>;
}

export default function Home() {
  const [goal, setGoal] = useState(ROBOT_GOAL);
  const [budget, setBudget] = useState("3500");
  const [currency, setCurrency] = useState("AUD");
  const [shipTo, setShipTo] = useState("Sydney, Australia");
  const [deadlineDays, setDeadlineDays] = useState("21");
  const [parts, setParts] = useState<PartRequirement[]>([]);
  const [rows, setRows] = useState<BomRow[]>([]);
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answer, setAnswer] = useState("");
  const [bom, setBom] = useState<Bom | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(true);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BomRow | null>(null);
  const [guide, setGuide] = useState(false);
  const [toast, setToast] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<{ subject: string; body: string; url?: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [sheets, setSheets] = useState(false);
  const stream = useRef<EventSource | null>(null);
  const startTime = useRef(0);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const guideRef = useRef<HTMLDialogElement>(null);
  useEffect(() => () => stream.current?.close(), []);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000); return () => clearInterval(timer); }, [busy]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (selected) drawerRef.current?.showModal(); else drawerRef.current?.close(); }, [selected]);
  useEffect(() => { if (guide) guideRef.current?.showModal(); else guideRef.current?.close(); }, [guide]);
  useEffect(() => { fetch("/api/integrations").then((r) => r.json()).then((data) => { setSheets(Boolean(data.sheets)); setDemo(Boolean(data.mock)); }).catch(() => {}); }, []);

  async function start(replay = false) {
    if (busy) return;
    stream.current?.close();
    setRows([]); setParts([]); setActivity({}); setAssumptions([]); setQuestions([]); setBom(null); setError(""); setSelected(null); setDraft(null); setBusy(true); setElapsed(0); startTime.current = Date.now();
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, budget: Number(budget), currency, shipTo, deadlineDays: Number(deadlineDays), replay }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRunId(data.runId); setDemo(data.demo);
      const source = new EventSource(`/api/runs/${data.runId}/events`); stream.current = source;
      let failures = 0;
      source.onopen = () => { failures = 0; };
      source.onmessage = ({ data: raw }) => {
        try {
          const event = agentEventSchema.parse(JSON.parse(raw));
          if (event.type === "plan") setParts(event.parts);
          if (event.type === "assumption") setAssumptions((a) => [...a, event.text]);
          if (event.type === "question") setQuestions((q) => [...q, { id: event.id, text: event.text }]);
          if (event.type === "crawler_started") setActivity((a) => ({ ...a, [event.partId]: { label: "Starting research", done: false } }));
          if (event.type === "step") setActivity((a) => ({ ...a, [event.partId]: { label: event.label, done: false } }));
          if (event.type === "part_result") {
            setRows((r) => [...r.filter((row) => row.part.id !== event.partId), event.row]);
            setActivity((a) => ({ ...a, [event.partId]: { label: event.row.needsQuote ? "Fabrication quote needed" : `${event.row.fields.price.sourceCount} independent source${event.row.fields.price.sourceCount === 1 ? "" : "s"} checked`, done: true } }));
          }
          if (event.type === "error") {
            if (event.partId) setActivity((a) => ({ ...a, [event.partId!]: { label: "No verified results", error: event.message, done: true } }));
            else setError(event.message);
          }
          if (event.type === "run_finished") { setBom(event.bom); setRows(event.bom.rows); setBusy(false); source.close(); }
        } catch { setError("An invalid research update was ignored. Your existing results are preserved."); }
      };
      source.onerror = () => { failures++; if (failures >= 3 || source.readyState === EventSource.CLOSED) { source.close(); setBusy(false); setError("The research stream disconnected. Start a new run to try again."); } };
    } catch (e) { setBusy(false); setError(e instanceof Error ? e.message : "Could not start research."); }
  }
  async function submitAnswer(skip: boolean) {
    const question = questions[0]; if (!question) return;
    try {
      const response = await fetch(`/api/runs/${runId}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: question.id, answer: skip ? "skip" : answer }) });
      if (!response.ok) throw new Error("Could not submit the answer. Please try again.");
      setQuestions((q) => q.slice(1)); setAnswer("");
    } catch (e) { setError((e as Error).message); }
  }
  async function draftRfq(row: BomRow) {
    setSelected(row); setDraft(null); setActionBusy(true);
    try { const response = await fetch(`/api/runs/${runId}/rfq`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId: row.part.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setDraft(data); }
    catch (e) { setToast((e as Error).message); } finally { setActionBusy(false); }
  }
  function exportCsv() {
    if (!bom) return;
    const url = URL.createObjectURL(new Blob([toCsv(bom)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `partscout-${bom.runId.slice(0, 8)}.csv`; link.click(); URL.revokeObjectURL(url); setToast("Bill of materials exported.");
  }
  async function exportSheets() {
    setActionBusy(true);
    try { const response = await fetch(`/api/runs/${runId}/sheets`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.open(data.url, "_blank", "noopener,noreferrer"); setToast("Google Sheet created."); }
    catch (e) { setToast((e as Error).message); } finally { setActionBusy(false); }
  }
  const ordered = parts.map((p) => rows.find((r) => r.part.id === p.id)).filter((r): r is BomRow => Boolean(r));
  const displayRows = parts.length ? ordered : rows;
  const sourceCount = new Set(rows.flatMap((r) => r.candidates.flatMap((c) => c.evidence.map((e) => { try { return new URL(e.sourceUrl).hostname; } catch { return ""; } })))).size;

  return <>
    <header className="topbar"><div className="topbar-inner"><a className="brand" href="/" aria-label="PartScout home"><span className="brand-mark"><Box size={23} strokeWidth={2.2} /></span>partscout<span className="brand-period">.</span></a><span className="nav-divider" /><span className="workspace-label">Sourcing workspace</span><div className="topbar-right"><span className="open-source"><i />Open source, by design</span><button className="icon-button" aria-label="About PartScout and verification" onClick={() => setGuide(true)}><Code2 size={19} /></button><span className="avatar">PS</span></div></div></header>
    <main className="workspace">
      <div className="page-heading"><div><div className="eyebrow"><span className="little-cross">+</span> LESS SEARCHING. MORE BUILDING.</div><h1>Your next build starts here<span>.</span></h1><p>Tell us what you’re making. We’ll find the parts—and the proof.</p></div><button className="text-button how-button" onClick={() => setGuide(true)}><CircleHelp size={15} />How verification works<ArrowUpRight size={13} /></button></div>
      <form className="brief-card" onSubmit={(e) => { e.preventDefault(); void start(); }}>
        <div className="brief-top"><label htmlFor="goal"><Sparkles size={16} />What are you building?</label><span className="agent-tag"><i />YOUR SOURCING AGENT</span></div>
        <textarea id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} required minLength={10} maxLength={3000} disabled={busy} placeholder="Describe your project, what it needs to do, and any must-have specs…" />
        <div className="brief-controls"><div className="constraint budget-field"><label htmlFor="budget"><DollarSign size={14} />Budget</label><div className="constraint-input"><select aria-label="Budget currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={busy}><option>AUD</option><option>USD</option><option>EUR</option><option>GBP</option></select><input id="budget" type="number" min="1" max="10000000" required value={budget} disabled={busy} onChange={(e) => setBudget(e.target.value)} /></div></div><div className="constraint ship-field"><label htmlFor="ship-to"><MapPin size={14} />Ship to</label><input id="ship-to" required minLength={2} maxLength={150} value={shipTo} disabled={busy} onChange={(e) => setShipTo(e.target.value)} /></div><div className="constraint deadline-field"><label htmlFor="deadline"><Clock3 size={14} />Needed in</label><div className="select-wrap"><select id="deadline" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} disabled={busy}><option value="7">1 week</option><option value="14">2 weeks</option><option value="21">3 weeks</option><option value="30">1 month</option><option value="60">2 months</option><option value="90">3 months</option></select><ChevronDown size={13} /></div></div><button type="submit" className="primary-button" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} />Sourcing parts</> : <>Find my parts<ArrowRight size={17} /></>}</button></div>
      </form>
      <div className="examples-row"><div><span>TRY A BUILD</span><button disabled={busy} onClick={() => { setGoal(ROBOT_GOAL); setBudget("3500"); setCurrency("AUD"); setShipTo("Sydney, Australia"); }}><Cpu size={13} />Desktop robot arm<ArrowUpRight size={11} /></button><button disabled={busy} onClick={() => { setGoal(WEATHER_GOAL); setBudget("200"); setCurrency("AUD"); setShipTo("Sydney, Australia"); }}><Globe2 size={13} />Weather station<ArrowUpRight size={11} /></button></div><button className="replay-button" disabled={busy} onClick={() => void start(true)}><Play size={12} fill="currentColor" />Replay demo</button></div>
      {error && <div role="alert" className="error-banner"><TriangleAlert size={17} /><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
      <div className="workbench">
        <aside className="activity-panel panel"><div className="panel-heading"><h2><Radio size={17} />Agent activity</h2>{busy ? <span className="live-badge"><i />LIVE</span> : bom ? <span className="complete-badge"><Check size={12} />DONE</span> : <span className="idle-badge">STANDBY</span>}</div>
          <div className="activity-content" aria-live="polite">
            {busy && !parts.length && !questions.length && <div className="planning-state"><LoaderCircle className="spin" size={19} /><div><strong>Understanding your build</strong><p>Planning parts and checking requirements…</p></div></div>}
            {questions[0] && <div className="question-card"><span className="eyebrow">A QUICK QUESTION</span><p>{questions[0].text}</p><input aria-label="Answer clarifying question" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer…" maxLength={1000} /><button className="small-primary" onClick={() => void submitAnswer(false)} disabled={!answer.trim()}>Continue<ArrowRight size={13} /></button><button className="skip-button" onClick={() => void submitAnswer(true)}>Skip, use your best judgement</button></div>}
            {!busy && !bom && !parts.length && <div className="activity-empty"><div className="radar-icon"><Radio size={24} /><span /></div><h3>Ready when you are.</h3><p>A little context from you.<br />A lot of legwork from us.</p><div className="activity-process"><div><span>01</span><p>Break down your build</p></div><div><span>02</span><p>Scout suppliers in parallel</p></div><div><span>03</span><p>Cross-check every detail</p></div></div></div>}
            {parts.length > 0 && <div className="crawler-list">{parts.map((part, i) => { const state = activity[part.id]; return <div key={part.id} className={`crawler ${state?.done ? "crawler-done" : ""}`}><div className="crawler-icon">{state?.error ? <TriangleAlert size={15} /> : state?.done ? <Check size={15} /> : state ? <LoaderCircle size={15} className="spin" /> : <span>{String(i+1).padStart(2,"0")}</span>}</div><div><strong>{part.name}</strong><p title={state?.error}>{state?.label ?? "Waiting for a research slot"}</p></div></div>; })}</div>}
            {assumptions.length > 0 && <details className="assumptions"><summary><FlaskConical size={13} />Assumptions & notes<span>{assumptions.length}</span><ChevronDown size={12} /></summary>{assumptions.map((a, i) => <p key={i}>{a}</p>)}</details>}
          </div>
          <div className="activity-bottom"><ShieldCheck size={16} /><p><strong>Evidence comes standard.</strong><br />No source? We’ll say so.</p></div>
        </aside>
        <section className="bom-panel panel"><div className="panel-heading"><h2><Layers3 size={17} />Bill of materials<span className="count-badge">{rows.length ? `${rows.length}${busy ? ` / ${parts.length}` : ""}` : "0"}</span></h2><div className="table-actions">{sheets && bom && <button className="export-button" onClick={() => void exportSheets()} disabled={actionBusy}><Plus size={13} />Sheets</button>}<button className="export-button" disabled={!bom} onClick={exportCsv}><ArrowDownToLine size={14} />Export CSV</button></div></div>
          <div className="table-scroll"><table><thead><tr><th className="part-column">PART</th><th className="pick-column">SELECTED PICK</th><th>QTY</th><th>UNIT PRICE</th><th>LEAD TIME</th><th>VERIFICATION</th><th className="row-arrow" /></tr></thead><tbody>{displayRows.map((row, i) => <tr key={row.part.id} className="bom-row" tabIndex={0} onClick={() => { setSelected(row); setDraft(null); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(row); setDraft(null); } }} aria-label={`View evidence for ${row.part.name}`}><td><div className="part-name"><span className="row-number">{String(i+1).padStart(2,"0")}</span><div><strong>{row.part.name}</strong><span className="part-category">{row.part.category === "custom-fabricated" ? "CUSTOM FABRICATION" : row.part.critical ? "CRITICAL COMPONENT" : "OFF-THE-SHELF"}</span></div></div></td><td><strong className="product-name">{row.pick?.productName ?? "Made to your specifications"}</strong><span className="supplier-name">{row.pick?.supplier ?? `${row.suppliers.length} fabrication partners`}</span></td><td className="qty-cell">{row.part.quantity}</td><td><strong className={row.fields.price.status === "conflicting" ? "price conflict-text" : "price"}>{priceLabel(row, currency)}</strong><Checked row={row} field="price" /></td><td><span className="lead-value">{row.fields.leadTimeDays.status === "conflicting" ? `${row.fields.leadTimeDays.min}–${row.fields.leadTimeDays.max} days` : row.fields.leadTimeDays.value !== undefined ? `${row.fields.leadTimeDays.value} days` : "Unknown"}</span><Checked row={row} field="leadTimeDays" /></td><td>{row.needsQuote ? <button className="quote-button" onClick={(e) => { e.stopPropagation(); void draftRfq(row); }} disabled={actionBusy}><FileText size={12} />Draft RFQ</button> : <Status status={row.status} />}</td><td className="row-arrow"><ChevronRight size={14} /></td></tr>)}</tbody></table></div>
          {!rows.length && <div className="bom-empty"><div className="empty-blueprint"><span className="blueprint-label">YOUR BUILD, CONNECTED.</span><div className="blueprint-line horizontal" /><div className="blueprint-line vertical" /><div className="blueprint-node node-left"><Cpu size={23} /></div><div className="blueprint-node node-center"><Box size={32} strokeWidth={1.4} /><i><Check size={10} strokeWidth={3} /></i></div><div className="blueprint-node node-right"><Layers3 size={23} /></div><span className="blueprint-dot dot-one" /><span className="blueprint-dot dot-two" /></div><h3>{busy ? "Good parts take a little digging." : "An idea in. A parts list out."}</h3><p>{busy ? "Your agent is scouting suppliers and checking the details. Verified results will appear here as they arrive." : "Your sourced, cross-checked bill of materials will live here. Every price linked. Every unknown in the open."}</p><span className="empty-note">{busy ? <LoaderCircle size={13} className="spin" /> : <Search size={13} />}{busy ? "RESEARCH IN PROGRESS" : "START WITH YOUR BUILD ABOVE"}</span></div>}
          {rows.length > 0 && !bom && <div className="streaming-footer"><LoaderCircle size={14} className="spin" />Verifying your parts<span>{rows.length} of {parts.length} researched</span></div>}
          {bom && <div className="bom-summary"><div><span className="summary-label">SOURCE-BACKED SUBTOTAL <span>{currency}</span></span><strong className="total-value">{money(bom.total, currency)}{Math.abs(bom.totalMax-bom.total) > 0.01 && <><span className="range-dash">–</span>{money(bom.totalMax, currency)}</>}</strong><p>Before shipping and unknown tax · {bom.quoteCount} {bom.quoteCount === 1 ? "part needs" : "parts need"} a quote</p></div><div className="budget-summary"><span className="summary-label">BUDGET {bom.budgetRemaining >= 0 ? "REMAINING" : "EXCEEDED BY"}</span><strong className={bom.budgetRemaining < 0 ? "conflict-text" : ""}>{money(Math.abs(bom.budgetRemaining), currency)}</strong><div className="budget-track"><span style={{ width: `${Math.min(100, bom.totalMax / bom.input.budget * 100)}%`, background: bom.budgetRemaining < 0 ? "#b9513e" : undefined }} /></div><p>Based on highest sourced prices</p></div></div>}
          <div className="verification-key"><span><ShieldCheck size={13} />TRUST IS IN THE DETAILS</span><div><Status status="agreed" /><Status status="single_source" /><Status status="conflicting" /><Status status="unknown" label="Unknown" /></div></div>
        </section>
      </div>
      {bom && bom.risks.length > 0 && <section className="risks-panel"><div className="risks-heading"><TriangleAlert size={16} /><h2>A few things to check</h2><span>{bom.risks.length}</span></div><div className="risk-list">{bom.risks.map((risk,i) => <button key={i} disabled={!risk.partId} onClick={() => { const row = rows.find((r) => r.part.id === risk.partId); if (row) { setSelected(row); setDraft(null); } }} className={`risk-item risk-${risk.severity}`}><i />{risk.message}{risk.partId && <ArrowUpRight size={12} />}</button>)}</div></section>}
      <footer className="workspace-footer"><span><ShieldCheck size={13} />Every part has a paper trail.</span><div>{demo && <span className="demo-label"><FlaskConical size={12} />Illustrative demo data</span>}{(busy || bom) && <span>{elapsed}s elapsed{sourceCount > 0 ? ` · ${sourceCount} source domains` : ""}</span>}<span className="footer-separator">/</span><button onClick={() => setGuide(true)}>Built in the open<ArrowUpRight size={11} /></button></div></footer>
    </main>
    <dialog ref={drawerRef} className="evidence-drawer" onClose={() => { setSelected(null); setDraft(null); }} onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
      {selected && <><div className="drawer-header"><span className="eyebrow"><ShieldCheck size={14} />THE PAPER TRAIL</span><button className="icon-button" aria-label="Close evidence" onClick={() => setSelected(null)}><X size={20} /></button></div><div className="drawer-body"><h2>{selected.part.name}</h2><p className="drawer-purpose">{selected.part.purpose}</p><Status status={selected.status} label={selected.needsQuote ? "Needs a quote" : undefined} />{demo && <div className="demo-notice"><FlaskConical size={15} /><p>Illustrative demo. Values and quotes are fixture data, not fetched supplier prices. Example evidence domains are intentionally non-live.</p></div>}<div className="spec-grid">{Object.entries(selected.part.keySpecs).map(([k,v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
        {selected.needsQuote && <div className="quote-card"><FileText size={20} /><h3>Custom part. Real quote needed.</h3><p>Pricing needs drawings and a supplier review. This part is excluded from the total.</p><button className="primary-button" disabled={actionBusy} onClick={() => void draftRfq(selected)}>{actionBusy ? <LoaderCircle size={14} className="spin" /> : <FileText size={14} />}Draft a request for quote</button><small>Drafts only. Nothing is sent.</small></div>}
        {draft && <div className="draft-card"><span className="eyebrow">YOUR RFQ DRAFT</span><h3>{draft.subject}</h3><pre>{draft.body}</pre><button className="small-primary" onClick={() => { void navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`).then(() => setToast("RFQ copied. Ready for your review.")).catch(() => setToast("Clipboard unavailable. Select and copy the draft text.")); }}><FileText size={13} />Copy draft</button>{draft.url && <a href={draft.url} target="_blank" rel="noopener noreferrer">Open Gmail draft<ExternalLink size={12} /></a>}</div>}
        {selected.suppliers.map((s) => <a className="supplier-card" key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"><span><strong>{s.name}</strong><small>{new URL(s.url).hostname}</small></span><ArrowUpRight size={17} /></a>)}
        <div className="drawer-section-heading"><h3>Candidate evidence</h3><span>{selected.candidates.length} pages</span></div>
        {!selected.candidates.length && <p className="no-evidence">No verifiable catalogue listing. Unknown prices, availability, and delivery times remain unknown.</p>}
        {selected.candidates.map((candidate, i) => <article className={`candidate-card ${candidate.rejectedReason ? "rejected-candidate" : ""}`} key={`${candidate.productUrl}-${i}`}><div className="candidate-heading"><div><span className="eyebrow">{candidate.supplier}</span><h4>{candidate.productName}</h4></div><a href={candidate.productUrl} target="_blank" rel="noopener noreferrer" aria-label="Open supplier page"><ArrowUpRight size={17} /></a></div>{candidate.rejectedReason && <div className="rejection"><TriangleAlert size={13} />Rejected: {candidate.rejectedReason}</div>}{candidate.evidence.map((e, j) => <div className="evidence-item" key={j}><div><span>{({ price: "Price", stock: "Availability", leadTimeDays: "Lead time", shipsToDestination: "Ships to destination", spec: "Specification" })[e.field]}</span><strong>{e.field === "price" && typeof e.value === "number" ? money(e.value, candidate.price?.currency ?? currency) : e.field === "leadTimeDays" ? `${e.value} days` : String(e.value).replaceAll("_", " ")}</strong></div>{e.quote && <blockquote>“{e.quote}”</blockquote>}<a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(e.sourceUrl).hostname}<ArrowUpRight size={11} /></a><time dateTime={e.checkedAt}>Checked {new Date(e.checkedAt).toLocaleString("en-AU")}</time></div>)}</article>)}
        {bom && <p className="exchange-note">{bom.exchange.source}. {bom.exchange.fallback ? "Fixed fallback rates are estimates and are labeled throughout." : `Rates fetched ${new Date(bom.exchange.checkedAt).toLocaleString()}.`} Price comparisons use unit quantities and exclude tax only when a tax rate is explicitly stated.</p>}
      </div></>}
    </dialog>
    <dialog ref={guideRef} className="guide-dialog" onClose={() => setGuide(false)} onClick={(e) => { if (e.target === e.currentTarget) setGuide(false); }}><div className="drawer-header"><span className="eyebrow">HOW PARTSCOUT CHECKS ITS WORK</span><button className="icon-button" aria-label="Close guide" onClick={() => setGuide(false)}><X size={19} /></button></div><div className="guide-body"><ShieldCheck size={32} /><h2>A source for every claim.</h2><p>PartScout compares evidence for the same supplier and product across independent domains. Two pages on one website still count as one source.</p><div><Status status="agreed" /><p>At least two independent sources agree: prices within 5%, lead times within 3 days, and matching availability or shipping statements.</p></div><div><Status status="single_source" /><p>Only one independent source supports the value. Useful, but worth a second look.</p></div><div><Status status="conflicting" /><p>Sources disagree. You see every value and the full price range.</p></div><div><Status status="unknown" label="Unknown / needs quote" /><p>No supported value was found. It stays unknown and is excluded from the total.</p></div><p className="guide-footnote"><Code2 size={15} />MIT licensed · Next.js + Parallel + Composio<br />RFQs are drafts only. Humans always decide what to send.</p></div></dialog>
    {toast && <div className="toast" role="status"><CheckCheck size={16} />{toast}</div>}
  </>;
}
