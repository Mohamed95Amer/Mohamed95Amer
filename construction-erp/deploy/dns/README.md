# majalops.com — moving DNS to Cloudflare

Two jobs, and they are independent. Move the nameservers first; nothing breaks
while it settles, and the records can be filled in afterwards.

## 1. Move the nameservers

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com), **Add a site**
   → `majalops.com` → **Free**.
2. Cloudflare scans the domain and shows what it found. **Read that list before
   continuing.** Anything it misses is lost when the nameservers change — most
   painfully `MX` records, because mail stops silently and nobody reports it for
   a day. A brand-new domain with no email has nothing to lose here; a domain
   with a mailbox on it does.
3. Cloudflare gives you **two nameservers** (`something.ns.cloudflare.com`).
4. At the registrar, replace the existing nameservers with those two.
5. Wait. Usually minutes, occasionally a few hours. Cloudflare emails you when
   the zone goes active.

Check it from anywhere:

```bash
dig +short NS majalops.com
```

## 2. Add the mail records straight away

Two TXT records, typed by hand, no file needed — and they are worth having from
the first day the zone is live, before anything else exists:

| Type | Name | Content |
|---|---|---|
| TXT | `@` | `v=spf1 -all` |
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:dmarc@majalops.com` |

They say the domain sends no email and that anything claiming otherwise should
be rejected. A new domain without them is a free `From:` address for anybody who
fancies sending a Majal invoice.

## 3. Import the rest — but not until there is a server

**Do not import the A and CNAME records early.** With no server behind them the
domain resolves to an address that answers nothing, so every visit hangs until
it times out. A name that does not exist yet fails honestly and instantly; a
name pointing at a dead address looks like your site is broken. Wait.

When the server exists, `majalops.com.zone` in this folder is a BIND file ready
for **DNS → Records → Import and Export → Import**.

Before importing, replace the placeholder address. It is `203.0.113.10`, from
the range RFC 5737 reserves for documentation — it routes nowhere, so a
half-finished import cannot point a live name at a stranger's server:

```bash
sed -i 's/203\.0\.113\.10/YOUR.SERVER.IP/g' majalops.com.zone
```

| Name | Type | Points at | Proxy |
|---|---|---|---|
| `majalops.com` | A | your server | **Proxied** — needed for the redirect rule to www |
| `www` | CNAME | `majalops.com` | Proxied |
| `demo` | A | your server | **DNS-only at first** (see below), proxied later |
| `api` | CNAME | `demo.majalops.com` | follows `demo` |
| `docs` | CNAME | your Pages project | Proxied |
| `status` | CNAME | your status provider | **DNS-only, always** |
| `_dmarc`, apex TXT | TXT | SPF and DMARC | n/a |

## The two settings that cause the most trouble

**SSL/TLS mode must be Full (strict).** Set it under SSL/TLS → Overview before
proxying anything. The default on some accounts is Flexible, which means
Cloudflare talks HTTPS to the browser and plain HTTP to your origin — and since
Caddy answers HTTP with a redirect to HTTPS, the two bounce the request back and
forth until the browser gives up. The symptom is `ERR_TOO_MANY_REDIRECTS` and
the cause is never obvious from the error.

**Leave `demo` DNS-only until Caddy has its certificate.** Caddy gets a
Let's Encrypt certificate over an HTTP-01 challenge, which is simplest when the
request actually reaches your server. Grey cloud, let it issue, confirm
`https://demo.majalops.com` loads, then switch to orange.

## Odoo behind the proxy

- `deploy/demo/odoo.conf` already sets `proxy_mode = True`, and the Caddyfile
  already forwards `X-Forwarded-Proto`, `X-Forwarded-Host` and `X-Real-IP`.
  Both are required: without them Odoo builds `http://` URLs in emails and
  redirects from behind an HTTPS front door.
- **Cloudflare's free plan caps uploads at 100 MB.** That is not hypothetical
  here — an IFC model or a drawing set will exceed it, and the failure arrives
  as a 413 from Cloudflare, not as anything Odoo logs. If large uploads matter,
  either keep `demo` DNS-only or put uploads on a name that is not proxied.
- WebSockets work through the proxy, so Odoo's bus (live chatter, the approval
  inbox refreshing) is fine.

## Before any of this is useful

There is no server yet. `deploy/demo/` is a complete stack — Postgres, Odoo,
Caddy — but it needs somewhere to run:

```bash
# on a fresh VPS with Docker installed
git clone -b codex/odoo19-ui-enhancement <repo> majal
cd majal/construction-erp/deploy/demo
cp .env.example .env
docker compose up -d
```

The compose file refuses to start until all five variables are set, which is
the right behaviour and worth knowing before you meet it: `DEMO_HOST` (that is
where `demo.majalops.com` goes), `ODOO_ADMIN_PASSWD`, `DB_PASSWORD`,
`DB_ADMIN_PASSWORD` and `MAJAL_AI_MASTER_KEY`. Generate the four secrets rather
than inventing them:

```bash
openssl rand -base64 32          # for each of the three passwords
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Two vCPUs and 4 GB of memory is enough for a demo; the BIM viewer's parsing is
the heaviest thing it does and that happens once per model.

Open only 80 and 443. Odoo's 8069 should not be reachable from the internet —
Caddy is the only thing that needs it, and it reaches it over the compose
network.
