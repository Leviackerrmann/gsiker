#!/bin/bash
# nebula_ctl.sh - Control Blue/Green para Nébula (corre EN el VPS, en ~/nebula/).
# Uso: nebula_ctl.sh {status|active|inactive|deploy <color>|switch|rollback}
set -e

NEBULA="$HOME/nebula"
SHARED="$NEBULA/shared"
INFRA="$NEBULA/infra"
ROUTER_CONF="$INFRA/router/nginx.conf"
APP_COMPOSE_TMPL="$NEBULA/deploy-app-compose.yml"

BLUE_FRONT=8081; BLUE_BACK=8001
GREEN_FRONT=8082; GREEN_BACK=8002

color_front() { [ "$1" = blue ] && echo "$BLUE_FRONT" || echo "$GREEN_FRONT"; }
color_back()  { [ "$1" = blue ] && echo "$BLUE_BACK"  || echo "$GREEN_BACK";  }

get_active() {
    [ -f "$ROUTER_CONF" ] || { echo "none"; return; }
    local p
    p=$(grep -E '# NEBULA_FRONT$' "$ROUTER_CONF" | grep -oE '127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' | head -1)
    case "$p" in
        "$BLUE_FRONT")  echo blue ;;
        "$GREEN_FRONT") echo green ;;
        *)              echo none ;;
    esac
}

get_inactive() {
    case "$(get_active)" in
        blue) echo green ;;
        green) echo blue ;;
        *) echo blue ;;   # bootstrap: sin color activo -> primer deploy va a blue
    esac
}

# docker compose de un color, con las variables que la plantilla necesita.
compose_color() {
    local color="$1"; shift
    local dir="$NEBULA/$color"
    COLOR="$color" FRONT_PORT="$(color_front "$color")" BACK_PORT="$(color_back "$color")" \
        docker compose -p "nebula-$color" --project-directory "$dir" \
        -f "$dir/docker-compose.yml" --env-file "$SHARED/.env" "$@"
}

# docker compose de la capa infra.
compose_infra() {
    docker compose -p nebula-infra --project-directory "$INFRA" \
        -f "$INFRA/docker-compose.yml" --env-file "$SHARED/.env" "$@"
}

wait_health() {  # $1 = puerto backend
    local port="$1" i
    for i in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
            return 0
        fi
        sleep 3
    done
    return 1
}

# Reescribe el router a (front, back) SIN cambiar el inode del archivo.
# `sed -i` renombra un temporal (nuevo inode) y rompe el bind-mount de archivo
# único del contenedor; con truncate-in-place (`cat >`) el contenedor sí ve el cambio.
router_set_ports() {
    local front="$1" back="$2" tmp
    tmp=$(mktemp)
    sed -E -e "/# NEBULA_FRONT$/ s#127\.0\.0\.1:[0-9]+#127.0.0.1:$front#" \
           -e "/# NEBULA_BACK$/  s#127\.0\.0\.1:[0-9]+#127.0.0.1:$back#" \
           "$ROUTER_CONF" > "$tmp"
    cat "$tmp" > "$ROUTER_CONF"
    rm -f "$tmp"
}

telegram_enabled() {
    # Activo solo si hay token real (no vacío y sin el placeholder CAMBIAR).
    grep -qE '^TELEGRAM_BOT_TOKEN=.+' "$SHARED/.env" 2>/dev/null && \
        ! grep -qE '^TELEGRAM_BOT_TOKEN=.*CAMBIAR' "$SHARED/.env" 2>/dev/null
}

