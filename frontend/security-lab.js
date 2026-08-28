let latestRun = null;

async function run(scenario) {
  const res = await fetch("/v1/security-lab/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario })
  });
  latestRun = await res.json();
  document.getElementById("result").textContent = JSON.stringify(latestRun, null, 2);
  renderCheckoutAction();
}

function fieldFromCanonical(name) {
  return latestRun?.canonical?.split("\n").find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1);
}

function renderCheckoutAction() {
  const target = document.getElementById("checkoutActions");
  const token = latestRun?.result?.payment_authorization?.token;
  if (!token || latestRun?.result?.decision !== "ALLOW") {
    target.innerHTML = latestRun ? `<div class="notice">Razorpay order created? NO</div>` : "";
    return;
  }
  target.innerHTML = `<button id="payRazorpay">Verify Payment Provider Boundary</button><span class="muted">Razorpay credentials unavailable means no external payment order is created</span>`;
  document.getElementById("payRazorpay").addEventListener("click", startRazorpay);
}

async function startRazorpay() {
  const token = latestRun.result.payment_authorization.token;
  const orderPayload = {
    token,
    merchant_id: fieldFromCanonical("merchant_id"),
    order_id: fieldFromCanonical("order_id"),
    amount: Number(fieldFromCanonical("amount")),
    currency: fieldFromCanonical("currency")
  };
  const res = await fetch("/v1/payments/create-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderPayload)
  });
  const created = await res.json();
  document.getElementById("result").textContent = JSON.stringify({ authorization: latestRun.result, payment: created }, null, 2);
  if (!created.ok || !window.Razorpay) return;
  const checkout = created.checkout;
  const rzp = new Razorpay({
    key: checkout.key_id,
    amount: checkout.amount,
    currency: checkout.currency,
    name: checkout.merchant_display_name,
    description: "AgentAuth authorized Test Mode payment",
    order_id: checkout.razorpay_order_id,
    handler: async (response) => {
      const verified = await fetch("/v1/payments/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(response)
      });
      document.getElementById("result").textContent = JSON.stringify({ authorization: latestRun.result, payment: created, checkout_verification: await verified.json() }, null, 2);
    },
    modal: {
      ondismiss: () => {
        document.getElementById("result").textContent = JSON.stringify({ authorization: latestRun.result, payment: created, checkout: "dismissed" }, null, 2);
      }
    }
  });
  rzp.open();
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => run(button.dataset.scenario));
});

document.getElementById("reset").addEventListener("click", async () => {
  await fetch("/v1/dev/reset", { method: "POST" });
  latestRun = null;
  document.getElementById("checkoutActions").innerHTML = "";
  document.getElementById("result").textContent = "Demo reset.";
});
