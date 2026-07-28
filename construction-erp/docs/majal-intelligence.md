# Majal Intelligence

Majal Intelligence is a permission-aware, bilingual copilot for construction
and facilities data. The first release is deliberately read-only: it can
summarize and recommend, but it cannot approve, sign, pay, close, delete or
modify operational records.

## Providers

Five provider modes are supplied:

| Provider | Default state | Credential |
| --- | --- | --- |
| Local AI through Ollama | Enabled | None |
| Kimi | Disabled | Company API key |
| OpenAI | Disabled | Company API key |
| Gemini | Disabled | Company API key |
| Claude | Disabled | Company API key |

The hosted providers are bring-your-own-key integrations. Their models and
commercial terms change independently of Majal, so model names remain editable.

## Start the free local provider

Install Ollama on the host that runs Majal, then download the default model:

```powershell
ollama pull qwen3:8b
ollama serve
```

The Docker configuration reaches native Ollama at:

```text
http://host.docker.internal:11434/v1/chat/completions
```

On a Linux server, either provide an equivalent reachable endpoint in
**Majal Intelligence → Configuration → Providers**, or run Ollama as a private
service on the same Docker network. Never expose Ollama directly to the public
internet.

## Configure hosted providers safely

Generate a Fernet master key once:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set the value as `MAJAL_AI_MASTER_KEY` in the server environment and restart
Majal. Do not commit it. Administrators can then open **Majal Intelligence →
Configuration → Providers**, enable a provider, set its model and paste a new
API key. Existing keys are never returned to the browser.

If the master key is lost or changed, stored provider keys cannot be decrypted.
Clear each key and enter it again after restoring the correct server key.

### Secured networks and custom certificate authorities

Some company networks inspect HTTPS traffic with a certificate authority that
Windows trusts but the Majal Linux container does not. If provider calls report
a secure-connection or certificate error, export the approved CA certificates
as a PEM bundle and copy it into the persistent Majal data volume:

```powershell
docker compose cp .\majal-ai-ca.pem odoo:/var/lib/odoo/majal-ai-ca.pem
docker compose restart odoo
```

Majal detects that path automatically and uses it only for outbound AI provider
calls. Never disable TLS verification. To use a different path inside the
container, set `MAJAL_AI_CA_BUNDLE` in `.env`.

## Security behavior

- Majal searches through the current user's environment, so normal access
  controls and record rules remain active.
- Conversation history is private to its owner; system administrators can audit
  company usage.
- Hosted endpoints are fixed to prevent administrators from turning the server
  into an unrestricted outbound request proxy.
- Provider errors are sanitized. API keys and provider response bodies are not
  written to the Majal logs.
- Requests and provider-reported token totals are audited and limited per user
  and company.
- Operational records are explicitly treated as untrusted prompt content.
- All AI results are labelled as generated material and should be reviewed.

## Production checklist

1. Sign a suitable data-processing agreement with every hosted provider used.
2. Confirm data residency and retention requirements with each client.
3. Set company request/token limits before enabling a hosted provider.
4. Test Arabic and English answers against anonymized client scenarios.
5. Keep human approval for safety, contractual, financial and sign-off actions.
6. Monitor the **Usage & Audit** view for errors, latency and unexpected growth.