case "${1:-help}" in
    status)
        active=$(get_active)
        echo "=== Nébula Blue/Green ==="
        echo "Color activo : $active"
        echo
        for c in blue green; do
            state=$(docker inspect -f '{{.State.Status}}' "nebula-$c-backend-1" 2>/dev/null || echo "no-creado")
            echo "  $c backend  : $state  (front $(color_front $c) / back $(color_back $c))"
        done
        echo
        echo "  infra db   : $(docker inspect -f '{{.State.Health.Status}}' nebula-infra-db-1 2>/dev/null || echo 'no-creado')"
        echo "  infra router: $(docker inspect -f '{{.State.Status}}' nebula-infra-router-1 2>/dev/null || echo 'no-creado')"
        echo "  infra tg   : $(docker inspect -f '{{.State.Status}}' nebula-infra-telegram-1 2>/dev/null || echo 'no-creado')"
        ;;

    active)   get_active ;;
    inactive) get_inactive ;;

    infra)
        # Levanta la capa compartida (db + router). Requiere .env con secretos reales,
        # porque Postgres fija sus credenciales al inicializar el volumen por 1ª vez.
        echo "==> Levantando capa compartida (db + router)..."
        compose_infra up -d db router
        echo "==> Esperando health de Postgres..."
        for i in $(seq 1 20); do
            if [ "$(docker inspect -f '{{.State.Health.Status}}' nebula-infra-db-1 2>/dev/null)" = healthy ]; then
                echo "    db OK"; break
            fi
            sleep 3
        done
        ;;

    deploy)
        target="${2:?Uso: nebula_ctl.sh deploy <blue|green>}"
        [ "$target" = blue ] || [ "$target" = green ] || { echo "ERROR: color debe ser blue|green"; exit 1; }
        dir="$NEBULA/$target"
        mkdir -p "$dir"
        cp "$APP_COMPOSE_TMPL" "$dir/docker-compose.yml"
        ln -sf "$SHARED/.env" "$dir/.env"
        echo "==> Construyendo y levantando $target (Alembic corre al arrancar)..."
        compose_color "$target" up -d --build
        back=$(color_back "$target")
        echo "==> Esperando health del backend $target (127.0.0.1:$back/api/health)..."
        if wait_health "$back"; then
            echo "    backend $target OK"
        else
            echo "ERROR: backend $target no respondió health a tiempo"
            compose_color "$target" logs --tail 30 backend || true
            exit 1
        fi
        front=$(color_front "$target")
        if curl -fsS "http://127.0.0.1:$front/" >/dev/null 2>&1; then
            echo "    frontend $target OK"
        else
            echo "    WARN: frontend $target no respondió (revisar)"
        fi
        echo "==> Deploy a $target completo. (Aún NO recibe tráfico; usa 'switch'.)"
        ;;

    switch|rollback)
        old=$(get_active)
        new=$(get_inactive)

        if [ "$1" = rollback ]; then
            echo "==> Rollback: volviendo a $new (código previo)..."
            # El color previo pudo quedar detenido tras el último switch; arrancarlo.
            compose_color "$new" up -d
        else
            echo "==> Switch: de ${old} a ${new}..."
        fi

        newback=$(color_back "$new")
        newfront=$(color_front "$new")

        echo "    Validando health de $new..."
        if ! wait_health "$newback"; then
            echo "ERROR: $new no está sano; aborto sin tocar el tráfico."
            exit 1
        fi

        # Reescribir el router al nuevo color (preserva inode -> visible en el contenedor).
        router_set_ports "$newfront" "$newback"

        if compose_infra exec -T router nginx -t >/dev/null 2>&1; then
            compose_infra exec -T router nginx -s reload
            echo "    Router recargado -> $new (front $newfront / back $newback)"
        else
            echo "ERROR: config de nginx inválida; revirtiendo router."
            of=9999; ob=9999
            if [ "$old" != none ]; then of=$(color_front "$old"); ob=$(color_back "$old"); fi
            router_set_ports "$of" "$ob"
            exit 1
        fi

        # El bot (singleton) debe seguir al backend activo.
        if telegram_enabled; then
            docker tag "nebula-$new-backend:latest" nebula-backend:live 2>/dev/null || true
            compose_infra --profile telegram up -d telegram || true
        fi

        # Apagar el color viejo (queda listo para rollback rápido).
        if [ "$old" != none ] && [ "$old" != "$new" ]; then
            compose_color "$old" stop || true
        fi
        echo "==> Ahora activo: $new"
        ;;

    help|*)
        cat <<EOF
Nébula Blue/Green Control
Uso: nebula_ctl.sh {status|active|inactive|infra|deploy <color>|switch|rollback}

  status     Muestra color activo y estado de contenedores
  active     Imprime el color activo
  inactive   Imprime el color inactivo (destino del próximo deploy)
  infra      Levanta la capa compartida (db + router)
  deploy X   Construye/levanta el color X y valida health (NO conmuta tráfico)
  switch     Conmuta el tráfico al color inactivo (blue <-> green)
  rollback   Vuelve al color previo
EOF
        ;;
esac
