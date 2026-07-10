#!/bin/bash
# deploy.sh - Deploy ComprasExpobol from laptop to server
# Usage: ./deploy.sh <server-host> [--switch]
set -e

SERVER=""
AUTO_SWITCH=false

while [ $# -gt 0 ]; do
    case "$1" in
        --switch) AUTO_SWITCH=true; shift ;;
        --help|-h)
            echo "Usage: ./deploy.sh <server-host> [--switch]"
            echo ""
            echo "  <server-host>  IP or hostname of Ubuntu Server"
            echo "  --switch       Automatically switch traffic after deploy"
            exit 0
            ;;
        *)
            if [ -z "$SERVER" ]; then
                SERVER="$1"; shift
            else
                echo "Unknown option: $1"
                exit 1
            fi
            ;;
    esac
done

if [ -z "$SERVER" ]; then
    echo "Usage: ./deploy.sh <server-host> [--switch]"
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH_DEST="ronald@$SERVER"
SSHPASS="55211515"

echo "=== ComprasExpobol Deploy ==="
echo "Server : $SERVER"
echo ""

# Check rsync access
if sshpass -p "$SSHPASS" ssh "$SSH_DEST" "exit" 2>/dev/null; then
    SSH_CMD="sshpass -p $SSHPASS ssh $SSH_DEST"
    RSYNC_CMD="sshpass -p $SSHPASS rsync"
else
    echo "ERROR: Cannot connect to $SSH_DEST"
    exit 1
fi

echo "Checking server status..."
INACTIVE=$($SSH_CMD "bash ~/compras_ctl.sh inactive")
echo "Inactive instance: $INACTIVE"
echo ""

echo "Uploading code to $INACTIVE..."
$RSYNC_CMD -avz \
    --exclude 'venv' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.env' \
    --exclude '.git' \
    --exclude 'logs' \
    --exclude 'BASE DE DATOS.xlsx' \
    --exclude 'migrate_excel.py' \
    --exclude 'deploy' \
    -e ssh \
    "$PROJECT_DIR/" \
    "$SSH_DEST:~/compras_$INACTIVE/"

echo ""
echo "Running deploy setup on server..."
$SSH_CMD "bash ~/compras_ctl.sh deploy $INACTIVE"

echo ""
echo "Syncing static files to nginx directory..."
$SSH_CMD "echo 55211515 | sudo -S cp -a ~/compras_$INACTIVE/app/static/* /var/www/compras-static/ 2>&1 && echo 55211515 | sudo -S chown -R www-data:www-data /var/www/compras-static/ && echo 'static files synced'"

echo ""
echo "Deploy to $INACTIVE complete!"

if [ "$AUTO_SWITCH" = true ]; then
    echo ""
    echo "Switching traffic to $INACTIVE..."
    $SSH_CMD "bash ~/compras_ctl.sh switch"
    echo ""
    echo "All done!"
else
    echo ""
    echo "Next step:"
    echo "  ssh $SSH_DEST 'bash ~/compras_ctl.sh switch'"
    echo ""
    echo "To check status:"
    echo "  ssh $SSH_DEST 'bash ~/compras_ctl.sh status'"
    echo ""
    echo "To rollback if something goes wrong:"
    echo "  ssh $SSH_DEST 'bash ~/compras_ctl.sh rollback'"
fi
