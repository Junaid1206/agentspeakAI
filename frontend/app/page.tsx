"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Customer = { id: number; name: string; phone_number: string; company_name?: string | null; purpose?: string | null; product?: string | null };
type Call = { id: number; customer_id: number; customer?: Customer; mode: string; direction: string; status: string; outcome: string; lead_status: string; follow_up_required: boolean; started_at: string; ended_at?: string | null; duration_seconds?: number | null };
type Stats = { total_calls: number; completed_calls: number; failed_calls: number; interested_leads: number; follow_ups_required: number; avg_duration_seconds: number; total_customers: number };
type Message = { id: number; speaker: string; message: string; timestamp: string };
type Summary = { summary: string; customer_intent?: string | null; key_requirements?: unknown; budget?: string | null; timeline?: string | null; location?: string | null; application?: string | null; follow_up_required: boolean; lead_status: string; outcome: string };

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const pretty = (value: string) => value.replaceAll("_", " ");
const duration = (seconds?: number | null) => seconds == null ? "—" : `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export default function Home() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [product, setProduct] = useState("Commercial RO System"); const [purpose, setPurpose] = useState("Product enquiry");
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail || `API error ${response.status}`); }
    return response.status === 204 ? null : response.json();
  }, []);

  const refresh = useCallback(async () => {
    const [c, cl, s] = await Promise.all([request("/api/customers"), request("/api/calls"), request("/api/dashboard/stats")]);
    setCustomers(c); setCalls(cl); setStats(s);
  }, [request]);

  useEffect(() => { refresh().catch(e => setError(`${e.message}. Check NEXT_PUBLIC_API_URL and that FastAPI is running.`)); }, [refresh]);
  useEffect(() => {
    if (selected == null) { setTranscript([]); setSummary(null); return; }
    Promise.all([request(`/api/calls/${selected}/transcript`), request(`/api/calls/${selected}/summary`).catch(() => null)])
      .then(([t, s]) => { setTranscript(t); setSummary(s); }).catch(e => setError(e.message));
  }, [selected, request, calls]);

  const filtered = useMemo(() => calls.filter(c => {
    const term = search.toLowerCase();
    const matches = !term || (c.customer?.name || "").toLowerCase().includes(term) || (c.customer?.phone_number || "").includes(term);
    return matches && (status === "all" || c.status === status || c.lead_status === status);
  }), [calls, search, status]);

  async function addCustomer(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { await request("/api/customers", { method: "POST", body: JSON.stringify({ name, phone_number: phone, product, purpose }) }); setName(""); setPhone(""); setNotice("Customer added."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not add customer."); } finally { setBusy(false); }
  }
  async function startCall(id: number) {
    setBusy(true); setError(""); setNotice("");
    try { const call = await request("/api/calls", { method: "POST", body: JSON.stringify({ customer_id: id, mode: "browser" }) }); setNotice(`Browser demo call #${call.id} created. Open the call console to start voice interaction.`); setSelected(call.id); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start call."); } finally { setBusy(false); }
  }

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">A</span><span>AgentSpeak<small>CALLING OPERATIONS</small></span></div><div className="nav-label">WORKSPACE</div><a className="nav active" href="#overview">◫ &nbsp; Overview</a><a className="nav" href="#customers">♙ &nbsp; Customers</a><a className="nav" href="#calls">◷ &nbsp; Call history</a><div className="sidebar-bottom"><span className="status-dot" /> Browser demo mode <small>Voice runs in your browser</small></div></aside>
    <section className="main"><header className="topbar"><div><span className="eyebrow">WORKSPACE / OVERVIEW</span><h1>Calling dashboard</h1></div><span className="pill"><i /> System console</span></header>
      {error && <div className="alert error">{error}<button onClick={() => setError("")}>×</button></div>}{notice && <div className="alert success">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      <section id="overview"><div className="section-heading"><div><h2>Overview</h2><p>Monitor outreach activity and lead outcomes.</p></div><button className="secondary" onClick={() => refresh().catch(e => setError(e.message))}>↻ Refresh</button></div>
        <div className="metrics">{[{label:"Total calls",value:stats?.total_calls ?? "—",icon:"◷"},{label:"Completed",value:stats?.completed_calls ?? "—",icon:"✓"},{label:"Failed / no answer",value:stats?.failed_calls ?? "—",icon:"!"},{label:"Interested leads",value:stats?.interested_leads ?? "—",icon:"↗"},{label:"Follow-ups",value:stats?.follow_ups_required ?? "—",icon:"↪"},{label:"Avg. duration",value:stats ? duration(stats.avg_duration_seconds) : "—",icon:"◴"}].map(m=><article className="metric" key={m.label}><div className="metric-top"><span>{m.label}</span><b>{m.icon}</b></div><strong>{m.value}</strong></article>)}</div>
      </section>
      <section id="customers" className="panel"><div className="section-heading"><div><h2>Add a customer</h2><p>Create a contact before starting an outbound demo call.</p></div></div><form className="customer-form" onSubmit={addCustomer}><label>Customer name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Rahul Kumar" maxLength={200}/></label><label>Phone number<input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91XXXXXXXXXX" maxLength={32}/></label><label>Product<input value={product} onChange={e=>setProduct(e.target.value)} placeholder="Commercial RO System"/></label><label>Purpose<input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Product enquiry"/></label><button className="primary" disabled={busy}>＋ Add customer</button></form></section>
      <section id="calls" className="panel"><div className="section-heading"><div><h2>Call history</h2><p>Review calls, transcripts and AI-generated summaries.</p></div><div className="filters"><input aria-label="Search customers" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or phone…"/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{["queued","calling","connected","in_conversation","completed","failed","no_answer","interested","qualified","not_interested"].map(s=><option key={s} value={s}>{pretty(s)}</option>)}</select></div></div>
        <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Date</th><th>Duration</th><th>Status</th><th>Outcome</th><th>Action</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><strong>{c.customer?.name || `Customer #${c.customer_id}`}</strong><small>Call #{c.id}</small></td><td>{c.customer?.phone_number || "—"}</td><td>{new Date(c.started_at).toLocaleString()}</td><td>{duration(c.duration_seconds)}</td><td><span className={`tag ${c.status}`}>{pretty(c.status)}</span></td><td>{pretty(c.lead_status || c.outcome)}</td><td><button className="text-button" onClick={()=>setSelected(c.id)}>View details →</button></td></tr>)}{filtered.length===0&&<tr><td colSpan={7} className="empty">No calls found. Add a customer and start a demo call.</td></tr>}</tbody></table></div>
      </section>
      {selected != null && <section className="panel detail" id="call-detail"><div className="section-heading"><div><h2>Call #{selected} details</h2><p>Transcript and summary for the selected call.</p></div><button className="secondary" onClick={()=>setSelected(null)}>Close</button></div><div className="detail-grid"><div><h3>Conversation transcript</h3><div className="transcript">{transcript.map(m=><div className={`bubble ${m.speaker}`} key={m.id}><span>{pretty(m.speaker)} · {new Date(m.timestamp).toLocaleTimeString()}</span><p>{m.message}</p></div>)}{transcript.length===0&&<p className="muted">No transcript messages yet.</p>}</div></div><div><h3>AI summary</h3>{summary?<><p>{summary.summary}</p><dl>{[["Intent",summary.customer_intent],["Budget",summary.budget],["Timeline",summary.timeline],["Location",summary.location],["Application",summary.application],["Lead status",pretty(summary.lead_status)],["Follow-up",summary.follow_up_required?"Required":"No"]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||"—"}</dd></div>)}</dl></>:<p className="muted">Summary becomes available after the call ends and generation succeeds.</p>}</div></div></section>}
      <footer>AgentSpeak AI · Admin console · Browser calls are demos, not real phone calls.</footer>
    </section>
  </main>;
}
