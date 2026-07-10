import hashlib
from app import db
from app.models import Identidad, Solicitud


SAMPLE_TOKEN = 'test-device-token-abc123'
SAMPLE_HASH = hashlib.sha256(SAMPLE_TOKEN.encode()).hexdigest()
SAMPLE_PIN = '1234'


class TestSetIdentidad:
    def test_set_identidad_owner_no_pin(self, client, sample_identidad):
        with client.session_transaction() as sess:
            sess['device_token'] = SAMPLE_TOKEN
        resp = client.post('/set-identidad', json={
            'nombre': 'Juan Pérez',
            'device_token': SAMPLE_TOKEN
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['success'] is True
        assert data['nombre'] == 'Juan Pérez'

    def test_set_identidad_needs_pin(self, client, sample_identidad):
        with client.session_transaction() as sess:
            sess['device_token'] = 'different-token'
        resp = client.post('/set-identidad', json={
            'nombre': 'Juan Pérez',
            'device_token': 'different-token'
        })
        data = resp.get_json()
        assert resp.status_code == 403
        assert data['needs_pin'] is True

    def test_set_identidad_with_valid_pin(self, client, sample_identidad):
        with client.session_transaction() as sess:
            sess['device_token'] = 'different-token'
        resp = client.post('/set-identidad', json={
            'nombre': 'Juan Pérez',
            'device_token': 'different-token',
            'pin_code': SAMPLE_PIN
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['success'] is True

    def test_set_identidad_wrong_pin(self, client, sample_identidad):
        with client.session_transaction() as sess:
            sess['device_token'] = 'different-token'
        resp = client.post('/set-identidad', json={
            'nombre': 'Juan Pérez',
            'device_token': 'different-token',
            'pin_code': '9999'
        })
        data = resp.get_json()
        assert resp.status_code == 403
        assert data.get('needs_pin') is True

    def test_set_identidad_no_pin_admin_needed(self, client, app, sample_identidad_no_pin):
        with client.session_transaction() as sess:
            sess['device_token'] = 'attacker-token'
        resp = client.post('/set-identidad', json={
            'nombre': 'María García',
            'device_token': 'attacker-token'
        })
        data = resp.get_json()
        assert resp.status_code == 403
        msg = data['message'].lower()
        assert 'no tiene código pin' in msg or 'no tiene pin' in msg

    def test_set_identidad_nonexistent(self, client):
        resp = client.post('/set-identidad', json={
            'nombre': 'Nobody Knows',
            'device_token': SAMPLE_TOKEN
        })
        assert resp.status_code == 404

    def test_set_identidad_no_name(self, client):
        resp = client.post('/set-identidad', json={
            'nombre': '',
            'device_token': SAMPLE_TOKEN
        })
        assert resp.status_code == 400

    def test_set_identidad_free_user_blocked_by_owner(self, client, sample_identidad):
        with client.session_transaction() as sess:
            sess['device_token'] = 'free-user-token'
        resp = client.post('/set-identidad', json={
            'nombre': 'Juan Pérez',
            'device_token': 'free-user-token'
        })
        data = resp.get_json()
        assert resp.status_code == 403
        msg = data['message'].lower()
        assert 'vinculado' in msg or 'pertenece' in msg


class TestRegistrarUsuario:
    def test_registrar_exitoso(self, client):
        with client.session_transaction() as sess:
            sess['device_token'] = 'new-device-token-xyz'
        resp = client.post('/registrar-usuario', json={
            'nombre': 'Nuevo Usuario',
            'device_token': 'new-device-token-xyz',
            'pin_code': '5678'
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['success'] is True

    def test_registrar_nombre_sin_mayuscula(self, client):
        with client.session_transaction() as sess:
            sess['device_token'] = 'token-1'
        resp = client.post('/registrar-usuario', json={
            'nombre': 'juan perez',
            'device_token': 'token-1',
            'pin_code': '1234'
        })
        data = resp.get_json()
        assert resp.status_code == 400
        assert 'mayúscula' in data['message'].lower()

    def test_registrar_pin_corto(self, client):
        with client.session_transaction() as sess:
            sess['device_token'] = 'token-2'
        resp = client.post('/registrar-usuario', json={
            'nombre': 'Ana García',
            'device_token': 'token-2',
            'pin_code': '123'
        })
        data = resp.get_json()
        assert resp.status_code == 400
        assert '4 dígitos' in data['message'].lower()

    def test_registrar_pin_letras(self, client):
        with client.session_transaction() as sess:
            sess['device_token'] = 'token-3'
        resp = client.post('/registrar-usuario', json={
            'nombre': 'Luis Martínez',
            'device_token': 'token-3',
            'pin_code': 'abcd'
        })
        data = resp.get_json()
        assert resp.status_code == 400

    def test_registrar_sin_apellido(self, client):
        with client.session_transaction() as sess:
            sess['device_token'] = 'token-4'
        resp = client.post('/registrar-usuario', json={
            'nombre': 'SoloNombre',
            'device_token': 'token-4',
            'pin_code': '1234'
        })
        data = resp.get_json()
        assert resp.status_code == 400

    def test_registrar_token_ya_vinculado(self, client, sample_identidad):
        with client.session_transaction() as sess:
            sess['device_token'] = SAMPLE_TOKEN
        resp = client.post('/registrar-usuario', json={
            'nombre': 'Otra Persona',
            'device_token': SAMPLE_TOKEN,
            'pin_code': '4321'
        })
        data = resp.get_json()
        assert resp.status_code == 409
        assert 'vinculado' in data['message'].lower()

    def test_registrar_sin_token(self, client):
        resp = client.post('/registrar-usuario', json={
            'nombre': 'Sin Token',
            'device_token': '',
            'pin_code': '1234'
        })
        assert resp.status_code == 400


class TestVerificarIdentidad:
    def test_identidad_valida(self, client, sample_identidad):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/verificar-identidad')
        data = resp.get_json()
        assert data['valida'] is True

    def test_identidad_invalida_sin_sesion(self, client):
        resp = client.get('/verificar-identidad')
        data = resp.get_json()
        assert data['valida'] is False

    def test_identidad_invalida_nombre_inexistente(self, client):
        set_session_identidad(client, 'Ghost User')
        resp = client.get('/verificar-identidad')
        data = resp.get_json()
        assert data['valida'] is False


class TestBuscarUsuarios:
    def test_buscar_por_nombre(self, client, sample_identidad):
        resp = client.get('/buscar-usuarios?q=Juan')
        data = resp.get_json()
        names = [u['nombre'] for u in data['usuarios']]
        assert 'Juan Pérez' in names

    def test_buscar_sin_resultados(self, client):
        resp = client.get('/buscar-usuarios?q=ZZZZNOMATCH')
        data = resp.get_json()
        assert len(data['usuarios']) == 0

    def test_buscar_query_vacia(self, client):
        resp = client.get('/buscar-usuarios?q=')
        data = resp.get_json()
        assert len(data['usuarios']) == 0

    def test_buscar_muestra_vinculado(self, client, sample_identidad):
        resp = client.get('/buscar-usuarios?q=Juan')
        data = resp.get_json()
        juan = [u for u in data['usuarios'] if u['nombre'] == 'Juan Pérez'][0]
        assert juan['vinculado'] is True


class TestSidebarCount:
    def test_sidebar_count_with_identidad(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/sidebar-count')
        data = resp.get_json()
        assert data['count'] >= 1

    def test_sidebar_count_sin_identidad(self, client):
        resp = client.get('/sidebar-count')
        data = resp.get_json()
        assert data['count'] == 0


def set_session_identidad(client, nombre):
    with client.session_transaction() as sess:
        sess['identidad'] = nombre
