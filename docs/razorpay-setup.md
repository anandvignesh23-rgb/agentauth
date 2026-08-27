# Razorpay Test Mode Setup

AgentAuth supports Razorpay Test Mode only. Do not use Live Mode credentials for this demo.

## Dashboard Steps

1. Open the Razorpay Dashboard and switch to Test Mode.
2. Generate a Test Mode API key pair.
3. In Vercel production environment variables, set:

```env
RAZORPAY_KEY_ID=<test_key_id>
RAZORPAY_KEY_SECRET=<test_key_secret>
RAZORPAY_WEBHOOK_SECRET=<strong_webhook_secret>
PAYMENT_PROVIDER=razorpay
```

4. Configure the Razorpay webhook URL:

```text
https://agentauth.vercel.app/api/webhooks/razorpay
```

5. Subscribe to these minimum events:

```text
payment.authorized
payment.captured
payment.failed
order.paid
```

6. Redeploy Vercel so the serverless functions receive the new secrets.

## Verification

Run the credential-gated order test:

```bash
npm run test:razorpay
```

Then run the public flow:

```text
Security Lab -> Valid Request -> Pay in Razorpay Test Mode
```

Use Razorpay test payment details from the Razorpay Dashboard/docs. After checkout, AgentAuth verifies the checkout signature server-side. The webhook should then arrive at `/api/webhooks/razorpay`, be signature-verified, and update the durable payment execution/audit state.

## Safety

Never commit Razorpay secrets. The frontend receives only the Test Mode key id and order id required by Razorpay Checkout; it never receives `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET`.
