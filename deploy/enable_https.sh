#!/bin/bash
# enable_https.sh - Monta HTTPS (Let's Encrypt) en el router del VPS.
# Usa un dominio que apunte al VPS; para IP pelada sirve sslip.io gratis:
#   <ip-con-guiones>.sslip.io  o  <ip>.sslip.io
#
# Uso: ./enable_https.sh <servidor> <dominio> <email>
#   ej: ./enable_https.sh nebula 161.153.59.104.sslip.io ronaldgiron4@gmail.com
#
# Requisitos previos: infra ya levantada (setup_server.sh) y un color activo.
# El router (docker-compose.infra.yml) debe montar /etc/letsencrypt y /var/www/certbot.
# TRAS correr esto: abrir el ingress TCP 443 en la consola de Oracle Cloud.
set -e

SERVER="${1:?Uso: enable_https.sh <servidor> <dominio> <email>}"
DOMAIN="${2:?Falta el dominio}"
EMAIL="${3:?Falta el email}"

ssh "$SERVER" DOMAIN="$DOMAIN" EMAIL="$EMAIL" 'bash -s' <<'REMOTE'
set -e
NEBULA=$HOME/nebula
CONF=$NEBULA/infra/router/nginx.conf

# Puertos del color activo (para proxyar desde el bloque TLS).
FP=$(grep -E '# NEBULA_FRONT$' "$CONF" | grep -oE '127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' | head -1)
BP=$(grep -E '# NEBULA_BACK$'  "$CONF" | grep -oE '127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' | head -1)
FP=${FP:-8081}; BP=${BP:-8001}
echo "Color activo -> front $FP / back $BP"

# 1) Abrir 443 en iptables del VPS (Oracle: además hay que abrirlo en la consola).
if ! sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; then
  rej=$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/{print $1; exit}')
  if [ -n "$rej" ]; then sudo iptables -I INPUT "$rej" -p tcp --dport 443 -j ACCEPT
  else sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT; fi
  command -v netfilter-persistent >/dev/null 2>&1 && sudo netfilter-persistent save || true
fi

# 2) certbot + webroot.
command -v certbot >/dev/null 2>&1 || { sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot; }
sudo mkdir -p /var/www/certbot

# 3) Config intermedia: sirve el challenge ACME en :80 y sigue proxyeando.
cat > "$CONF" <<EOF
upstream nebula_front { server 127.0.0.1:$FP; }  # NEBULA_FRONT
upstream nebula_back  { server 127.0.0.1:$BP; }  # NEBULA_BACK

server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location /api/ { proxy_pass http://nebula_back;  proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /     { proxy_pass http://nebula_front; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
}
EOF

# 4) Recrear router para montar los volúmenes de certificados.
cd "$NEBULA/infra" && docker compose -p nebula-infra --env-file ../shared/.env up -d --force-recreate router
sleep 2

# 5) Emitir el certificado (webroot) con hook de recarga para renovaciones.
sudo certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" --no-eff-email \
  --deploy-hook "docker exec nebula-infra-router-1 nginx -s reload"

# 6) Config final: 80 = ACME + redirect a HTTPS; 443 = TLS + proxy al activo.
cat > "$CONF" <<EOF
upstream nebula_front { server 127.0.0.1:$FP; }  # NEBULA_FRONT
upstream nebula_back  { server 127.0.0.1:$BP; }  # NEBULA_BACK

server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    client_max_body_size 20M;
    location /api/ { proxy_pass http://nebula_back;  proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /     { proxy_pass http://nebula_front; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
}
EOF

docker exec nebula-infra-router-1 nginx -t && docker exec nebula-infra-router-1 nginx -s reload
echo "HTTPS montado para $DOMAIN. Abre el ingress TCP 443 en la consola de Oracle."
REMOTE
