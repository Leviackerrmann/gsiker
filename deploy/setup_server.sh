#!/bin/bash
# setup_server.sh - Bootstrap único del VPS para Nébula blue/green (correr en la laptop).
# Uso: ./setup_server.sh [servidor]   (por defecto: nebula)
set -e

SERVER="${1:-nebula}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$PROJECT_DIR/deploy"

echo "=== Setup Nébula en '$SERVER' ==="

ssh "$SERVER" exit 2>/dev/null || { echo "ERROR: sin SSH a '$SERVER'"; exit 1; }

echo "1) Creando estructura de directorios..."
ssh "$SERVER" "mkdir -p ~/nebula/infra/router ~/nebula/infra/db-init ~/nebula/shared ~/nebula/blue ~/nebula/green"

echo "2) Subiendo archivos de infraestructura..."
rsync -avz "$DEPLOY_DIR/docker-compose.infra.yml" "$SERVER:~/nebula/infra/docker-compose.yml"
rsync -avz "$DEPLOY_DIR/docker-compose.app.yml"   "$SERVER:~/nebula/deploy-app-compose.yml"
rsync -avz "$DEPLOY_DIR/router/nginx.conf"        "$SERVER:~/nebula/infra/router/nginx.conf"
rsync -avz "$PROJECT_DIR/infra/db/init/"          "$SERVER:~/nebula/infra/db-init/"
rsync -avz "$DEPLOY_DIR/nebula_ctl.sh"            "$SERVER:~/nebula/nebula_ctl.sh"
ssh "$SERVER" "chmod +x ~/nebula/nebula_ctl.sh"

echo "3) Configurando .env de producción..."
if ssh "$SERVER" "[ -f ~/nebula/shared/.env ]"; then
    echo "   Ya existe ~/nebula/shared/.env (no lo toco)."
else
    rsync -avz "$DEPLOY_DIR/env.prod.example" "$SERVER:~/nebula/shared/.env"
    echo "   >>> Creado ~/nebula/shared/.env desde el ejemplo. EDÍTALO con secretos reales:"
    echo "       ssh $SERVER 'nano ~/nebula/shared/.env'"
fi

echo "4) Red Docker + router (la BD se levanta DESPUÉS de editar el .env)..."
ssh "$SERVER" "docker network inspect nebula_net >/dev/null 2>&1 || docker network create nebula_net"
ssh "$SERVER" "cd ~/nebula/infra && ln -sf ../shared/.env .env && docker compose -p nebula-infra up -d router"
# La BD NO se levanta aquí: Postgres fija sus credenciales al inicializar el volumen,
# así que debe subir con el .env real (paso 'nebula_ctl.sh infra' tras editar secretos).

echo "5) Abriendo el puerto 80 en el firewall del VPS (iptables)..."
ssh "$SERVER" '
    if ! sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null; then
        # Insertar ANTES de la regla REJECT de Oracle.
        rej=$(sudo iptables -L INPUT --line-numbers -n | awk "/REJECT/{print \$1; exit}")
        if [ -n "$rej" ]; then sudo iptables -I INPUT "$rej" -p tcp --dport 80 -j ACCEPT;
        else sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT; fi
        # Persistir si hay soporte.
        if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save;
        elif [ -d /etc/iptables ]; then sudo sh -c "iptables-save > /etc/iptables/rules.v4"; fi
        echo "   Puerto 80 abierto en iptables."
    else
        echo "   Puerto 80 ya estaba abierto en iptables."
    fi
'

cat <<EOF

=== Setup completo (estructura + red + router + puerto 80) ===
Pendiente MANUAL, en orden:
  a) Editar secretos:   ssh $SERVER 'nano ~/nebula/shared/.env'   (claves ROTADAS)
  b) Levantar la BD:    ssh $SERVER '~/nebula/nebula_ctl.sh infra'
  c) Consola Oracle Cloud -> VCN -> Security List -> Ingress:
       Añadir regla: Source 0.0.0.0/0, TCP, puerto destino 80.
  d) Primer deploy:     deploynebula      (o: bash deploy/deploy.sh nebula --switch)

Estado infra:  ssh $SERVER '~/nebula/nebula_ctl.sh status'
EOF
