#!/usr/bin/env bash
# Locks the web ports down to Cloudflare's edge so the origin IP is useless to an
# attacker even if it leaks. Run once after Cloudflare for SaaS is on (every
# hostname is proxied by then), and monthly from cron so the ranges stay current.
#   bash /opt/frontage/deploy/cloudflare-firewall.sh
# SSH stays open (key-only, fail2ban); everything else is denied by default.
set -euo pipefail

v4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
[ -n "$v4" ] && [ -n "$v6" ] || { echo "could not fetch Cloudflare ranges"; exit 1; }

# Add the Cloudflare allows first, so there is never a moment with no web access.
for ip in $v4 $v6; do
  for port in 80 443; do
    ufw allow proto tcp from "$ip" to any port "$port" comment cloudflare >/dev/null
  done
  ufw allow proto udp from "$ip" to any port 443 comment cloudflare >/dev/null
done

# Then drop the open-to-the-world web rules (both v4 and v6 variants).
for rule in "80/tcp" "443/tcp" "443/udp"; do
  while ufw status numbered | grep -qE "\] $rule +ALLOW IN +Anywhere"; do
    n=$(ufw status numbered | grep -E "\] $rule +ALLOW IN +Anywhere" | head -n 1 | sed -E 's/^\[ *([0-9]+)\].*/\1/')
    ufw --force delete "$n" >/dev/null
  done
done

# Remove Cloudflare ranges that are no longer published.
ufw status numbered | grep cloudflare | sed -E 's/^\[ *([0-9]+)\].*from ([^ ]+).*/\1 \2/' | sort -rn | while read -r n ip; do
  if ! echo "$v4 $v6" | tr ' ' '\n' | grep -qx "$ip"; then ufw --force delete "$n" >/dev/null; fi
done

ufw reload >/dev/null
echo "web ports now accept traffic only from $(echo "$v4" | wc -l) IPv4 and $(echo "$v6" | wc -l) IPv6 Cloudflare ranges"
ufw status | grep -c cloudflare | sed 's/^/rules: /'
