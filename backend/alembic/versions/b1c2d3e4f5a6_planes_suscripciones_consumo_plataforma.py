"""planes/suscripciones rediseñados + consumo IA + plataforma

Revision ID: b1c2d3e4f5a6
Revises: e7f8a9b0c1d2
Create Date: 2026-08-16

Rediseña `planes` (límites JSONB) y `suscripciones` (versionado + snapshot +
estado_base + vigencia), agrega el consumo de IA (`ia_uso_eventos`,
`ia_uso_contador`) bajo RLS, la tabla `platform_admins`, `audit_log.platform_admin_id`
y mueve el superadmin fuera de `usuarios`. Solo aplica en PostgreSQL; el esquema
de tests se crea desde los modelos (SQLite).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b1c2d3e4f5a6"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None

USO_TABLES = ["ia_uso_eventos", "ia_uso_contador"]
POLICY = "tenant_isolation"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # 1) Tipos enum: intervaloplan nuevo; TRIAL agregado a estadosuscripcion.
    op.execute("CREATE TYPE intervaloplan AS ENUM ('MENSUAL','ANUAL')")
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE estadosuscripcion ADD VALUE IF NOT EXISTS 'TRIAL'")

    intervalo = postgresql.ENUM("MENSUAL", "ANUAL", name="intervaloplan", create_type=False)
    estado = postgresql.ENUM("TRIAL", "ACTIVA", "SUSPENDIDA", "CANCELADA", name="estadosuscripcion", create_type=False)

    # 2) platform_admins
    op.create_table(
        "platform_admins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=True, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("nombre_completo", sa.String(200), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("totp_secret", sa.String(64), nullable=True),
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fecha_creacion", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_platform_admins_id", "platform_admins", ["id"])
    op.create_index("ix_platform_admins_username", "platform_admins", ["username"])

    # 3) planes: nuevas columnas + backfill + drop de las viejas
    op.add_column("planes", sa.Column("codigo", sa.String(60), nullable=True))
    op.add_column("planes", sa.Column("precio", sa.Numeric(10, 2), nullable=True))
    op.add_column("planes", sa.Column("moneda", sa.String(3), nullable=True))
    op.add_column("planes", sa.Column("intervalo", intervalo, nullable=True))
    op.add_column("planes", sa.Column("es_personalizado", sa.Boolean(), nullable=True))
    op.add_column("planes", sa.Column("empresa_id", sa.Integer(), nullable=True))
    op.add_column("planes", sa.Column("limites", postgresql.JSONB(), nullable=True))
    op.add_column("planes", sa.Column("fecha_creacion", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_foreign_key("fk_planes_empresa", "planes", "empresas", ["empresa_id"], ["id"], ondelete="CASCADE")
    op.execute(
        """
        UPDATE planes SET
          codigo = 'legacy-' || lower(regexp_replace(nombre, '[^a-zA-Z0-9]+', '-', 'g')),
          precio = COALESCE(precio_mensual, 0),
          moneda = 'GTQ',
          intervalo = 'MENSUAL',
          es_personalizado = false,
          fecha_creacion = now(),
          limites = jsonb_build_object(
            'usuarios', max_usuarios,
            'registros', jsonb_build_object('skus', max_skus, 'clientes', NULL),
            'modulos', '["pos","inventario","compras","ventas","cobranza"]'::jsonb,
            'ia', NULL,
            'umbral_alerta', 0.8
          )
        """
    )
    op.alter_column("planes", "codigo", nullable=False)
    op.alter_column("planes", "precio", nullable=False)
    op.alter_column("planes", "moneda", nullable=False)
    op.alter_column("planes", "intervalo", nullable=False)
    op.alter_column("planes", "es_personalizado", nullable=False)
    op.alter_column("planes", "limites", nullable=False)
    # El `nombre` deja de ser único (ahora la clave estable es `codigo`); sin esto
    # el seed de los nuevos planes choca con un plan legacy del mismo nombre.
    op.execute("ALTER TABLE planes DROP CONSTRAINT IF EXISTS planes_nombre_key")
    op.create_unique_constraint("uq_planes_codigo", "planes", ["codigo"])
    op.create_index("ix_planes_codigo", "planes", ["codigo"])
    op.drop_column("planes", "precio_mensual")
    op.drop_column("planes", "max_usuarios")
    op.drop_column("planes", "max_skus")

    # 4) suscripciones: nuevas columnas + backfill + drop de `estado`
    op.add_column("suscripciones", sa.Column("estado_base", estado, nullable=True))
    op.add_column("suscripciones", sa.Column("limites_snapshot", postgresql.JSONB(), nullable=True))
    op.add_column("suscripciones", sa.Column("precio_snapshot", sa.Numeric(10, 2), nullable=True))
    op.add_column("suscripciones", sa.Column("moneda_snapshot", sa.String(3), nullable=True))
    op.add_column("suscripciones", sa.Column("intervalo_snapshot", intervalo, nullable=True))
    op.add_column("suscripciones", sa.Column("fin_trial", sa.DateTime(timezone=True), nullable=True))
    op.add_column("suscripciones", sa.Column("vigente_hasta", sa.DateTime(timezone=True), nullable=True))
    op.add_column("suscripciones", sa.Column("ancla_facturacion", sa.DateTime(timezone=True), nullable=True))
    op.add_column("suscripciones", sa.Column("motivo_cambio", sa.String(30), nullable=True))
    op.add_column("suscripciones", sa.Column("creada_por_admin_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_suscripciones_admin", "suscripciones", "platform_admins",
        ["creada_por_admin_id"], ["id"], ondelete="SET NULL",
    )
    op.execute(
        """
        UPDATE suscripciones s SET
          estado_base = s.estado,
          ancla_facturacion = s.fecha_inicio,
          moneda_snapshot = 'GTQ',
          intervalo_snapshot = 'MENSUAL',
          motivo_cambio = 'migracion',
          precio_snapshot = COALESCE(p.precio, 0),
          limites_snapshot = COALESCE(p.limites, '{}'::jsonb)
        FROM planes p WHERE s.plan_id = p.id
        """
    )
    # Gracia: las suscripciones existentes no deben quedar vencidas por la migración.
    op.execute(
        "UPDATE suscripciones SET "
        "fin_trial = now() + interval '30 days', "
        "vigente_hasta = now() + interval '30 days'"
    )
    op.alter_column("suscripciones", "estado_base", nullable=False)
    op.alter_column("suscripciones", "limites_snapshot", nullable=False)
    op.alter_column("suscripciones", "precio_snapshot", nullable=False)
    op.alter_column("suscripciones", "moneda_snapshot", nullable=False)
    op.alter_column("suscripciones", "intervalo_snapshot", nullable=False)
    op.alter_column("suscripciones", "ancla_facturacion", nullable=False)
    op.drop_column("suscripciones", "estado")
    op.create_index(
        "uq_suscripcion_vigente", "suscripciones", ["empresa_id"],
        unique=True, postgresql_where=sa.text("fecha_fin IS NULL"),
    )

    # 5) Consumo de IA + RLS
    op.create_table(
        "ia_uso_eventos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
        sa.Column("feature", sa.String(50), nullable=False),
        sa.Column("modelo", sa.String(80), nullable=True),
        sa.Column("tokens_entrada", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_salida", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("costo_estimado_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("periodo_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("empresa_id", "idempotency_key", name="uq_ia_evento_empresa_idem"),
    )
    op.create_index("ix_ia_uso_eventos_id", "ia_uso_eventos", ["id"])
    op.create_index("ix_ia_uso_eventos_empresa_id", "ia_uso_eventos", ["empresa_id"])
    op.create_index("ix_ia_uso_eventos_periodo_inicio", "ia_uso_eventos", ["periodo_inicio"])
    op.create_index("ix_ia_uso_eventos_fecha", "ia_uso_eventos", ["fecha"])

    op.create_table(
        "ia_uso_contador",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("periodo_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("periodo_fin", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requests_usados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_usados", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("costo_acumulado_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("credito_extra_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("credito_extra_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.UniqueConstraint("empresa_id", "periodo_inicio", name="uq_ia_contador_empresa_periodo"),
    )
    op.create_index("ix_ia_uso_contador_id", "ia_uso_contador", ["id"])
    op.create_index("ix_ia_uso_contador_empresa_id", "ia_uso_contador", ["empresa_id"])

    for table in USO_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {POLICY} ON {table}
            USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::int)
            WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::int)
            """
        )

    # 6) audit_log.platform_admin_id + CHECK "a lo sumo un actor"
    op.add_column("audit_log", sa.Column("platform_admin_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_audit_platform_admin", "audit_log", "platform_admins",
        ["platform_admin_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_audit_log_platform_admin_id", "audit_log", ["platform_admin_id"])
    op.create_check_constraint(
        "ck_audit_un_solo_actor", "audit_log",
        "NOT (usuario_id IS NOT NULL AND platform_admin_id IS NOT NULL)",
    )

    # 7) Mover el superadmin fuera de `usuarios` y volver empresa_id obligatorio.
    op.execute(
        """
        INSERT INTO platform_admins (username, email, password_hash, nombre_completo, activo, totp_enabled, fecha_creacion)
        SELECT username, email, password_hash, nombre_completo, activo, COALESCE(totp_enabled, false), now()
        FROM usuarios WHERE username = 'superadmin' AND empresa_id IS NULL
        ON CONFLICT (username) DO NOTHING
        """
    )
    op.execute("DELETE FROM usuarios WHERE username = 'superadmin' AND empresa_id IS NULL")
    op.alter_column("usuarios", "empresa_id", existing_type=sa.Integer(), nullable=False)

    # 8) Rol Postgres BYPASSRLS para el engine de plataforma (defensivo: requiere
    #    privilegio CREATEROLE; si no lo hay, se omite y se crea a mano en deploy).
    with op.get_context().autocommit_block():
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebula_platform') THEN
                    BEGIN
                        CREATE ROLE nebula_platform BYPASSRLS NOLOGIN;
                    EXCEPTION WHEN insufficient_privilege THEN
                        RAISE NOTICE 'Sin privilegio para crear nebula_platform; crear el rol a mano.';
                    END;
                END IF;
            END $$;
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.drop_constraint("ck_audit_un_solo_actor", "audit_log", type_="check")
    op.drop_index("ix_audit_log_platform_admin_id", table_name="audit_log")
    op.drop_constraint("fk_audit_platform_admin", "audit_log", type_="foreignkey")
    op.drop_column("audit_log", "platform_admin_id")

    for table in USO_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {POLICY} ON {table}")
    op.drop_table("ia_uso_contador")
    op.drop_table("ia_uso_eventos")

    op.drop_index("uq_suscripcion_vigente", table_name="suscripciones")
    op.add_column("suscripciones", sa.Column("estado", postgresql.ENUM(name="estadosuscripcion", create_type=False), nullable=True))
    op.execute("UPDATE suscripciones SET estado = estado_base::text::estadosuscripcion")
    op.drop_constraint("fk_suscripciones_admin", "suscripciones", type_="foreignkey")
    for col in ("creada_por_admin_id", "motivo_cambio", "ancla_facturacion", "vigente_hasta",
                "fin_trial", "intervalo_snapshot", "moneda_snapshot", "precio_snapshot",
                "limites_snapshot", "estado_base"):
        op.drop_column("suscripciones", col)

    op.add_column("planes", sa.Column("precio_mensual", sa.Float(), nullable=True))
    op.add_column("planes", sa.Column("max_usuarios", sa.Integer(), nullable=True))
    op.add_column("planes", sa.Column("max_skus", sa.Integer(), nullable=True))
    op.execute("UPDATE planes SET precio_mensual = precio")
    op.drop_index("ix_planes_codigo", table_name="planes")
    op.drop_constraint("uq_planes_codigo", "planes", type_="unique")
    op.drop_constraint("fk_planes_empresa", "planes", type_="foreignkey")
    for col in ("fecha_creacion", "limites", "empresa_id", "es_personalizado",
                "intervalo", "moneda", "precio", "codigo"):
        op.drop_column("planes", col)

    op.drop_index("ix_platform_admins_username", table_name="platform_admins")
    op.drop_index("ix_platform_admins_id", table_name="platform_admins")
    op.drop_table("platform_admins")
    op.execute("DROP TYPE IF EXISTS intervaloplan")
