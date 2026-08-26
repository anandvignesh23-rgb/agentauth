async function run(scenario) {
  const res = await fetch("/v1/security-lab/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario })
  });
  document.getElementById("result").textContent = JSON.stringify(await res.json(), null, 2);
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => run(button.dataset.scenario));
});

document.getElementById("reset").addEventListener("click", async () => {
  await fetch("/v1/dev/reset", { method: "POST" });
  document.getElementById("result").textContent = "Demo reset.";
});
