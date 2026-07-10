import json
import hashlib
from app import db
from app.models import Identidad, AdminUser, Empresa, Solicitud, ItemSolicitud, SKU
from werkzeug.security import generate_password_hash


class TestAdminLogin:
    def test_login_exitoso(self, client, admin_user):
        resp = client.post('/admin/login', data={
            'username': 'testadmin',
            'password': 'testpass123'
        }, follow_redirects=True)
        assert resp.status_code == 200
        assert b'admin' in resp.data.lower() or b'usuarios' in resp.data.lower()

    def test_login_fallido(self, client, admin_user):
        resp = client.post('/admin/login', data={
            'username': 'testadmin',
            'password': 'wrongpassword'
        })
        assert resp.status_code == 200
        assert b'incorrectos' in resp.data.lower() or b'error' in resp.data.lower()

    def test_login_crea_admin_default(self, client):
        resp = client.post('/admin/login', data={
            'username': 'admin',
            'password': 'admin2026'
        }, follow_redirects=True)
        assert resp.status_code == 200
        with client.application.app_context():
            admin = AdminUser.query.filter_by(username='admin').first()
            assert admin is not None

    def test_login_logout_flow(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin/logout', follow_redirects=True)
        assert resp.status_code == 200


class TestAdminPanel:
    def test_admin_panel_autenticado(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin')
        assert resp.status_code == 200

    def test_admin_panel_sin_auth_redirect(self, client):
        resp = client.get('/admin', follow_redirects=False)
        assert resp.status_code == 302

    def test_admin_panel_muestra_usuarios(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin')
        assert resp.status_code == 200
        assert b'Juan P' in resp.data or b'Juan' in resp.data or b'Perez' in resp.data


class TestAdminCRUD:
    def test_admin_desvincular(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post(f'/admin/desvincular/{sample_identidad}')
        data = resp.get_json()
        assert data['success'] is True
        assert data['nombre'] == 'Juan Pérez'
        with client.application.app_context():
            identidad = db.session.get(Identidad, sample_identidad)
            assert identidad.device_token_hash is None

    def test_admin_eliminar(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post(f'/admin/eliminar/{sample_identidad}')
        data = resp.get_json()
        assert data['success'] is True
        with client.application.app_context():
            identidad = db.session.get(Identidad, sample_identidad)
            assert identidad is None

    def test_admin_definir_pin(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post(f'/admin/definir-pin/{sample_identidad}', json={
            'pin_code': '4321'
        })
        data = resp.get_json()
        assert data['success'] is True
        assert data['tiene_pin'] is True

    def test_admin_definir_pin_invalido(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post(f'/admin/definir-pin/{sample_identidad}', json={
            'pin_code': '12'
        })
        assert resp.status_code == 400

    def test_admin_definir_pin_letras(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post(f'/admin/definir-pin/{sample_identidad}', json={
            'pin_code': 'abcd'
        })
        assert resp.status_code == 400


class TestAdminUserManagement:
    def test_crear_admin(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/crear-admin', json={
            'username': 'newadmin',
            'password': 'newpass123',
            'rol': 'admin'
        })
        data = resp.get_json()
        assert resp.status_code == 201
        assert data['success'] is True

    def test_crear_admin_duplicado(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        client.post('/admin/crear-admin', json={
            'username': 'dupadmin',
            'password': 'pass123456',
            'rol': 'admin'
        })
        resp = client.post('/admin/crear-admin', json={
            'username': 'dupadmin',
            'password': 'otherpass',
            'rol': 'admin'
        })
        assert resp.status_code == 409

    def test_crear_admin_sin_permisos(self, client, admin_user):
        with client.application.app_context():
            viewer = AdminUser(username='viewer1', password_hash=generate_password_hash('pass123'), rol='viewer')
            db.session.add(viewer)
            db.session.commit()
        login_admin_raw(client, 'viewer1', 'pass123')
        resp = client.post('/admin/crear-admin', json={
            'username': 'shouldfail',
            'password': 'pass123456',
            'rol': 'admin'
        })
        assert resp.status_code == 403

    def test_eliminar_admin(self, client, admin_user):
        with client.application.app_context():
            extra = AdminUser(username='extraadmin', password_hash=generate_password_hash('pass123'), rol='admin')
            db.session.add(extra)
            db.session.commit()
            eid = extra.id
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post(f'/admin/eliminar-admin/{eid}')
        data = resp.get_json()
        assert data['success'] is True

    def test_no_eliminar_admin_principal(self, client, admin_user, app):
        login_admin_raw(client, 'testadmin', 'testpass123')
        with app.app_context():
            main = AdminUser.query.filter_by(username='admin').first()
            if not main:
                main = AdminUser(username='admin', password_hash=generate_password_hash('admin2026'), rol='superadmin')
                db.session.add(main)
                db.session.commit()
            main_id = main.id
        resp = client.post(f'/admin/eliminar-admin/{main_id}')
        assert resp.status_code == 400

    def test_eliminar_admin_sin_permisos(self, client, admin_user):
        with client.application.app_context():
            viewer = AdminUser(username='viewer2', password_hash=generate_password_hash('pass123'), rol='viewer')
            db.session.add(viewer)
            db.session.commit()
        login_admin_raw(client, 'viewer2', 'pass123')
        resp = client.post('/admin/eliminar-admin/1')
        assert resp.status_code == 403


class TestCambiarClave:
    def test_cambiar_clave_exitoso(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/cambiar-clave', json={
            'current_password': 'testpass123',
            'new_password': 'nuevapass123'
        })
        data = resp.get_json()
        assert data['success'] is True
        with client.application.app_context():
            admin = AdminUser.query.filter_by(username='testadmin').first()
            assert admin.check_password('nuevapass123')

    def test_cambiar_clave_actual_incorrecta(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/cambiar-clave', json={
            'current_password': 'wrongpass',
            'new_password': 'nuevapass123'
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'incorrecta' in data['message']

    def test_cambiar_clave_corta(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/cambiar-clave', json={
            'current_password': 'testpass123',
            'new_password': '12345'
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert '6 caracteres' in data['message']

    def test_cambiar_clave_igual_actual(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/cambiar-clave', json={
            'current_password': 'testpass123',
            'new_password': 'testpass123'
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'diferente' in data['message']

    def test_cambiar_clave_sin_auth(self, client):
        resp = client.post('/admin/cambiar-clave', json={
            'current_password': 'x',
            'new_password': 'y'
        }, follow_redirects=False)
        assert resp.status_code == 302


class TestBulkDelete:
    def test_bulk_eliminar_varios(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        with client.application.app_context():
            i2 = Identidad(nombre='Usuario 2', device_token_hash=None)
            i3 = Identidad(nombre='Usuario 3', device_token_hash=None)
            db.session.add(i2)
            db.session.add(i3)
            db.session.commit()
            id2, id3 = i2.id, i3.id
        resp = client.post('/admin/eliminar-multiples', json={
            'ids': [id2, id3]
        })
        data = resp.get_json()
        assert data['success'] is True
        assert data['count'] == 2

    def test_bulk_eliminar_vacio(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/eliminar-multiples', json={'ids': []})
        assert resp.status_code == 400

    def test_bulk_eliminar_sin_ids(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/eliminar-multiples', json={})
        assert resp.status_code == 400

    def test_bulk_eliminar_con_inexistente(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/eliminar-multiples', json={'ids': [99999]})
        data = resp.get_json()
        assert data['success'] is True
        assert data['count'] == 0


class TestAdminStats:
    def test_stats_cards_displayed(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin')
        assert resp.status_code == 200
        assert b'Solicitudes totales' in resp.data
        assert b'Usuarios registrados' in resp.data
        assert b'SKU en cat' in resp.data or b'SKU' in resp.data
        assert b'Solicitudes este mes' in resp.data

    def test_solicitudes_column(self, client, admin_user, sample_identidad):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin')
        assert resp.status_code == 200
        assert b'Solicitudes' in resp.data


class TestAdminSolicitudes:
    def test_solicitudes_list(self, client, admin_user, sample_identidad, sample_solicitud):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin/solicitudes')
        assert resp.status_code == 200
        assert b'SC-00001' in resp.data or b'solicitudes' in resp.data.lower()

    def test_solicitudes_filtro_solicitante(self, client, admin_user, sample_identidad, sample_solicitud):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin/solicitudes?solicitante=Juan+P%C3%A9rez')
        assert resp.status_code == 200

    def test_solicitudes_exportar_csv(self, client, admin_user, sample_identidad, sample_solicitud):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin/solicitudes/exportar')
        assert resp.status_code == 200
        assert resp.content_type.startswith('text/csv')
        assert b'N' in resp.data and b'Solicitud' in resp.data

    def test_solicitudes_exportar_filtrado(self, client, admin_user, sample_identidad, sample_solicitud):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin/solicitudes/exportar?solicitante=Juan+P%C3%A9rez')
        assert resp.status_code == 200
        assert resp.content_type.startswith('text/csv')

    def test_nota_admin(self, client, admin_user, sample_solicitud):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post(f'/admin/solicitud/{sample_solicitud}/nota', json={
            'nota': 'Nota de prueba para el admin'
        })
        data = resp.get_json()
        assert data['success'] is True
        with client.application.app_context():
            s = db.session.get(Solicitud, sample_solicitud)
            assert s.nota_admin == 'Nota de prueba para el admin'


class TestAdminEmpresa:
    def test_empresa_crear(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.post('/admin/empresa/crear', json={
            'nombre': 'NUEVA EMPRESA TEST'
        })
        data = resp.get_json()
        assert resp.status_code == 201
        assert data['success'] is True
        with client.application.app_context():
            e = Empresa.query.filter_by(nombre='NUEVA EMPRESA TEST').first()
            assert e is not None
            assert e.activa is True

    def test_empresa_duplicada(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        client.post('/admin/empresa/crear', json={'nombre': 'DUPLICADA'})
        resp = client.post('/admin/empresa/crear', json={'nombre': 'DUPLICADA'})
        assert resp.status_code == 409

    def test_empresa_toggle(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        with client.application.app_context():
            e = Empresa(nombre='TOGGLE TEST', activa=True)
            db.session.add(e)
            db.session.commit()
            eid = e.id
        resp = client.post(f'/admin/empresa/{eid}/toggle')
        data = resp.get_json()
        assert data['success'] is True
        assert data['activa'] is False

    def test_empresa_eliminar(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        with client.application.app_context():
            e = Empresa(nombre='ELIMINAR TEST', activa=True)
            db.session.add(e)
            db.session.commit()
            eid = e.id
        resp = client.post(f'/admin/empresa/{eid}/eliminar')
        data = resp.get_json()
        assert data['success'] is True


class TestAdminDashboardGlobal:
    def test_dashboard_global(self, client, admin_user, sample_solicitud):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin/dashboard')
        assert resp.status_code == 200
        assert b'Dashboard Global' in resp.data
        assert b'Solicitudes por mes' in resp.data or b'solicitudes' in resp.data.lower()

    def test_dashboard_global_sin_auth(self, client):
        resp = client.get('/admin/dashboard', follow_redirects=False)
        assert resp.status_code == 302


def login_admin_raw(client, username, password):
    return client.post('/admin/login', data={
        'username': username,
        'password': password
    }, follow_redirects=True)
