import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync("frontend/app.js", "utf8");
const html = fs.readFileSync("frontend/index.html", "utf8");
const css = fs.readFileSync("frontend/styles.css", "utf8");
const backend = fs.readFileSync("backend/app.js", "utf8");

test("frontend exposes the core AgentAuth routes from the build spec", () => {
  for (const route of [
    "/login",
    "/dashboard",
    "/agents",
    "/delegations",
    "/requests",
    "/step-up",
    "/risk",
    "/security-lab",
    "/audit",
    "/merchant",
    "/evidence",
    "/developer",
    "/demo"
  ]) {
    assert.match(app, new RegExp(route.replace("/", "\\/")));
    assert.match(backend, new RegExp(route.replace("/", "\\/")));
  }
});

test("frontend keeps API access centralized and renders structured security outcomes", () => {
  assert.match(app, /const api = \{/);
  assert.match(app, /request\(path, options = \{\}\)/);
  for (const term of ["ALLOW", "DENY", "STEP_UP", "NONCE_REUSED", "INVALID_SIGNATURE", "AMOUNT_EXCEEDS_DELEGATION"]) {
    assert.match(app, new RegExp(term));
  }
});

test("frontend includes required demo, step-up, risk, and provider-boundary controls", () => {
  for (const term of [
    "Create Delegation",
    "Revoke Delegation",
    "Revoke Agent",
    "Approve",
    "Deny",
    "Razorpay Adapter",
    "BLOCKED BY CREDENTIALS",
    "Provider contract simulation",
    "Agent-Aware Risk",
    "Buildathon demo"
  ]) {
    assert.match(app, new RegExp(term));
  }
});

test("frontend does not expose private keys or backend secrets", () => {
  const publicBundle = `${html}\n${app}\n${css}`;
  for (const forbidden of ["service role key", "database credentials", "JWT signing secret", "Razorpay secret", "webhook secret", "demo-agent-private.pem"]) {
    assert.equal(publicBundle.includes(forbidden), false);
  }
  assert.equal(publicBundle.includes("private_key"), false);
});
