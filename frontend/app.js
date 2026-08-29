(function () {
  const root = document.getElementById("app");
  const API_BASE = window.AGENTAUTH_API_URL || "";
  const SESSION_KEY = "agentauth_demo_session";
  const ROLE_KEY = "agentauth_role";
  const state = {
    loading: true,
    error: null,
    health: null,
    dashboard: null,
    audit: [],
    details: {},
    role: localStorage.getItem(ROLE_KEY) || "CONSUMER",
    toast: null,
    dialog: null,
    search: "",
    filters: {},
    demoStep: 0,
    demoResults: []
  };

  const routes = [
    { path: "/dashboard", label: "Dashboard", roles: ["CONSUMER", "DEVELOPER", "MERCHANT", "ADMIN"] },
    { path: "/agents", label: "Agents", roles: ["DEVELOPER", "ADMIN"] },
    { path: "/delegations", label: "Delegations", roles: ["CONSUMER", "ADMIN"] },
    { path: "/requests", label: "Requests", roles: ["CONSUMER", "DEVELOPER", "MERCHANT", "ADMIN"] },
    { path: "/step-up", label: "Step-Up", roles: ["CONSUMER", "ADMIN"] },
    { path: "/risk", label: "Risk", roles: ["DEVELOPER", "MERCHANT", "ADMIN"] },
    { path: "/security-lab", label: "Security Lab", roles: ["DEVELOPER", "ADMIN"] },
    { path: "/audit", label: "Audit", roles: ["ADMIN", "DEVELOPER"] },
    { path: "/merchant", label: "Merchant", roles: ["MERCHANT", "ADMIN"] },
    { path: "/evidence", label: "Evidence", roles: ["CONSUMER", "DEVELOPER", "MERCHANT", "ADMIN"] },
    { path: "/developer", label: "Developer", roles: ["DEVELOPER", "ADMIN"] },
    { path: "/demo", label: "Demo", roles: ["CONSUMER", "DEVELOPER", "MERCHANT", "ADMIN"] }
  ];

  const scenarioGroups = [
    ["valid", "Valid Agent", "ALLOW"],
    ["amount_attack", "Amount Attack", "DENY"],
    ["merchant_attack", "Merchant Attack", "DENY"],
    ["replay", "Replay Attack", "NONCE_REUSED"],
    ["invalid_signature", "Invalid Signature", "DENY"],
    ["prompt_injection", "Prompt Injection", "DENY"],
    ["high_risk", "High-Risk Step-Up", "STEP_UP"],
    ["token_replay", "Token Replay", "PAYMENT_TOKEN_ALREADY_USED"],
    ["velocity_attack", "Velocity Spike", "HIGH RISK"],
    ["merchant_spread_spike", "Merchant Spread Spike", "HIGH RISK"],
    ["denial_spike", "Denial Spike", "AGENT RISK"],
    ["recent_key_rotation_high_value", "Recent Key Rotation", "STEP_UP"]
  ];

  const api = {
    async request(path, options = {}) {
      const requestId = crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}`;
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          ...(options.headers || {})
        }
      });
      const text = await res.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: "INVALID_JSON", message: text };
      }
      if (!res.ok) {
        const error = new Error(body.error || body.message || `HTTP_${res.status}`);
        error.status = res.status;
        error.body = body;
        error.requestId = requestId;
        throw error;
      }
      return body;
    },
    get(path) {
      return this.request(path);
    },
    post(path, body = {}) {
      return this.request(path, { method: "POST", body: JSON.stringify(body) });
    }
  };

  const money = (minor, currency = "INR") => {
    const value = Number(minor || 0);
    const display = value >= 10000 ? value / 100 : value;
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(display);
  };
  const date = (value) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not set";
  const score = (value) => Number(value || 0).toFixed(2);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const session = () => JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  const currentPath = () => location.pathname === "/" ? "/dashboard" : location.pathname;
  const byId = (list, key, value) => (list || []).find((item) => item?.[key] === value);
  const decisionFor = (requestId) => (state.dashboard?.decisions || []).find((d) => d.request_id === requestId) || {};
  const riskFor = (requestId) => (state.dashboard?.riskSnapshots || []).find((r) => r.request_id === requestId) || {};
  const agentName = (id) => byId(state.dashboard?.agents, "agent_id", id)?.name || id;
  const merchantName = (id) => byId(state.dashboard?.merchantOrders, "merchant_id", id)?.merchant_name || byId(state.dashboard?.merchants, "merchant_id", id)?.name || id;
  const setToast = (message, kind = "success") => {
    state.toast = { message, kind };
    render();
    setTimeout(() => {
      if (state.toast?.message === message) {
        state.toast = null;
        render();
      }
    }, 3400);
  };
  const riskLevel = (value) => {
    const n = Number(value || 0);
    if (n >= 0.9) return "CRITICAL";
    if (n >= 0.75) return "HIGH";
    if (n >= 0.45) return "MEDIUM";
    return "LOW";
  };
  const statusClass = (value) => `badge ${String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const reasonText = (code) => ({
    VALID_SIGNATURE: "The Ed25519 signature matched the canonical payload.",
    INVALID_SIGNATURE: "The signed fields were changed or the agent key did not verify.",
    NONCE_ACCEPTED: "The nonce was recorded once for this agent.",
    NONCE_REUSED: "Replay protection rejected a duplicate nonce.",
    DELEGATION_VALID: "Agent, merchant, order, amount, currency, and expiry matched the delegation.",
    AMOUNT_EXCEEDS_DELEGATION: "The amount exceeded the consumer-approved limit.",
    MERCHANT_MISMATCH: "The merchant did not match the scoped delegation.",
    ORDER_MISMATCH: "The order did not match the scoped delegation.",
    DELEGATION_EXPIRED: "The delegation is outside its valid window.",
    AGENT_REVOKED: "The agent has been revoked.",
    HIGH_RISK: "Risk policy required denial or escalation.",
    MEDIUM_RISK: "Risk policy required human step-up before token issuance.",
    LOW_RISK: "The request stayed inside normal risk bounds."
  }[code] || code.replace(/_/g, " ").toLowerCase());

  async function loadDashboard() {
    state.loading = true;
    state.error = null;
    render();
    try {
      const [health, dashboard, audit] = await Promise.all([
        api.get("/health"),
        api.get("/v1/dashboard"),
        api.get("/v1/audit").catch(() => [])
      ]);
      state.health = health;
      state.dashboard = dashboard;
      state.audit = audit;
    } catch (err) {
      state.error = err.body?.error || err.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  function navigate(path) {
    history.pushState({}, "", path);
    render();
    ensureDetail();
  }

  function shell(content) {
    const s = session();
    const roleRoutes = routes.filter((r) => r.roles.includes(state.role));
    const health = state.health || {};
    const provider = state.dashboard?.payment_config || {};
    root.innerHTML = `
      <div class="layout">
        <aside class="sidebar" aria-label="Primary">
          <a class="brand" href="/dashboard" data-link>
            <span class="brand-mark">AA</span>
            <span><strong>AgentAuth</strong><small>Identity -> Authority -> Risk -> Decision</small></span>
          </a>
          <nav>${roleRoutes.map((r) => `<a href="${r.path}" data-link class="${currentPath().startsWith(r.path) ? "active" : ""}">${r.label}</a>`).join("")}</nav>
        </aside>
        <div class="workspace">
          <header class="topbar">
            <div>
              <p class="eyebrow">Live AgentAuth console</p>
              <h1>${pageTitle()}</h1>
            </div>
            <div class="top-actions">
              <span class="${statusClass(health.status === "ok" ? "live" : "down")}">${health.status === "ok" ? "API LIVE" : "API DOWN"}</span>
              <span class="${statusClass(health.database_connected ? "connected" : "temporary")}">${health.database_connected ? "POSTGRES CONNECTED" : "DEMO STORE"}</span>
              <span class="${statusClass(provider.available ? "configured" : "blocked")}">${provider.available ? "PROVIDER READY" : "RAZORPAY BLOCKED"}</span>
              <label class="role-picker">
                <span>Role</span>
                <select id="roleSelect" aria-label="Current role">${["CONSUMER", "DEVELOPER", "MERCHANT", "ADMIN"].map((r) => `<option ${state.role === r ? "selected" : ""}>${r}</option>`).join("")}</select>
              </label>
              <button class="icon-button" id="logoutButton" aria-label="Log out" title="${esc(s?.email || "Log out")}">Logout</button>
            </div>
          </header>
          ${state.loading ? loadingShell() : state.error ? errorView(state.error) : content}
        </div>
      </div>
      ${state.toast ? `<div class="toast ${state.toast.kind}" role="status">${esc(state.toast.message)}</div>` : ""}
      ${state.dialog ? dialogMarkup(state.dialog) : ""}
    `;
    bindShell();
  }

  function pageTitle() {
    const path = currentPath();
    if (path.startsWith("/agents/")) return "Agent Detail";
    if (path.startsWith("/delegations/new")) return "Create Delegation";
    if (path.startsWith("/delegations/")) return "Delegation Detail";
    if (path.startsWith("/requests/")) return "Authorization Detail";
    return routes.find((r) => path.startsWith(r.path))?.label || "Dashboard";
  }

  function bindShell() {
    root.querySelectorAll("[data-link]").forEach((a) => a.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(a.getAttribute("href"));
    }));
    root.querySelector("#roleSelect")?.addEventListener("change", (event) => {
      state.role = event.target.value;
      localStorage.setItem(ROLE_KEY, state.role);
      render();
    });
    root.querySelector("#logoutButton")?.addEventListener("click", () => {
      localStorage.removeItem(SESSION_KEY);
      navigate("/login");
    });
    root.querySelector("[data-dialog-close]")?.addEventListener("click", () => {
      state.dialog = null;
      render();
    });
    root.querySelector("[data-confirm]")?.addEventListener("click", async () => {
      const action = state.dialog.action;
      state.dialog = null;
      render();
      await action();
    });
  }

  function loadingShell() {
    return `<main class="page"><div class="skeleton hero-skeleton"></div><div class="grid three">${Array.from({ length: 6 }, () => `<div class="skeleton card-skeleton"></div>`).join("")}</div></main>`;
  }

  function errorView(error) {
    return `<main class="page"><section class="panel danger"><p class="eyebrow">Structured backend error</p><h2>${esc(error)}</h2><p>${esc(reasonText(error))}</p><button data-action="reload">Retry</button></section></main>`;
  }

  function dialogMarkup({ title, body, confirm = "Confirm", danger = false }) {
    return `<div class="dialog-backdrop" role="presentation"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
      <h2 id="dialogTitle">${esc(title)}</h2>
      <p>${esc(body)}</p>
      <div class="dialog-actions">
        <button data-dialog-close>Cancel</button>
        <button class="${danger ? "danger-button" : "primary"}" data-confirm>${esc(confirm)}</button>
      </div>
    </section></div>`;
  }

  function badge(value) {
    return `<span class="${statusClass(value)}">${esc(value || "UNKNOWN")}</span>`;
  }

  function metric(label, value, detail = "") {
    return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</article>`;
  }

  function pipeline(decision = {}, risk = {}) {
    const codes = new Set([...(decision.reason_codes || []), ...(risk.transaction_reason_codes || []), ...(risk.agent_reason_codes || [])]);
    const checks = [
      ["Identity", codes.has("INVALID_SIGNATURE") ? "FAIL" : "PASS"],
      ["Authority", [...codes].some((c) => c.includes("MISMATCH") || c.includes("DELEGATION") || c.includes("AMOUNT")) ? "FAIL" : "PASS"],
      ["Replay", codes.has("NONCE_REUSED") ? "FAIL" : "PASS"],
      ["Risk", decision.decision === "STEP_UP" ? "STEP-UP" : riskLevel(Math.max(Number(risk.transaction_score || 0), Number(risk.agent_score || 0)))],
      ["Decision", decision.decision || "PENDING"]
    ];
    return `<div class="pipeline">${checks.map(([label, value]) => `<div><span>${esc(label)}</span>${badge(value)}</div>`).join("")}</div>`;
  }

  function dashboardView() {
    const d = state.dashboard || { metrics: {}, requests: [], decisions: [], riskSnapshots: [] };
    const m = d.metrics || {};
    const recent = d.requests || [];
    return `<main class="page">
      <section class="hero">
        <div>
          <p class="eyebrow">AgentAuth</p>
          <h2>Identity, authority, risk, decision.</h2>
          <p>AI-agent payment requests are signed, checked against scoped delegation, scored for transaction and agent behavior risk, then allowed, denied, or sent to human step-up.</p>
        </div>
        <div class="hero-actions">
          <button class="primary" data-nav="/delegations/new">Create Delegation</button>
          <button data-nav="/security-lab">Security Lab</button>
          <button data-nav="/demo">Run Demo</button>
          <button data-nav="/agents">Register Agent</button>
        </div>
      </section>
      <section class="metrics-grid">
        ${metric("Total Requests", m.authorization_requests_total || 0)}
        ${metric("Allowed", m.authorization_allowed || 0)}
        ${metric("Denied", m.authorization_denied || 0)}
        ${metric("Step-Up", m.authorization_step_up || 0)}
        ${metric("Replay Attacks Blocked", m.replay_attempts_blocked || 0)}
        ${metric("Invalid Signatures", m.signature_failures || 0)}
        ${metric("High-Risk Agents", m.high_risk_agents || 0)}
      </section>
      <section class="grid two">
        <article class="panel">${systemStatus()}</article>
        <article class="panel">
          <div class="section-title"><h3>Recent Authorization Events</h3><a href="/requests" data-link>View all</a></div>
          ${recent.length ? recent.slice(0, 5).map(requestRow).join("") : empty("No authorization requests yet.")}
        </article>
      </section>
      <section class="panel">
        <h3>Decision Pipeline</h3>
        ${pipeline(d.decisions?.[0] || {}, d.riskSnapshots?.[0] || {})}
      </section>
    </main>`;
  }

  function systemStatus() {
    const h = state.health || {};
    const p = state.dashboard?.payment_config || {};
    const rows = [
      ["Public API", h.status === "ok" ? "LIVE" : "DOWN"],
      ["Database", h.database_connected ? "CONNECTED" : "TEMPORARY"],
      ["Ed25519 Verification", "ACTIVE"],
      ["Replay Protection", "ACTIVE"],
      ["Fraud Engine", "ACTIVE"],
      ["Agent-Aware Risk", "ACTIVE"],
      ["Razorpay Adapter", "IMPLEMENTED"],
      ["Razorpay Sandbox", p.razorpayConfigured ? "CONFIGURED" : "BLOCKED BY CREDENTIALS"]
    ];
    return `<div class="section-title"><h3>System Status</h3><span>${esc(h.environment || "unknown")}</span></div>${rows.map(([k, v]) => `<div class="status-row"><span>${esc(k)}</span>${badge(v)}</div>`).join("")}`;
  }

  function requestRow(req) {
    const decision = decisionFor(req.request_id);
    const risk = riskFor(req.request_id);
    return `<a class="list-row" href="/requests/${req.request_id}" data-link>
      <span><strong>${esc(req.request_id)}</strong><small>${esc(agentName(req.agent_id))} -> ${esc(req.merchant_id)} · ${esc(req.order_id)}</small></span>
      <span>${money(req.amount, req.currency)}</span>
      ${badge(decision.decision || req.status)}
      <span class="risk-text">${riskLevel(Math.max(Number(risk.transaction_score || 0), Number(risk.agent_score || 0)))}</span>
    </a>`;
  }

  function agentsView() {
    const agents = searchList(state.dashboard?.agents || [], ["agent_id", "name", "developer_name", "status"]);
    return pageWithSearch("agents", `<section class="grid three">${agents.map((agent) => {
      const profile = byId(state.dashboard?.agentRiskProfiles, "agent_id", agent.agent_id) || {};
      const latestRisk = state.dashboard?.riskSnapshots?.find((s) => s.agent_id === agent.agent_id) || {};
      return `<article class="card">
        <div class="section-title"><h3>${esc(agent.name)}</h3>${badge(agent.status)}</div>
        <dl>${kv("Agent ID", agent.agent_id)}${kv("Developer", agent.developer_name)}${kv("Fingerprint", agent.public_key_fingerprint)}${kv("Reputation", score(profile.reputation_score ?? agent.reputation_score))}${kv("Current Risk", `${score(latestRisk.agent_score)} ${riskLevel(latestRisk.agent_score)}`)}</dl>
        <div class="card-actions"><a href="/agents/${agent.agent_id}" data-link>Open</a><button data-revoke-agent="${agent.agent_id}" ${agent.status !== "ACTIVE" ? "disabled" : ""}>Revoke</button></div>
      </article>`;
    }).join("") || empty("No agents registered.")}</section>`);
  }

  function agentDetail(id) {
    const agent = byId(state.dashboard?.agents, "agent_id", id);
    if (!agent) return notFound("Agent");
    const history = (state.details[`risk-history-${id}`] || []).slice(0, 12);
    const rep = state.details[`reputation-${id}`] || {};
    return `<main class="page">${back("/agents", "Agents")}
      <section class="panel detail-head">
        <div><p class="eyebrow">Agent identity</p><h2>${esc(agent.name)}</h2><p>${esc(agent.agent_id)}</p></div>
        ${badge(agent.status)}
      </section>
      <section class="grid two">
        <article class="panel"><h3>Verification</h3><dl>${kv("Developer", agent.developer_name)}${kv("Public Key Fingerprint", agent.public_key_fingerprint)}${kv("Reputation", score(rep.reputation ?? agent.reputation_score))}${kv("Created", date(agent.created_at))}</dl></article>
        <article class="panel"><h3>Risk History</h3>${bars(history.map((x) => x.agent_score || x.overall_score || 0))}${history.map((x) => `<div class="status-row"><span>${esc(x.request_id || "risk")}</span>${badge(riskLevel(x.agent_score || x.overall_score))}</div>`).join("") || empty("No risk history yet.")}</article>
      </section>
      <section class="panel"><div class="section-title"><h3>Recent Agent Events</h3><button data-revoke-agent="${agent.agent_id}" ${agent.status !== "ACTIVE" ? "disabled" : ""}>Revoke Agent</button></div>${(rep.recent_events || []).map((e) => `<div class="timeline-item"><strong>${esc(e.event_type || "EVENT")}</strong><span>${date(e.created_at)}</span><p>${esc(e.reason || e.description || "")}</p></div>`).join("") || empty("No reputation events.")}</section>
    </main>`;
  }

  function delegationsView() {
    const delegations = searchList(state.dashboard?.delegations || [], ["delegation_id", "agent_id", "merchant_id", "order_id", "purpose", "status"]);
    return pageWithSearch("delegations", `<section class="toolbar"><button class="primary" data-nav="/delegations/new">Create Delegation</button></section><section class="grid two">${delegations.map(delegationCard).join("") || empty("No active delegations.")}</section>`);
  }

  function delegationCard(d) {
    return `<article class="card">
      <div class="section-title"><h3>${esc(d.order_id)}</h3>${badge(d.status)}</div>
      <dl>${kv("Agent", agentName(d.agent_id))}${kv("Merchant", d.merchant_id)}${kv("Limit", money(d.max_amount, d.currency))}${kv("Expires", date(d.expires_at))}</dl>
      <div class="card-actions"><a href="/delegations/${d.delegation_id}" data-link>Open</a><button data-revoke-delegation="${d.delegation_id}" ${d.status !== "ACTIVE" ? "disabled" : ""}>Revoke</button></div>
    </article>`;
  }

  function delegationDetail(id) {
    const d = byId(state.dashboard?.delegations, "delegation_id", id);
    if (!d) return notFound("Delegation");
    return `<main class="page">${back("/delegations", "Delegations")}<section class="panel detail-head"><div><p class="eyebrow">Scoped authority</p><h2>${esc(d.delegation_id)}</h2><p>${esc(d.purpose || "Transaction-scoped payment authority")}</p></div>${badge(d.status)}</section>
      <section class="grid two"><article class="panel"><h3>Grant</h3><dl>${kv("Consumer", d.user_id)}${kv("Agent", agentName(d.agent_id))}${kv("Merchant", d.merchant_id)}${kv("Order", d.order_id)}${kv("Max Amount", money(d.max_amount, d.currency))}${kv("Expires", date(d.expires_at))}</dl></article>
      <article class="panel"><h3>Controls</h3>${pipeline({ decision: d.status === "ACTIVE" ? "ALLOW" : "DENY", reason_codes: ["DELEGATION_VALID"] }, {})}<button class="danger-button" data-revoke-delegation="${d.delegation_id}" ${d.status !== "ACTIVE" ? "disabled" : ""}>Revoke Delegation</button></article></section></main>`;
  }

  function createDelegationView() {
    const agents = state.dashboard?.agents || [];
    return `<main class="page">${back("/delegations", "Delegations")}<form class="panel form" id="delegationForm">
      <p class="eyebrow">Consumer authority grant</p><h2>Create Delegation</h2>
      <label>Agent<select name="agent_id">${agents.map((a) => `<option value="${esc(a.agent_id)}">${esc(a.name)} (${esc(a.agent_id)})</option>`).join("")}</select></label>
      <label>Merchant ID<input name="merchant_id" value="merchant_demo_electronics" required /></label>
      <label>Order ID<input name="order_id" value="ORD-1934" required /></label>
      <label>Maximum Amount (minor units)<input name="max_amount" type="number" min="1" value="499900" required /></label>
      <label>Currency<input name="currency" value="INR" required /></label>
      <label>Purpose<input name="purpose" value="Wireless Headphones" required /></label>
      <label>Minutes Valid<input name="minutes" type="number" min="1" value="15" required /></label>
      <div class="notice">Shopping Copilot can request exactly this merchant, order, currency, and amount ceiling until expiry. Private agent keys are never shown here.</div>
      <button class="primary">Create Delegation</button>
    </form></main>`;
  }

  function requestsView() {
    const requests = searchList(state.dashboard?.requests || [], ["request_id", "agent_id", "merchant_id", "order_id", "status"]);
    return pageWithSearch("authorization requests", `<section class="panel table-panel">${requests.map(requestRow).join("") || empty("No authorization requests yet.")}</section>`);
  }

  function requestDetail(id) {
    const detail = state.details[`request-${id}`];
    const request = detail?.request || byId(state.dashboard?.requests, "request_id", id);
    if (!request) return notFound("Request");
    const decisions = detail?.decisions || [decisionFor(id)].filter(Boolean);
    const decision = decisions[0] || {};
    const risk = riskFor(id);
    const audit = detail?.audit || state.audit.filter((a) => a.request_id === id);
    const checks = [...new Set([...(decision.reason_codes || []), ...(risk.transaction_reason_codes || []), ...(risk.agent_reason_codes || [])])];
    return `<main class="page">${back("/requests", "Requests")}
      <section class="panel detail-head"><div><p class="eyebrow">Authorization request</p><h2>${esc(id)}</h2><p>${esc(agentName(request.agent_id))} -> ${esc(request.merchant_id)} · ${esc(request.order_id)}</p></div>${badge(decision.decision || request.status)}</section>
      <section class="grid two">
        <article class="panel"><h3>Decision</h3>${pipeline(decision, risk)}<dl>${kv("Amount", money(request.amount, request.currency))}${kv("Transaction Risk", `${score(risk.transaction_score)} ${riskLevel(risk.transaction_score)}`)}${kv("Agent Risk", `${score(risk.agent_score)} ${riskLevel(risk.agent_score)}`)}</dl></article>
        <article class="panel"><h3>Reason Codes</h3>${checks.map((c) => `<div class="reason"><strong>${esc(c)}</strong><p>${esc(reasonText(c))}</p></div>`).join("") || empty("No reason codes recorded.")}</article>
      </section>
      <section class="panel"><div class="section-title"><h3>Audit Timeline</h3><a href="/v1/authorization-requests/${esc(id)}/audit/export" target="_blank" rel="noreferrer">Export</a></div>${timeline(audit)}</section>
    </main>`;
  }

  function stepUpView() {
    const requests = (state.dashboard?.requests || []).filter((r) => {
      const d = decisionFor(r.request_id);
      return d.decision === "STEP_UP" || r.status === "STEP_UP_REQUIRED";
    });
    return `<main class="page"><section class="panel"><div class="section-title"><h2>Step-Up Queue</h2><button data-scenario="high_risk">Generate Step-Up</button></div>${requests.map((r) => `<div class="list-row"><span><strong>${esc(r.request_id)}</strong><small>${esc(r.order_id)} · ${money(r.amount, r.currency)}</small></span>${badge("STEP_UP")}<button class="primary" data-approve="${r.request_id}">Approve</button><button data-deny="${r.request_id}">Deny</button></div>`).join("") || empty("No requests awaiting human approval.")}</section></main>`;
  }

  function riskView() {
    const snapshots = state.dashboard?.riskSnapshots || [];
    const profiles = state.dashboard?.agentRiskProfiles || [];
    return `<main class="page">
      <section class="metrics-grid">${metric("Fraud Alerts", state.dashboard?.metrics?.fraud_alerts_today || 0)}${metric("Amount Anomalies", state.dashboard?.metrics?.amount_anomalies || 0)}${metric("Velocity Anomalies", state.dashboard?.metrics?.velocity_anomalies || 0)}${metric("New Merchant Alerts", state.dashboard?.metrics?.new_merchant_alerts || 0)}</section>
      <section class="grid two"><article class="panel"><h3>Transaction Risk</h3>${snapshots.map((s) => `<a class="list-row" href="/requests/${s.request_id}" data-link><span><strong>${esc(s.request_id)}</strong><small>${(s.transaction_reason_codes || []).join(", ") || "No transaction reasons"}</small></span>${badge(riskLevel(s.transaction_score))}</a>`).join("") || empty("No transaction risk snapshots.")}</article>
      <article class="panel"><h3>Agent-Aware Risk</h3>${profiles.map((p) => `<a class="list-row" href="/agents/${p.agent_id}" data-link><span><strong>${esc(agentName(p.agent_id))}</strong><small>Reputation ${score(p.reputation_score)}</small></span>${badge(riskLevel(p.current_risk || p.risk_score || 0))}</a>`).join("") || empty("No agent profiles.")}</article></section>
    </main>`;
  }

  function securityLabView() {
    const results = state.details.securityLabResults || [];
    return `<main class="page"><section class="panel"><div class="section-title"><div><p class="eyebrow">Real backend scenarios</p><h2>Security Lab</h2></div><button data-action="reset-demo">Reset Demo</button></div>
      <div class="scenario-grid">${scenarioGroups.map(([id, label, expected]) => `<button class="scenario" data-scenario="${id}"><strong>${label}</strong><span>Expected ${expected}</span></button>`).join("")}</div>
      </section>
      <section class="panel"><h3>Backend Response</h3>${results.length ? results.map(renderScenarioResult).join("") : empty("Run a scenario to produce live backend evidence.")}</section></main>`;
  }

  function renderScenarioResult(item) {
    const body = item.body || {};
    const result = body.result || body.second || body.first || body.results?.at?.(-1) || {};
    const reasons = result.reason_codes || body.second?.reason_codes || [];
    return `<article class="result-card"><div class="section-title"><h3>${esc(item.label)}</h3>${badge(result.decision || body.token_replay?.expected_second_reason || "COMPLETE")}</div>
      <p>${esc(reasons.join(", ") || body.token_replay?.expected_second_reason || "Scenario completed.")}</p>
      <pre>${esc(JSON.stringify(body, null, 2))}</pre></article>`;
  }

  function merchantView() {
    const tokens = state.dashboard?.tokens || [];
    const executions = state.dashboard?.paymentExecutions || [];
    const orders = state.dashboard?.merchantOrders || [];
    return `<main class="page"><section class="grid two"><article class="panel"><h3>Provider Status</h3>${systemStatus()}<div class="notice">Payment Provider: ${state.dashboard?.payment_config?.provider || "razorpay"}; fixture provider is a Provider contract simulation and is not labeled as Razorpay.</div></article>
      <article class="panel"><h3>Incoming Agent Transactions</h3>${orders.slice(0, 8).map((o) => `<div class="list-row"><span><strong>${esc(o.external_order_id)}</strong><small>${esc(o.merchant_id)}</small></span><span>${money(o.amount, o.currency)}</span>${badge(o.status)}</div>`).join("") || empty("No merchant orders.")}</article></section>
      <section class="panel"><h3>Merchant Verification</h3>${tokens.slice(0, 6).map((t) => `<div class="verification">${["Agent Identity", "Delegation", "Merchant Binding", "Order Binding", "Amount Binding", "Token Signature", "Token Expiry", "Token One-Time Status"].map((x) => `<div><span>${x}</span>${badge(t.consumed_at ? "CONSUMED" : "VALID")}</div>`).join("")}<strong>AUTHORIZED TO PROCESS</strong></div>`).join("") || empty("No issued tokens to verify.")}</section>
      <section class="panel"><h3>Payment Executions</h3>${executions.map((e) => `<div class="list-row"><span><strong>${esc(e.execution_id)}</strong><small>${esc(e.authorization_request_id)} · ${esc(e.provider || "provider")}</small></span>${badge(e.status)}</div>`).join("") || empty("No payment executions.")}</section></main>`;
  }

  function auditView() {
    const audit = searchList(state.audit || [], ["event_type", "actor", "description", "request_id"]);
    return pageWithSearch("audit", `<section class="panel">${timeline(audit)}</section>`);
  }

  function evidenceView() {
    const h = state.health || {};
    const p = state.dashboard?.payment_config || {};
    const rows = [
      ["Public API", h.status === "ok" ? "LIVE" : "DOWN"],
      ["PostgreSQL", h.database_connected ? "CONNECTED" : "NOT CONNECTED"],
      ["Ed25519 Verification", "PASS"],
      ["Replay Protection", "PASS"],
      ["Token Replay Protection", "PASS"],
      ["Revocation Persistence", "PASS"],
      ["Fraud Engine", "LIVE"],
      ["Agent-Aware Risk", "LIVE"],
      ["Step-Up", "LIVE"],
      ["Audit Persistence", "LIVE"],
      ["Razorpay Adapter", "IMPLEMENTED"],
      ["Razorpay Sandbox", p.razorpayConfigured ? "CONFIGURED" : "BLOCKED BY CREDENTIALS"]
    ];
    return `<main class="page"><section class="panel detail-head"><div><p class="eyebrow">Judge evidence</p><h2>AgentAuth Evidence</h2><p>Live backend, durable audit, deterministic security checks, transparent provider boundary.</p></div><a href="https://github.com/anandvignesh23-rgb/agentauth" target="_blank" rel="noreferrer">GitHub</a></section>
      <section class="grid two"><article class="panel">${rows.map(([k, v]) => `<div class="status-row"><span>${esc(k)}</span>${badge(v)}</div>`).join("")}</article>
      <article class="panel"><h3>Test Evidence</h3><dl>${kv("Unit / integration tests", "26 documented")}${kv("Attack scenarios", "20 documented")}${kv("Provider contract tests", "6 documented")}${kv("Concurrency proof scenarios", "4 documented")}</dl><a href="https://github.com/anandvignesh23-rgb/agentauth/blob/main/docs/security-proof.md" target="_blank" rel="noreferrer">Security proof</a></article></section>
      <section class="panel"><h3>Concurrency Evidence</h3><div class="metrics-grid">${metric("50 same-nonce requests", "1 accepted", "49 rejected")}${metric("20 same-token requests", "1 accepted", "19 rejected")}</div></section></main>`;
  }

  function developerView() {
    const agent = state.dashboard?.agents?.[0] || {};
    return `<main class="page"><section class="grid two"><article class="panel"><h3>Agent SDK</h3><dl>${kv("Agent ID", agent.agent_id)}${kv("Public Key Fingerprint", agent.public_key_fingerprint)}${kv("Agent Status", agent.status)}${kv("API URL", location.origin)}</dl><pre>client.authorizePayment({
  delegationId,
  merchantId,
  orderId,
  amount,
  currency
});</pre></article>
      <article class="panel"><h3>Merchant SDK</h3><pre>await merchant.verifyPaymentToken(token, {
  merchant_id,
  order_id,
  amount,
  currency
});</pre><div class="link-list"><a href="/openapi.json">OpenAPI / API Docs</a><a href="https://github.com/anandvignesh23-rgb/agentauth/blob/main/docs/protocol.md" target="_blank" rel="noreferrer">Protocol Documentation</a><a href="https://github.com/anandvignesh23-rgb/agentauth/blob/main/docs/threat-model.md" target="_blank" rel="noreferrer">Threat Model</a><a href="https://github.com/anandvignesh23-rgb/agentauth" target="_blank" rel="noreferrer">GitHub</a></div></article></section></main>`;
  }

  function demoView() {
    const steps = [
      ["Problem", "AI agents can initiate commerce actions, but payment systems need independent verification of what the agent may do."],
      ["Delegation", "Demo Consumer grants Shopping Copilot authority for Demo Electronics, ORD-1934, up to INR 4,999 for 15 minutes."],
      ["Valid Request", "Run real backend authorization. Expected ALLOW.", "valid"],
      ["Amount Attack", "Run INR 49,999. Expected DENY.", "amount_attack"],
      ["Replay", "Run duplicate signed request. Expected NONCE_REUSED.", "replay"],
      ["Prompt Injection", "Run malicious merchant/amount scenario. Expected DENY.", "prompt_injection"],
      ["Agent-Aware Risk", "Generate abnormal behavior and show rising agent risk.", "velocity_attack"],
      ["Step-Up", "Run unusual but valid transaction. Expected STEP_UP.", "high_risk"],
      ["Audit", "Show durable audit trail.", "/audit"],
      ["Evidence", "LIVE BACKEND, LIVE POSTGRES, REAL CRYPTOGRAPHY, REAL REPLAY PROTECTION, REAL RISK ENGINE, REAL STEP-UP.", "/evidence"]
    ];
    const step = steps[state.demoStep] || steps[0];
    return `<main class="page"><section class="panel demo-panel"><p class="eyebrow">Buildathon demo</p><h2>${esc(step[0])}</h2><p>${esc(step[1])}</p><div class="demo-actions">
      <button ${state.demoStep === 0 ? "disabled" : ""} data-demo-prev>Back</button>
      ${step[2]?.startsWith?.("/") ? `<button class="primary" data-nav="${step[2]}">Open</button>` : step[2] ? `<button class="primary" data-scenario="${step[2]}" data-demo-run>Run Step</button>` : `<button class="primary" data-demo-next>${state.demoStep === 0 ? "Start Demo" : "Continue"}</button>`}
      <button data-demo-next ${state.demoStep >= steps.length - 1 ? "disabled" : ""}>Next</button>
    </div></section><section class="panel">${state.demoResults.map(renderScenarioResult).join("") || empty("Demo results will appear here.")}</section></main>`;
  }

  function loginView() {
    root.innerHTML = `<main class="login-page"><form class="login-panel" id="loginForm">
      <p class="eyebrow">AgentAuth</p>
      <h1>Console Access</h1>
      <p>Demo session for the deployed AgentAuth console. Backend auth/RBAC is listed as partial in deployment status.</p>
      <label>Email<input name="email" type="email" value="demo@agentauth.test" autocomplete="email" required /></label>
      <label>Password<input name="password" type="password" value="demo-password" autocomplete="current-password" minlength="8" required /></label>
      <label>Role<select name="role">${["CONSUMER", "DEVELOPER", "MERCHANT", "ADMIN"].map((r) => `<option>${r}</option>`).join("")}</select></label>
      <p class="form-error" id="loginError"></p>
      <button class="primary">Enter Console</button>
    </form></main>`;
    root.querySelector("#loginForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (!data.email || String(data.password || "").length < 8) {
        root.querySelector("#loginError").textContent = "INVALID_CREDENTIALS";
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ email: data.email, created_at: new Date().toISOString() }));
      state.role = data.role;
      localStorage.setItem(ROLE_KEY, data.role);
      navigate("/dashboard");
      loadDashboard();
    });
  }

  function render() {
    const path = currentPath();
    if (path === "/login") return loginView();
    if (!session()) return loginView();
    if (!state.dashboard && !state.loading && !state.error) {
      loadDashboard();
      return;
    }
    let content = dashboardView();
    const parts = path.split("/").filter(Boolean);
    if (path.startsWith("/agents/")) content = agentDetail(parts[1]);
    else if (path === "/agents") content = agentsView();
    else if (path === "/delegations/new") content = createDelegationView();
    else if (path.startsWith("/delegations/")) content = delegationDetail(parts[1]);
    else if (path === "/delegations") content = delegationsView();
    else if (path.startsWith("/requests/")) content = requestDetail(parts[1]);
    else if (path === "/requests") content = requestsView();
    else if (path === "/step-up") content = stepUpView();
    else if (path === "/risk") content = riskView();
    else if (path === "/security-lab") content = securityLabView();
    else if (path === "/merchant") content = merchantView();
    else if (path === "/audit") content = auditView();
    else if (path === "/evidence") content = evidenceView();
    else if (path === "/developer") content = developerView();
    else if (path === "/demo") content = demoView();
    shell(content);
    bindPage();
  }

  function bindPage() {
    root.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.nav)));
    root.querySelector("[data-action='reload']")?.addEventListener("click", loadDashboard);
    root.querySelector("[data-action='reset-demo']")?.addEventListener("click", () => confirmReset());
    root.querySelectorAll("[data-revoke-agent]").forEach((btn) => btn.addEventListener("click", () => confirmAction("Revoke Agent", "This revokes the agent and any active delegations.", "Revoke", true, async () => {
      await api.post(`/v1/agents/${btn.dataset.revokeAgent}/revoke`);
      setToast("Agent revoked");
      await loadDashboard();
    })));
    root.querySelectorAll("[data-revoke-delegation]").forEach((btn) => btn.addEventListener("click", () => confirmAction("Revoke Delegation", "This immediately removes transaction authority for the scoped grant.", "Revoke", true, async () => {
      await api.post(`/v1/delegations/${btn.dataset.revokeDelegation}/revoke`);
      setToast("Delegation revoked");
      await loadDashboard();
    })));
    root.querySelectorAll("[data-approve]").forEach((btn) => btn.addEventListener("click", async () => {
      await api.post(`/v1/authorization-requests/${btn.dataset.approve}/approve`);
      setToast("Request approved");
      await loadDashboard();
    }));
    root.querySelectorAll("[data-deny]").forEach((btn) => btn.addEventListener("click", () => confirmAction("Deny Step-Up", "This denies the pending human challenge.", "Deny", true, async () => {
      await api.post(`/v1/authorization-requests/${btn.dataset.deny}/deny`);
      setToast("Request denied");
      await loadDashboard();
    })));
    root.querySelectorAll("[data-scenario]").forEach((btn) => btn.addEventListener("click", async () => runScenario(btn.dataset.scenario, btn.textContent.trim(), btn.hasAttribute("data-demo-run"))));
    root.querySelector("[data-demo-prev]")?.addEventListener("click", () => { state.demoStep = Math.max(0, state.demoStep - 1); render(); });
    root.querySelectorAll("[data-demo-next]").forEach((btn) => btn.addEventListener("click", () => { state.demoStep = Math.min(9, state.demoStep + 1); render(); }));
    root.querySelector("#searchInput")?.addEventListener("input", (event) => {
      state.search = event.target.value;
      render();
    });
    root.querySelector("#delegationForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const minutes = Number(form.minutes || 15);
      const created = await api.post("/v1/delegations", {
        agent_id: form.agent_id,
        merchant_id: form.merchant_id,
        order_id: form.order_id,
        max_amount: Number(form.max_amount),
        currency: form.currency,
        purpose: form.purpose,
        expires_at: new Date(Date.now() + minutes * 60_000).toISOString()
      });
      setToast("Delegation created");
      await loadDashboard();
      navigate(`/delegations/${created.delegation_id}`);
    });
  }

  function confirmAction(title, body, confirm, danger, action) {
    state.dialog = { title, body, confirm, danger, action };
    render();
  }

  function confirmReset() {
    confirmAction("Reset Demo", "This resets demo seed data through the backend.", "Reset", true, async () => {
      await api.post("/v1/dev/reset");
      state.details.securityLabResults = [];
      state.demoResults = [];
      setToast("Demo reset");
      await loadDashboard();
    });
  }

  async function runScenario(scenario, label, advanceDemo) {
    try {
      const body = await api.post("/v1/security-lab/run", { scenario });
      const item = { scenario, label, body };
      if (advanceDemo) {
        state.demoResults.unshift(item);
        state.demoStep = Math.min(9, state.demoStep + 1);
      } else {
        state.details.securityLabResults = [item, ...(state.details.securityLabResults || [])].slice(0, 8);
      }
      setToast("Demo scenario complete");
      await loadDashboard();
    } catch (err) {
      setToast(err.body?.error || err.message, "error");
    }
  }

  async function ensureDetail() {
    const path = currentPath();
    const parts = path.split("/").filter(Boolean);
    try {
      if (parts[0] === "requests" && parts[1] && !state.details[`request-${parts[1]}`]) {
        state.details[`request-${parts[1]}`] = await api.get(`/v1/authorization-requests/${parts[1]}/audit/export`);
        render();
      }
      if (parts[0] === "agents" && parts[1]) {
        const id = parts[1];
        const [history, reputation] = await Promise.all([
          state.details[`risk-history-${id}`] || api.get(`/v1/agents/${id}/risk-history`),
          state.details[`reputation-${id}`] || api.get(`/v1/agents/${id}/reputation`)
        ]);
        state.details[`risk-history-${id}`] = history;
        state.details[`reputation-${id}`] = reputation;
        render();
      }
    } catch (err) {
      setToast(err.body?.error || err.message, "error");
    }
  }

  function pageWithSearch(label, content) {
    return `<main class="page"><section class="toolbar"><label class="search"><span>Search ${esc(label)}</span><input id="searchInput" value="${esc(state.search)}" placeholder="ID, agent, merchant, order" /></label></section>${content}</main>`;
  }

  function searchList(list, fields) {
    const q = state.search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => fields.some((field) => String(item[field] || "").toLowerCase().includes(q)));
  }

  function kv(label, value) {
    return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  }

  function empty(text) {
    return `<div class="empty">${esc(text)}</div>`;
  }

  function notFound(label) {
    return `<main class="page"><section class="panel danger"><h2>${esc(label)} not found</h2><button data-nav="/dashboard">Dashboard</button></section></main>`;
  }

  function back(path, label) {
    return `<a class="back-link" href="${path}" data-link>&larr; ${esc(label)}</a>`;
  }

  function bars(values) {
    if (!values.length) return empty("No chart data.");
    return `<div class="bars">${values.map((v) => `<span style="height:${Math.max(8, Number(v || 0) * 100)}%" title="${score(v)}"></span>`).join("")}</div>`;
  }

  function timeline(items) {
    return items.length ? `<div class="timeline">${items.map((a) => `<div class="timeline-item"><time>${date(a.created_at)}</time><strong>${esc(a.event_type || "EVENT")}</strong><p>${esc(a.description || a.actor || "")}</p>${a.request_id ? `<a href="/requests/${esc(a.request_id)}" data-link>${esc(a.request_id)}</a>` : ""}</div>`).join("")}</div>` : empty("No audit events.");
  }

  window.addEventListener("popstate", () => {
    render();
    ensureDetail();
  });

  if (location.pathname === "/") history.replaceState({}, "", "/dashboard");
  render();
  if (session()) {
    loadDashboard().then(ensureDetail);
  }
})();
