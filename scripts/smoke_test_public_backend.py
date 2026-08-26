#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.error
import urllib.request


def request(base_url, path, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=data,
        method=method,
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        body = res.read().decode("utf-8")
        return res.status, json.loads(body) if body else {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True, help="Public backend URL, for example https://agentauth-api.example.com")
    parser.add_argument("--run-demo-flow", action="store_true", help="Run the built-in demo security-lab authorization flow")
    args = parser.parse_args()

    checks = []
    for path in ["/health", "/v1/agents", "/openapi.json"]:
        status, body = request(args.base_url, path)
        checks.append({"path": path, "status": status, "ok": status == 200})
        if path == "/health":
            checks[-1]["health"] = body

    if args.run_demo_flow:
        status, body = request(args.base_url, "/v1/security-lab/run", "POST", {"scenario": "valid"})
        checks.append({
            "path": "/v1/security-lab/run",
            "status": status,
            "ok": status == 200 and body.get("result", {}).get("decision") in {"ALLOW", "STEP_UP"},
            "decision": body.get("result", {}).get("decision"),
            "risk": body.get("result", {}).get("risk"),
        })

    print(json.dumps({"base_url": args.base_url, "checks": checks}, indent=2))
    return 0 if all(check["ok"] for check in checks) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(json.dumps({"error": "HTTP_ERROR", "status": exc.code, "body": exc.read().decode("utf-8")}, indent=2))
        raise SystemExit(1)
