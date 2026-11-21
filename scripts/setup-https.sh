#!/usr/bin/env bash
# setup-https.sh — ออก Let's Encrypt cert ผ่าน DNS-01 (Cloudflare) สำหรับเว็บที่อยู่หลัง NAT/LAN
#
# ใช้เมื่อ: มี domain ฟรี (us.kg/pp.eu.org) + domain อยู่บน Cloudflare DNS
# cert จะถูก mount เข้า Caddy ที่ /etc/caddy/certs/ และ Caddyfile ใช้ tls cert file
#
# ต้องตั้ง env ใน .env หรือ shell ก่อนรัน:
#   DOMAIN=lottery-xxx.us.kg
#   CF_API_TOKEN=xxxx        (Cloudflare API Token — permission: Zone.DNS Edit)
#   CF_ACCOUNT_ID=xxxx       (Cloudflare Account ID — หาใน dashboard URL ขวาสุด)
#
# รัน:  bash scripts/setup-https.sh
# renew: acme.sh มี cron ของตัวเอง — cert auto-renew + hook ด้านล่าง reload Caddy ให้
set -euo pipefail
cd "$(dirname "$0")/.."

# ---- โหลด env ----
set -a; . ./.env; set +a
: "${DOMAIN:?ต้องตั้ง DOMAIN ใน .env}"
: "${CF_API_TOKEN:?ต้องตั้ง CF_API_TOKEN ใน .env}"
: "${CF_ACCOUNT_ID:?ต้องตั้ง CF_ACCOUNT_ID ใน .env}"

CERTS_DIR="./certs"
mkdir -p "$CERTS_DIR"

echo "== ติดตั้ง acme.sh (ถ้ายังไม่มี) =="
if ! command -v ~/.acme.sh/acme.sh >/dev/null 2>&1; then
  curl https://get.acme.sh | sh -s email=admin@localhost
fi
ACME=~/.acme.sh/acme.sh

echo "== ออก cert สำหรับ $DOMAIN (DNS-01 / Cloudflare) =="
export CF_Token="$CF_API_TOKEN"
export CF_Account_ID="$CF_ACCOUNT_ID"

"$ACME" --issue --dns dns_cf -d "$DOMAIN" --server letsencrypt

# install cert → ./certs (mount เข้า container)
"$ACME" --install-cert -d "$DOMAIN" \
  --fullchain-file "$CERTS_DIR/fullchain.pem" \
  --key-file       "$CERTS_DIR/key.pem" \
  --reloadcmd "docker exec demo-lottery-caddy-1 caddy reload --config /etc/caddy/Caddyfile || docker compose restart caddy"

# ---- patch Caddyfile: ใส่ tls cert path ในบล็อก {$DOMAIN} ----
if grep -q 'TLS-CERT-MANUAL' Caddyfile; then
  # CRLF-safe: ทำงานทั้ง LF/CRLF
  node -e '
    const fs=require("fs");let s=fs.readFileSync("Caddyfile","utf8");
    s=s.replace(/\{\$DOMAIN\} \{\r?\n\t# TLS-CERT-MANUAL[^\n]*\r?\n(?:\t# [^\n]*\r?\n)*/,
      "{$DOMAIN} {\n\ttls /etc/caddy/certs/fullchain.pem /etc/caddy/certs/key.pem\n");
    fs.writeFileSync("Caddyfile",s);'
  echo "== Caddyfile patched: {$DOMAIN} ใช้ cert จาก ./certs =="
fi

docker compose up -d caddy
echo ""
echo "✅ เสร็จ — เว็บจะอยู่ที่ https://$DOMAIN"
echo "   (ภายใน LAN ต้องให้ domain resolve มาที่เครื่องนี้ — ดูหมายเหตุด้านล่าง)"
