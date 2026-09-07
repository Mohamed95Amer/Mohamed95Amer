# Integration providers and external systems

[API index](index.md)

Majal supports two integration directions with different trust boundaries.

| Direction | Supported mechanism | Typical use |
| --- | --- | --- |
| External system to Majal | XML-RPC or JSON-RPC with a dedicated Majal user and API key | CRM, mobile app, data warehouse, accounting orchestrator |
| Majal browser/client to Majal | Authenticated field-app JSON routes | Offline field operations |
| Majal to external system | Approved connector addon using providers and queued jobs | Property portals, messaging, storage, payments, monitoring |
| Human hand-off | Controlled CSV/JSON export | A provider with no approved live adapter |

There is no generic REST proxy, arbitrary webhook destination or URL-driven HTTP
client. That is intentional: turning an administrator-entered URL into a server
request would create an SSRF and data-exfiltration boundary.

## Inbound integrations

Use a dedicated internal user, not an employee's personal account. Give it only
the required groups and companies, generate an API key, and store that key in a
secret manager. Start with [Getting started](getting-started.md), then choose
[XML-RPC](xmlrpc.md) or [JSON-RPC](jsonrpc.md).

Recommended client behavior:

1. Set a 30-second request timeout.
2. Retry reads and explicitly idempotent operations with exponential backoff.
3. Before retrying a create after an ambiguous timeout, search by your stable
   external reference. Do not create a second business record blindly.
4. Send `allowed_company_ids` in context.
5. Read the record after a workflow method and persist its Majal id.
6. Never write workflow `state` fields directly.

## Outbound provider architecture

`majal.integration.provider` stores non-secret configuration. Its main fields
are `company_id`, `service`, `endpoint_url`, `secret_env_var`, `state` and health
metadata. `secret_env_var` must match `MAJAL_[A-Z0-9_]+`; the actual value is read
from the server environment and is never stored in SQL.

`majal.integration.job` is an auditable queue with:

- one idempotency key per provider;
- minimum provider-neutral JSON payloads;
- company consistency checks;
- retry/backoff and terminal failure states;
- row locking with `SKIP LOCKED` for concurrent workers;
- external id and response summary fields that must not contain secrets or raw
  personal data.

The foundation fails closed. A provider cannot activate until an installed addon
overrides the adapter hooks and reports that the approved adapter is available.

## Building an approved adapter addon

Create a separate addon that depends on `majal_integrations`; do not modify the
foundation for each provider. The addon should inherit
`majal.integration.provider` and implement only the services it owns.

```python
from odoo import models


class MajalIntegrationProvider(models.Model):
    _inherit = "majal.integration.provider"

    def _adapter_available(self):
        self.ensure_one()
        if self.service == "property_portal":
            return True
        return super()._adapter_available()

    def _deliver_job(self, job):
        self.ensure_one()
        if self.service != "property_portal":
            return super()._deliver_job(job)

        secret = self._get_secret()
        result = approved_client.publish(
            endpoint=self.endpoint_url,
            token=secret,
            payload=job.payload,
            timeout=(5, 25),
        )
        return {"external_id": result.external_id, "summary": "accepted"}
```

Production adapter requirements:

- allow-list exact HTTPS hosts; do not accept redirects to another host;
- reject loopback, link-local, private and cloud-metadata addresses;
- validate request and response schemas;
- use separate connect and read timeouts;
- never log authorization headers, tokens or full personal-data payloads;
- map provider errors into retryable and terminal categories;
- make the provider operation idempotent using the job key;
- add mocked success, timeout, retry, duplicate and authorization tests;
- add a contract test against the provider sandbox before production approval.

Business code may create jobs through its own reviewed workflow. Remote API
clients must not call the private `_enqueue()` or `_process_batch()` methods.

## Secrets

Store provider secrets in the deployment secret manager or encrypted environment
file, backed up separately from the database. The database contains only the
environment variable name. Rotate by:

1. create the replacement at the provider;
2. update the environment secret;
3. restart only the application service;
4. run the provider health test;
5. revoke the old credential;
6. record the rotation date without recording the value.

## Integration checklist

- Dedicated API user and minimum groups
- Correct company assignments and `allowed_company_ids`
- API key stored outside source code
- Stable external reference and retry policy
- Workflow action used instead of direct state write
- Pagination and rate limits implemented
- Personal data minimized
- Audit owner and support contact named
- Sandbox contract test passed
- Credential rotation and revocation tested
