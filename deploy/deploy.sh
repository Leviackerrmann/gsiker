#!/bin/bash
# deploy.sh - Despliega Nébula desde la laptop al VPS (blue/green).
# Uso: ./deploy.sh [servidor] [--switch]
#   servidor : alias SSH o user@host (por defecto: nebula)
#   --switch : conmuta el tráfico automáticamente tras desplegar
set -e

SERVER="nebula"
AUTO_SWITCH=false
for arg in "$@"; do
    case "$arg" in
        --switch) AUTO_SWITCH=true ;;
        --help|-h)
            echo "Uso: ./deploy.sh [servidor] [--switch]"
            exit 0 ;;
        -*) echo "Opción desconocida: $arg"; exit 1 ;;
        *)  SERVER="$arg" ;;
    esac
done

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Nébula Deploy ==="
echo "Servidor: $SERVER"

if ! ssh "$SERVER" exit 2>/dev/null; then
    echo "ERROR: no puedo conectar por SSH a '$SERVER'."
    exit 1
fi

INACTIVE=$(ssh "$SERVER" "~/nebula/nebula_ctl.sh inactive")
echo "Color inactivo (destino): $INACTIVE"

# Preparar el color destino: plantilla compose + symlink al .env compartido.
ssh "$SERVER" "mkdir -p ~/nebula/$INACTIVE && cp ~/nebula/deploy-app-compose.yml ~/nebula/$INACTIVE/docker-compose.yml && ln -sf ~/nebula/shared/.env ~/nebula/$INACTIVE/.env"

echo "Subiendo código (backend + frontend) a $INACTIVE..."
rsync -avz --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'venv' \
    --exclude '.venv' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.env' \
    --exclude 'dist' \
    --exclude 'backups' \
    -e ssh \
    "$PROJECT_DIR/backend" "$PROJECT_DIR/frontend" \
    "$SERVER:~/nebula/$INACTIVE/"

echo "Construyendo y migrando en el servidor..."
ssh "$SERVER" "~/nebula/nebula_ctl.sh deploy $INACTIVE"

if [ "$AUTO_SWITCH" = true ]; then
    echo "Conmutando tráfico a $INACTIVE..."
    ssh "$SERVER" "~/nebula/nebula_ctl.sh switch"
    echo "¡Listo! Ahora activo: $INACTIVE"
else
    echo
    echo "Deploy a $INACTIVE completo (sin conmutar). Siguiente paso:"
    echo "  ssh $SERVER '~/nebula/nebula_ctl.sh switch'"
    echo "Estado:   ssh $SERVER '~/nebula/nebula_ctl.sh status'"
    echo "Rollback: ssh $SERVER '~/nebula/nebula_ctl.sh rollback'"
fi
