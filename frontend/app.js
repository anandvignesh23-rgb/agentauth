const $ = (id) => document.getElementById(id);

async function api(path, options) {
  const res = await fetch(path, options);
  return res.json();
}

function metricLabel(key) {
  return key.replaceAll("_", " ");
}

function row(title, meta, status = "") {
  return `<div class="row"><div><strong>${title}</strong><div class="muted">${meta}</div></div>${status ? `<span class="pill ${status}">${status}</span>` : ""}</div>`;
}

async function render() {
  const data = await api("/v1/dashboard");
  $("metrics").innerHTML = Object.entries(data.metrics)
    .map(([key, value]) => `<div class="metric"><strong>${value}</strong><span>${metricLabel(key)}</span></div>`)
    .join("");
  $("agents").innerHTML = `<h2>Registered Agents</h2>` + data.agents
    .map((a) => row(a.name, `${a.agent_id} · ${a.developer_name} · key ${a.public_key_fingerprint} · reputation ${a.reputation_score}`, a.status))
    .join("");
  $("delegations").innerHTML = `<h2>Active Delegations</h2>` + data.delegations
    .map((d) => row(`${d.purpose || d.order_id}: ${d.currency} ${d.max_amount}`, `${d.delegation_id} · ${d.agent_id} · ${d.merchant_id} · signed credential ${d.delegation_credential ? "issued" : "missing"} · expires ${new Date(d.expires_at).toLocaleTimeString()}`, d.status))
    .join("");
  $("paymentConfig").innerHTML = `<div class="card"><strong>RAZORPAY TEST MODE</strong><div class="muted">Provider ${data.payment_config.provider} · Razorpay configured ${data.payment_config.razorpayConfigured ? "yes" : "no"} · integration ${data.payment_config.available ? "available" : "unavailable"}</div></div>`;
  $("tokens").innerHTML = data.tokens.length
    ? `<h2>AgentAuth Tokens</h2>` + data.tokens.map((t) => row(`${t.currency} ${t.amount} · ${t.order_id}`, `${t.token_id} · ${t.merchant_id} · ${t.status || "ACTIVE"}`, t.status || "PENDING")).join("")
    : `<div class="card muted">Run <code>npm run demo</code> to create an incoming authorized agent payment.</div>`;
  $("executions").innerHTML = data.paymentExecutions.length
    ? `<h2>Payment Executions</h2>` + data.paymentExecutions.map((e) => row(`${e.currency} ${e.amount} · ${e.order_id}`, `${e.execution_id} · Razorpay order ${e.razorpay_order_id || "pending"}`, e.status)).join("")
    : "";
  $("requests").innerHTML = data.requests.length
    ? data.requests.map((r) => row(`${r.currency} ${r.amount} · ${r.order_id}`, `${r.request_id} · ${r.agent_id} · ${r.merchant_id} · nonce ${r.nonce}`, r.status)).join("")
    : `<div class="card muted">No requests yet.</div>`;
  $("decisions").innerHTML = data.decisions.length
    ? data.decisions.map((d) => row(`${d.decision} · risk ${d.risk_score}`, `${d.request_id} · ${d.reason_codes.join(", ")}`, d.decision)).join("")
    : `<div class="card muted">No decisions yet.</div>`;
  $("fraud").innerHTML = data.riskSnapshots?.length
    ? data.riskSnapshots.map((s) => row(`Combined ${s.combined_score} · txn ${s.transaction_score} · agent ${s.agent_score}`, `${s.request_id} · ${[...s.transaction_reason_codes, ...s.agent_reason_codes].join(", ")}`, s.final_decision)).join("")
    : `<div class="card muted">No fraud snapshots yet.</div>`;
  $("agentRisk").innerHTML = data.agentRiskProfiles?.length
    ? data.agentRiskProfiles
      .map((p) => {
        const latest = (data.riskSnapshots || []).find((s) => s.agent_id === p.agent_id);
        const risk = latest?.agent_score ?? 0;
        const level = risk >= 0.75 ? "HIGH" : risk >= 0.45 ? "MEDIUM" : "LOW";
        return row(`${p.agent_id} · reputation ${p.reputation_score}`, `Risk ${level} · requests ${p.total_requests} · denials ${p.denied_requests} · replay ${p.replay_attempts} · signature failures ${p.signature_failures}`, level);
      }).join("")
    : `<div class="card muted">No agent profiles yet.</div>`;
  $("audit").innerHTML = data.audit.length
    ? data.audit.map((a) => row(a.message, `${new Date(a.timestamp).toLocaleTimeString()} · ${a.actor} · ${a.event_type}`)).join("")
    : `<div class="card muted">No audit events yet.</div>`;
}

$("reset").addEventListener("click", async () => {
  await fetch("/v1/dev/reset", { method: "POST" });
  await render();
});

$("createDelegation").addEventListener("click", () => $("delegationDialog").showModal());
$("submitDelegation").addEventListener("click", async (event) => {
  event.preventDefault();
  const form = new FormData(document.querySelector("dialog form"));
  const body = Object.fromEntries(form.entries());
  body.expires_at = new Date(Date.now() + 15 * 60_000).toISOString();
  await api("/v1/delegations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  $("delegationDialog").close();
  await render();
});

render();
setInterval(render, 3000);
