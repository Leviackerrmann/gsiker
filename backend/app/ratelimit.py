import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

# Limitador de tasa simple, de ventana deslizante, en memoria del proceso.
# Suficiente para frenar fuerza bruta en una instancia. En despliegues con
# varios procesos/instancias, migrar a un backend compartido (Redis).
_store: dict[str, deque] = defaultdict(deque)


def _allow(key: str, max_hits: int, window_s: int) -> bool:
    now = time.monotonic()
    dq = _store[key]
    # Descarta los intentos que ya salieron de la ventana.
    while dq and now - dq[0] > window_s:
        dq.popleft()
    if len(dq) >= max_hits:
        return False
    dq.append(now)
    return True


def enforce(key: str, max_hits: int, window_s: int) -> None:
    """Registra un intento para `key` y lanza HTTP 429 si excede el límite."""
    if not _allow(key, max_hits, window_s):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Espera un momento e inténtalo de nuevo.",
        )


def reset() -> None:
    """Limpia el estado (para tests)."""
    _store.clear()
