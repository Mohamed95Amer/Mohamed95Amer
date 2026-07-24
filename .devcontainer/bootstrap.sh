#!/usr/bin/env bash
# One-time setup when the Codespace is created: build the images, initialize
# the demo database, and start Odoo. First run downloads the Odoo image and
# installs the accounting suite, so it takes several minutes.
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)/construction-erp"
[ -f .env ] || cp .env.example .env

# Single source of truth for the module list: scripts/init-db.sh
MODULES="$(grep -m1 '^MODULES=' scripts/init-db.sh | cut -d'"' -f2)"

echo "==> Building images (first run pulls Odoo 18 — a few minutes)…"
docker compose build

echo "==> Starting PostgreSQL…"
docker compose up -d db
for i in $(seq 1 60); do
    docker compose exec -T db pg_isready -U odoo >/dev/null 2>&1 && break
    sleep 2
done

if ! docker compose exec -T db psql -U odoo -lqt | cut -d'|' -f1 | grep -qw erp; then
    echo "==> Initializing database 'erp' with the construction suite + accounting (several minutes)…"
    docker compose run --rm odoo odoo -c /etc/odoo/odoo.conf -d erp \
        -i "$MODULES" --stop-after-init
else
    echo "==> Database 'erp' already exists, skipping init."
fi

echo "==> Starting Odoo…"
docker compose up -d odoo

echo "======================================================================"
echo " Odoo is starting on forwarded port 8069."
echo " Open the PORTS tab, click the 8069 link. DB: erp  Login: admin / admin"
echo "======================================================================"
