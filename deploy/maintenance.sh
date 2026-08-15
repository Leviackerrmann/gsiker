#!/bin/sh
# maintenance.sh - Limpieza y chequeo de recursos del VPS de Nébula.
# Corre semanal por cron. Reclama cache de build y capas huérfanas SIN tocar
# las imágenes de los colores blue/green (que sí están referenciadas por sus
# contenedores, aunque estén detenidos).
LOG="$HOME/nebula/maintenance.log"
{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
  # Cache de build > 7 días (lo que más crece con deploys repetidos).
  docker builder prune -af --filter until=168h 2>&1
  # Capas colgantes (dangling), NO imágenes etiquetadas en uso.
  docker image prune -f 2>&1
  # Estado de disco y RAM.
  df -h / | tail -1
  free -h | awk '/Mem/{print "RAM: "$3" usada / "$2}'
  USE=$(df / | awk 'NR==2{gsub("%","",$5); print $5}')
  [ "$USE" -ge 80 ] && echo "⚠️  ALERTA: disco al ${USE}% (revisar)"
} >> "$LOG" 2>&1
# Mantener el log acotado (últimas 500 líneas).
tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
