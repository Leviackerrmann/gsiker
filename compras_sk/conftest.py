import hashlib
import pytest
from app import create_app, db as _db
from app.models import SKU, Solicitud, ItemSolicitud, Identidad, AdminUser
from werkzeug.security import generate_password_hash


TEST_DB_URL = "postgresql://comprasuser:Arjuna%2A2107%40%402025@localhost/comprasdb_test"


class TestingConfig:
    SECRET_KEY = 'test-secret-key'
    SQLALCHEMY_DATABASE_URI = TEST_DB_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SEND_FILE_MAX_AGE_DEFAULT = 0
    TESTING = True
    WTF_CSRF_ENABLED = False


SAMPLE_DEVICE_TOKEN = 'test-device-token-abc123'
SAMPLE_DEVICE_HASH = hashlib.sha256(SAMPLE_DEVICE_TOKEN.encode()).hexdigest()
SAMPLE_PIN = '1234'
SAMPLE_PIN_HASH = hashlib.sha256(SAMPLE_PIN.encode()).hexdigest()


@pytest.fixture(scope='function')
def app():
    app = create_app(TestingConfig)
    with app.app_context():
        _db.drop_all()
        _db.create_all()
        _seed_skus()
    yield app
    with app.app_context():
        _db.session.rollback()
        _db.drop_all()


def _seed_skus():
    if SKU.query.count() == 0:
        skus = [
            SKU(codigo_sku='MP-00001', descripcion='Harina de trigo', unidad_medida='Kg', categoria='MATERIA PRIMA'),
            SKU(codigo_sku='MP-00002', descripcion='Azúcar refinada', unidad_medida='Kg', categoria='MATERIA PRIMA'),
            SKU(codigo_sku='EMP-00001', descripcion='Caja de cartón 40x30', unidad_medida='Unidad', categoria='EMPAQUES'),
            SKU(codigo_sku='CG-00001', descripcion='Resma de papel bond A4', unidad_medida='Unidad', categoria='CONSUMIBLES GENERALES'),
        ]
        for s in skus:
            _db.session.add(s)
        _db.session.commit()


@pytest.fixture
def client(app):
    with app.app_context():
        pass
    return app.test_client()


@pytest.fixture
def sample_identidad(app):
    with app.app_context():
        identidad = Identidad(nombre='Juan Pérez', device_token_hash=SAMPLE_DEVICE_HASH, pin_hash=SAMPLE_PIN_HASH)
        _db.session.add(identidad)
        _db.session.commit()
        return identidad.id


@pytest.fixture
def sample_identidad_no_pin(app):
    with app.app_context():
        identidad = Identidad(nombre='María García', device_token_hash=hashlib.sha256('other-token'.encode()).hexdigest(), pin_hash=None)
        _db.session.add(identidad)
        _db.session.commit()
        return identidad.id


@pytest.fixture
def sample_identidad_no_token(app):
    with app.app_context():
        identidad = Identidad(nombre='Carlos López', device_token_hash=None, pin_hash=None)
        _db.session.add(identidad)
        _db.session.commit()
        return identidad.id


@pytest.fixture
def sample_solicitud(app, sample_identidad):
    with app.app_context():
        identidad = _db.session.get(Identidad, sample_identidad)
        solicitud = Solicitud(
            numero_solicitud='SC-00001',
            empresa='TestCorp',
            area='Producción',
            nombre_solicitante=identidad.nombre,
            cargo_solicitante='Ingeniero',
            jefe_nombre='Jefe Test',
            jefe_cargo='Gerente'
        )
        _db.session.add(solicitud)
        _db.session.flush()
        sku = SKU.query.first()
        item = ItemSolicitud(
            solicitud_id=solicitud.id,
            sku_id=sku.id,
            cantidad=10,
            observaciones='Test item',
            destino='Almacén'
        )
        _db.session.add(item)
        _db.session.commit()
        return solicitud.id


@pytest.fixture
def admin_user(app):
    with app.app_context():
        admin = AdminUser(username='testadmin', password_hash=generate_password_hash('testpass123'), rol='superadmin')
        _db.session.add(admin)
        _db.session.commit()
        return admin.id


def login_admin(client, username='testadmin', password='testpass123'):
    return client.post('/admin/login', data={'username': username, 'password': password}, follow_redirects=True)


def set_session_identidad(client, nombre):
    with client.session_transaction() as sess:
        sess['identidad'] = nombre
