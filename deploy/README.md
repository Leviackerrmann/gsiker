# Nébula — Despliegue Blue/Green (VPS Oracle)

Flujo **local-first**: todo cambio se prueba en local (`docker compose up -d` en la raíz);
al terminar, se despliega al VPS con blue/green y switch sin caída.

**Producción:** `161.153.59.104` (alias SSH `nebula`). Docker + Compose + router nginx.

## Idea (misma metodología que GestorSKU)

- **Capa compartida** (`nebula-infra`): Postgres único (BD compartida), `.env` de prod y un
  **router nginx** en el puerto 80 que enruta al color activo. El bot de Telegram (singleton)
  vive aquí bajo el perfil `telegram`.
- **Blue / Green** (`nebula-blue`, `nebula-green`): cada uno = backend + frontend en puertos
  internos (blue 8081/8001, green 8082/8002), publicados solo en `127.0.0.1`. Ambos usan la
  misma Postgres compartida.
- **Deploy** sube el código al color **inactivo**, lo construye y migra; **switch** reescribe
  el router al color nuevo y recarga nginx (los usuarios no lo notan). **rollback** vuelve.

## Setup inicial (una sola vez, desde la laptop)

```bash
bash deploy/setup_server.sh nebula
```
Crea la estructura en `~/nebula/`, sube infra, crea la red `nebula_net`, levanta `db` + `router`
y abre el puerto 80 en iptables. Luego, manual:
1. `ssh nebula 'nano ~/nebula/shared/.env'` — poner secretos **rotados**.
2. Consola Oracle → VCN → Security List → Ingress: TCP 80 desde `0.0.0.0/0`.

## Desplegar una versión nueva

```bash
deploynebula                       # = deploy.sh nebula --switch (despliega Y conmuta)
# o sin conmutar:
bash deploy/deploy.sh nebula       # deja el color listo; conmutas a mano cuando quieras
```

## Comandos en el servidor

```bash
ssh nebula '~/nebula/nebula_ctl.sh status'     # color activo + estado
ssh nebula '~/nebula/nebula_ctl.sh switch'     # conmutar blue <-> green
ssh nebula '~/nebula/nebula_ctl.sh rollback'   # volver al color previo
```

## Notas

- **Migraciones retrocompatibles:** la BD es compartida; el color viejo sigue sirviendo
  mientras el nuevo migra. Usar cambios aditivos (expand/contract).
- **Puertos internos:** blue front 8081/back 8001, green front 8082/back 8002 — solo en
  `127.0.0.1`. Público solo el 80 (router).
- **Telegram:** prod usa `@gsikerbot` (token rotado en el `.env` del VPS); para probar en
  local usar un bot distinto (`@gsiker_dev_bot`) para no chocar por el mismo token.
