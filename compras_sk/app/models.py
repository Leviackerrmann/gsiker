from datetime import datetime, timezone
from flask_login import UserMixin
from app import db


class Usuario(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200))
    solicitudes = db.relationship('Solicitud', backref='solicitante', lazy=True)


class AdminUser(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    rol = db.Column(db.String(20), default='admin')

    def check_password(self, password):
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, password)


class SKU(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    codigo_sku = db.Column(db.String(50), unique=True, nullable=False)
    descripcion = db.Column(db.String(500), nullable=False)
    unidad_medida = db.Column(db.String(20))
    precio_referencia = db.Column(db.Float)
    categoria = db.Column(db.String(100))
    subcategoria = db.Column(db.String(100))
    fecha_creacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    creado_por = db.Column(db.Integer, db.ForeignKey('usuario.id'))


class Solicitud(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    numero_solicitud = db.Column(db.String(50), unique=True)
    fecha = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'))
    empresa = db.Column(db.String(200))
    area = db.Column(db.String(100))
    cargo_solicitante = db.Column(db.String(100))
    nombre_solicitante = db.Column(db.String(100))
    jefe_nombre = db.Column(db.String(100))
    jefe_cargo = db.Column(db.String(100))
    nota_admin = db.Column(db.Text, nullable=True)
    items = db.relationship('ItemSolicitud', backref='solicitud', lazy=True)


class ItemSolicitud(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    solicitud_id = db.Column(db.Integer, db.ForeignKey('solicitud.id'))
    sku_id = db.Column(db.Integer, db.ForeignKey('sku.id'))
    cantidad = db.Column(db.Integer, nullable=False)
    observaciones = db.Column(db.String(500))
    destino = db.Column(db.String(100))
    fecha_entrega = db.Column(db.Date)
    unidad_override = db.Column(db.String(100))
    sku = db.relationship('SKU')


class Identidad(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)
    device_token_hash = db.Column(db.String(64), nullable=True, unique=True)
    pin_hash = db.Column(db.String(64), nullable=True)
    fecha_creacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class Empresa(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(200), unique=True, nullable=False)
    activa = db.Column(db.Boolean, default=True)


class AuditoriaSolicitud(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    solicitud_id = db.Column(db.Integer, db.ForeignKey('solicitud.id'), nullable=False)
    accion = db.Column(db.String(50), nullable=False)
    descripcion = db.Column(db.String(500))
    admin_user_id = db.Column(db.Integer, db.ForeignKey('admin_user.id'), nullable=True)
    admin_nombre = db.Column(db.String(100), nullable=True)
    identidad_nombre = db.Column(db.String(100), nullable=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
