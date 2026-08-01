# Public pages and database redirects

[← Endpoints](index.md) · [← Index](../index.md)

Five routes that need no authentication. None of them returns data; they exist so
that an unauthenticated visitor lands somewhere sensible.

## Branding pages

Source: `custom-addons/majal_branding/controllers/legal.py`

| Route | Methods | `auth` | Template |
| --- | --- | --- | --- |
| `/majal/legal/open-source` | GET | `public` | `majal_branding.open_source_notices` |
| `/majal/about` | GET | `public` | `majal_branding.about_majal` |
| `/majal/help` | GET | `public` | `majal_branding.help_and_support` |

All three are `type="http"`, `readonly=True`, `sitemap=False`, `website=True`.
They render HTML and take no parameters.

Each is passed the same six values, read from `ir.config_parameter` with defaults:

| Config parameter | Default |
| --- | --- |
| `majal.product_name` | `Majal` |
| `majal.tagline` | `Construction and facilities, in one operational system.` |
| `majal.support_email` | empty |
| `majal.support_url` | empty |
| `majal.privacy_url` | empty |
| `majal.terms_url` | empty |

These are set through **Settings** (`res.config.settings` in `majal_branding`,
which also carries `majal.nav_color`, `majal.primary_color` and
`majal.accent_color`). An administrator can read or write them over RPC:

```python
value = models.execute_kw(
    DB, uid, API_KEY, "ir.config_parameter", "get_param",
    ["majal.support_email", ""],
)
```

`sitemap=False` keeps them out of the generated sitemap; they are still publicly
reachable by URL.

`/majal/legal/open-source` is where the third-party licence notices are
published. If you redistribute a Majal deployment, that page is part of meeting
the obligations recorded in `construction-erp/NOTICE.md`.

## Database-manager redirects

Source: `custom-addons/majal_branding/controllers/database.py`

Class `MajalDatabase(Database)` overrides two stock Odoo routes.

| Route | Methods | `auth` | Behaviour |
| --- | --- | --- | --- |
| `/web/database/selector` | any | **`none`** | 303 → `/web/login?db=<configured db>` |
| `/web/database/manager` | any | **`none`** | 303 → `/web/login?db=<configured db>` |

Majal ships as a single-database product with the database manager disabled in
production, so the selector cannot help anybody and must not become an
Odoo-branded dead end. The database name comes from `db_name` in `odoo.conf`,
taking the first entry if it is a list, and falling back to `erp`.

### What this means for integrations

- **There is no database list to enumerate.** Your integration must know the
  database name up front. It is whatever `db_name` is set to — `erp` in the
  shipped Docker profile.
- The `db` RPC service is unavailable in a Majal deployment. Do not build against
  `exp_list`, `exp_dump`, `exp_restore` or the rest of `odoo/service/db.py`.
- A 303 to the login page is the correct, expected response from these two paths.
  Do not treat it as a misconfiguration.

See [Getting started → Database selection](../getting-started.md#database-selection).
