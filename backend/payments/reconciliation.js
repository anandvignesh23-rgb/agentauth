export async function reconcilePaymentExecution({ store, provider, execution_id }) {
  const execution = store.find("paymentExecutions", (p) => p.execution_id === execution_id);
  if (!execution) return null;
  if (!execution.razorpay_order_id) return execution;
  const order = await provider.fetchOrder(execution.razorpay_order_id);
  execution.provider_order_status = order.status;
  if (order.status === "paid") {
    execution.status = "CAPTURED";
    execution.paid_at = new Date().toISOString();
    const merchantOrder = store.find("merchantOrders", (o) => o.external_order_id === execution.order_id);
    if (merchantOrder) {
      merchantOrder.status = "PAID";
      merchantOrder.paid_at = execution.paid_at;
      merchantOrder.razorpay_payment_id = execution.razorpay_payment_id;
      await store.persistRecord?.("merchantOrders", merchantOrder);
      store.audit(execution.authorization_request_id, "MERCHANT_ORDER_PAID", "AGENTAUTH", `Merchant order ${merchantOrder.external_order_id} marked PAID.`, { execution_id: execution.execution_id });
    }
    store.audit(execution.authorization_request_id, "PAYMENT_CAPTURED", "RAZORPAY", `Payment execution ${execution.execution_id} captured.`, { razorpay_order_id: execution.razorpay_order_id });
  }
  store.audit(execution.authorization_request_id, "PAYMENT_RECONCILED", "RAZORPAY", `Payment execution ${execution.execution_id} reconciled.`, { provider_order_status: order.status });
  await store.persistRecord?.("paymentExecutions", execution);
  await store.save();
  return execution;
}
