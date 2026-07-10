import pytest
from app import db
from app.models import SKU, Solicitud, ItemSolicitud, Identidad, AdminUser
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash


class TestSKUModel:
    def test_crear_sku(self, app):
        with app.app_context():
            sku = SKU(codigo_sku='TEST-00001', descripcion='SKU de prueba', categoria='PRUEBAS', unidad_medida='Unidad')
            db.session.add(sku)
            db.session.commit()
            assert sku.id is not None
            assert sku.codigo_sku == 'TEST-00001'

    def test_unique_codigo_sku(self, app):
        with app.app_context():
            SKU.query.delete()
            db.session.commit()
            sku1 = SKU(codigo_sku='UNIQUE-001', descripcion='Primero', categoria='A')
            db.session.add(sku1)
            db.session.commit()
            sku2 = SKU(codigo_sku='UNIQUE-001', descripcion='Segundo', categoria='B')
            db.session.add(sku2)
            with pytest.raises(IntegrityError):
                db.session.commit()
            db.session.rollback()


class TestSolicitudModel:
    def test_crear_solicitud_con_items(self, app):
        with app.app_context():
            sku = SKU.query.first()
            solicitud = Solicitud(
                numero_solicitud='SC-TEST-001',
                empresa='TestCorp',
                area='Testing',
                nombre_solicitante='Test User'
            )
            db.session.add(solicitud)
            db.session.flush()
            item = ItemSolicitud(solicitud_id=solicitud.id, sku_id=sku.id, cantidad=5)
            db.session.add(item)
            db.session.commit()
            assert solicitud.id is not None
            assert len(solicitud.items) == 1
            assert solicitud.items[0].cantidad == 5

    def test_relacion_item_sku(self, app):
        with app.app_context():
            sku = SKU.query.first()
            solicitud = Solicitud(numero_solicitud='SC-TEST-002', empresa='Test')
            db.session.add(solicitud)
            db.session.flush()
            item = ItemSolicitud(solicitud_id=solicitud.id, sku_id=sku.id, cantidad=3)
            db.session.add(item)
            db.session.commit()
            assert item.sku.codigo_sku == sku.codigo_sku


class TestIdentidadModel:
    def test_crear_identidad(self, app):
        with app.app_context():
            identidad = Identidad(nombre='Ana López', device_token_hash='abc123hash')
            db.session.add(identidad)
            db.session.commit()
            assert identidad.id is not None

    def test_unique_nombre(self, app):
        with app.app_context():
            Identidad.query.delete()
            db.session.commit()
            i1 = Identidad(nombre='Pedro Díaz', device_token_hash='hash1')
            db.session.add(i1)
            db.session.commit()
            i2 = Identidad(nombre='Pedro Díaz', device_token_hash='hash2')
            db.session.add(i2)
            with pytest.raises(IntegrityError):
                db.session.commit()
            db.session.rollback()

    def test_unique_device_token_multiple_nulls(self, app):
        with app.app_context():
            Identidad.query.delete()
            db.session.commit()
            i1 = Identidad(nombre='User A', device_token_hash=None)
            db.session.add(i1)
            db.session.commit()
            i2 = Identidad(nombre='User B', device_token_hash=None)
            db.session.add(i2)
            db.session.commit()
            assert i2.id is not None


class TestAdminUserModel:
    def test_crear_admin_user(self, app):
        with app.app_context():
            admin = AdminUser(username='admin_test', password_hash=generate_password_hash('pass123'), rol='superadmin')
            db.session.add(admin)
            db.session.commit()
            assert admin.id is not None

    def test_check_password(self, app):
        with app.app_context():
            admin = AdminUser(username='pass_test', password_hash=generate_password_hash('securePass1'))
            db.session.add(admin)
            db.session.commit()
            assert admin.check_password('securePass1') is True
            assert admin.check_password('wrongPass') is False

    def test_unique_username(self, app):
        with app.app_context():
            AdminUser.query.delete()
            db.session.commit()
            a1 = AdminUser(username='unique_admin', password_hash='hash1')
            db.session.add(a1)
            db.session.commit()
            a2 = AdminUser(username='unique_admin', password_hash='hash2')
            db.session.add(a2)
            with pytest.raises(IntegrityError):
                db.session.commit()
            db.session.rollback()
