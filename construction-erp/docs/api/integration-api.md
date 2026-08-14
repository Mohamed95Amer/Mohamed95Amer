# Majal Integration API

Majal provides a deliberately small REST surface for integrations that do not
need the full XML-RPC/JSON-RPC ORM. API clients are managed in **Majal
Integrations → API Clients** by a company administrator.

## Create a client key

1. Create an internal integration user with only the groups and project access
   the integration needs.
2. Create an API Client and select that user.
3. Choose the scope **Projects — read**.
4. Select **Rotate Key**, then copy the one-time token into a secret manager.

Majal stores only a SHA-256 hash and the last eight-character hint. A revoked
key cannot be recovered; rotate it and update the integration instead.

## Read construction projects

```http
GET https://your-host/api/v1/projects?limit=50
X-Majal-API-Key: YOUR_MAJAL_API_KEY
```

The result is constrained by the selected integration user's normal Majal
company, workspace and project record rules. The endpoint never accepts a
domain or model name from the caller.

```json
{
  "data": [
    {
      "id": 42,
      "name": "North Tower",
      "project_code": "PRJ-0042",
      "stage": "execution",
      "type": "building"
    }
  ],
  "count": 1
}
```

`limit` is an integer from 1 to 100. Invalid, missing or revoked keys return
`401`; unsupported scopes return `403`; invalid limits return `400`.

## Read controlled documents

Create a second API client with the **Documents — read** scope, then call:

```http
GET https://your-host/api/v1/documents?limit=50
X-Majal-API-Key: YOUR_MAJAL_API_KEY
```

The response includes the document reference, title, workflow state, current
revision and linked project ID. Document content and attachments are not
returned by this endpoint; use the normal authenticated document API when a
client explicitly needs those records.

## Search Majal

Create a client with the **Majal Search — read** scope, then call the native
search fallback:

```http
GET https://your-host/api/v1/search?q=fire%20pump&limit=25
X-Majal-API-Key: YOUR_MAJAL_API_KEY
```

It searches construction project names/codes and controlled-document
names/references, while still applying the integration user’s record rules.
The query must contain at least two characters and the result is capped at 100
rows. This is intentionally a small native fallback; a future Meilisearch
deployment can replace its implementation without changing the contract.

This endpoint is read-only. Use the documented XML-RPC or JSON-RPC API for
write workflows, where the same server-side approval and record-rule guards
continue to apply.
