"""Autorización de tenant: dos capas que se componen.

- **Capa 1 — Entitlements (superadmin):** qué módulos tiene la EMPRESA. Sale del
  snapshot del plan (`limites.modulos`) ± el override por empresa
  (`empresa.modulos_override = {"add": [...], "remove": [...]}`).
- **Capa 2 — Permisos (dueño):** qué módulos puede ver un USUARIO. El ADMIN tiene
  todos; el OPERADOR solo los de `usuario.permisos`.

Regla de oro (un solo punto): un usuario puede un módulo sii el módulo está en los
módulos efectivos de la empresa **y** (es admin **o** el módulo está en sus
permisos). `permisos_operador ⊆ modulos_efectivos_empresa`.
"""
from __future__ import annotations

from app.models.empresa import Empresa, Suscripcion
from app.models.usuario import RolUsuario, Usuario
from app.services import limites as L

# Vocabulario único de módulos, compartido por ambas capas. Debe coincidir con las
# claves usadas en `limites.modulos` de los planes.
MODULOS_VALIDOS: set[str] = {"pos", "inventario", "compras", "ventas", "cobranza", "ia"}


def modulos_efectivos_empresa(sus: Suscripcion | None, empresa: Empresa | None) -> set[str]:
    """Módulos que la empresa realmente tiene (capa 1): los del plan vigente ±
    override. Fail-closed: sin suscripción ⇒ ningún módulo."""
    base = set()
    if sus is not None:
        mods = L.leer_limite(sus.limites_snapshot, "modulos")
        if isinstance(mods, list):
            base = {m for m in mods if isinstance(m, str)}
    override = getattr(empresa, "modulos_override", None) if empresa is not None else None
    if isinstance(override, dict):
        base |= {m for m in (override.get("add") or []) if isinstance(m, str)}
        base -= {m for m in (override.get("remove") or []) if isinstance(m, str)}
    return base & MODULOS_VALIDOS


def permisos_usuario(user: Usuario, modulos_emp: set[str]) -> set[str]:
    """Módulos que el usuario puede ver (capa 2), ya intersectados con los de la
    empresa. ADMIN ⇒ todos los de la empresa. OPERADOR ⇒ los suyos ∩ empresa."""
    if user.rol == RolUsuario.ADMIN:
        return set(modulos_emp)
    propios = {m for m in (user.permisos or []) if isinstance(m, str)}
    return propios & modulos_emp


def puede_modulo(modulo: str, user: Usuario, modulos_emp: set[str]) -> bool:
    """Chequeo compuesto de las dos capas para un módulo puntual."""
    if modulo not in modulos_emp:
        return False
    if user.rol == RolUsuario.ADMIN:
        return True
    return modulo in {m for m in (user.permisos or []) if isinstance(m, str)}


def sanear_permisos(permisos: list[str] | None, modulos_emp: set[str]) -> list[str]:
    """Normaliza los permisos que se van a guardar a un operador: solo módulos
    válidos y que la empresa tenga (permisos ⊆ entitlements). Sin duplicados."""
    if not permisos:
        return []
    pedidos = {m for m in permisos if isinstance(m, str)}
    return sorted((pedidos & MODULOS_VALIDOS) & modulos_emp)
