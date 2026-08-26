"""
Minimal Python SDK facade for AgentAuth.

The runnable demo SDK is sdk/examples/demo-agent.mjs because this sandbox has
Node's Ed25519 crypto available without installing dependencies. In production,
implement this class with cryptography/PyNaCl and requests/httpx.
"""

class AgentAuthClient:
    def __init__(self, agent_id, private_key_path, base_url="http://127.0.0.1:8787"):
        self.agent_id = agent_id
        self.private_key_path = private_key_path
        self.base_url = base_url

    def request_payment_authorization(self, **kwargs):
        raise NotImplementedError("Use sdk/examples/demo-agent.mjs for the dependency-free runnable demo.")
