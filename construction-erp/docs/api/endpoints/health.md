# Health endpoints

[Endpoints](index.md) | [API index](../index.md)

Source: `custom-addons/majal_administration/controllers/health.py`

## `GET /majal/health`

Unauthenticated liveness check for Caddy and external monitoring. It performs a
minimal database query and returns no database name, version, module list or
traceback.

| HTTP | Body |
| --- | --- |
| 200 | `{"status": "ok"}` |
| 429 | `{"status": "slow down"}` |
| 503 | `{"status": "unavailable"}` |

Responses are JSON with `Cache-Control: no-store`. The in-process safety limit is
30 requests per caller per 60 seconds; the reverse proxy should provide the
authoritative shared rate limit.

## `GET /majal/health/deep`

Authenticated readiness check. The session user must belong to
`majal_administration.group_platform_monitor` (Platform Monitor), directly or by
implication. Ordinary internal users receive HTTP 403.

The response contains only stable, non-sensitive check names:

```json
{
  "status": "ok",
  "checks": {
    "modules": "settled",
    "scheduler": "current",
    "recovery_points": "verified"
  }
}
```

Healthy readiness returns 200. A failed check returns 503 with `status` set to
`degraded`; unexpected check errors are represented as `unknown` without a
traceback. Use a dedicated monitoring user with only Platform Monitor and the
required company access.
