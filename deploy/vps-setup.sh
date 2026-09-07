#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for Frontage: system updates, Docker,
# firewall, the repository and data folders. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/simondev2002/frontage/main/deploy/vps-setup.sh | bash
# Afterwards copy server/.env (production values) and server/keys/*.p8 to
# /opt/frontage/server and run:  cd /opt/frontage/server && docker compose up -d --build
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -q
apt-get -yq upgrade
apt-get -yq install ca-certificates curl git ufw fail2ban unattended-upgrades sqlite3

echo "== docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get -yq install docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

echo "== firewall (ssh, http, https; everything else closed)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== fail2ban for ssh"
systemctl enable --now fail2ban

echo "== automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== repository"
mkdir -p /opt
if [ ! -d /opt/frontage ]; then
  git clone https://github.com/simondev2002/frontage.git /opt/frontage
else
  git -C /opt/frontage pull --ff-only
fi
mkdir -p /opt/frontage/server/data /opt/frontage/server/keys /opt/frontage/server/certs
chmod 700 /opt/frontage/server/keys

echo "== nightly database backup (kept 14 days)"
mkdir -p /var/backups/frontage
cat > /etc/cron.daily/frontage-backup <<'EOF'
#!/bin/sh
d=/var/backups/frontage
[ -f /opt/frontage/server/data/frontage.db ] && sqlite3 /opt/frontage/server/data/frontage.db ".backup $d/frontage-$(date +%F).db"
find "$d" -name 'frontage-*.db' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/frontage-backup

echo
echo "Done. Next: put .env and keys/*.p8 in /opt/frontage/server, then"
echo "  cd /opt/frontage/server && node scripts/fetch-apple-certs.js || true"
echo "  cd /opt/frontage/server && docker compose up -d --build"
