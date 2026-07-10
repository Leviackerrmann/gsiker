import json
from app import db
from app.models import SKU, Solicitud, ItemSolicitud, Identidad, AdminUser


class TestXSS:
    def test_jinja_autoescapes_admin_nombre(self, client, app):
        with app.app_context():
            malicious = Identidad(
                nombre="Juan' onclick='alert(1)' class='",
                device_token_hash='xsstesthash1'
            )
            db.session.add(malicious)
            db.session.commit()
            admin = AdminUser.query.first()
            if not admin:
                from werkzeug.security import generate_password_hash
                admin = AdminUser(username='adminxss', password_hash=generate_password_hash('pass'), rol='superadmin')
                db.session.add(admin)
                db.session.commit()
                db.session.refresh(admin)
            admin_id = admin.id
        with client.session_transaction() as sess:
            sess['admin_user'] = {'id': admin_id, 'username': 'adminxss', 'rol': 'superadmin'}
        resp = client.get('/admin')
        html = resp.data.decode('utf-8')
        assert "Juan'" not in html or "Juan\\u0027" in html or "&#39;" in html

    def test_buscar_sku_returns_raw(self, client, app):
        with app.app_context():
            xss_sku = SKU(
                codigo_sku='<script>alert("XSS")</script>',
                descripcion='XSS test sku',
                categoria='PRUEBAS'
            )
            db.session.add(xss_sku)
            db.session.commit()
        resp = client.get('/buscar-sku?q=XSS')
        data = resp.get_json()
        assert any('<script>' in s['codigo'] for s in data['skus'])


class TestAdminAuth:
    def test_admin_sin_sesion_redirect(self, client):
        resp = client.get('/admin', follow_redirects=False)
        assert resp.status_code == 302

    def test_admin_logout_clears_session(self, client, admin_user):
        login_admin_raw(client, 'testadmin', 'testpass123')
        resp = client.get('/admin')
        assert resp.status_code == 200
        client.get('/admin/logout')
        resp = client.get('/admin', follow_redirects=False)
        assert resp.status_code == 302


class TestAuth:
    def test_dashboard_sin_identidad(self, client):
        resp = client.get('/dashboard')
        assert resp.status_code == 302


class TestInputValidation:
    def test_sku_id_0_rechazado(self, client):
        resp = client.post('/crear-solicitud', json={
            'empresa': 'ZeroTest',
            'items': [{'sku_id': 0, 'cantidad': 1}]
        })
        data = resp.get_json()
        assert resp.status_code == 400

    def test_crear_solicitud_cantidad_0(self, client, app):
        with app.app_context():
            sku_id = SKU.query.first().id
        resp = client.post('/crear-solicitud', json={
            'empresa': 'QtyZero',
            'items': [{'sku_id': sku_id, 'cantidad': 0}]
        })
        data = resp.get_json()
        assert data['success'] is True

    def test_crear_solicitud_sin_empresa(self, client, app):
        with app.app_context():
            sku_id = SKU.query.first().id
        resp = client.post('/crear-solicitud', json={
            'items': [{'sku_id': sku_id, 'cantidad': 1}]
        })
        data = resp.get_json()
        assert data['success'] is True

    def test_crear_sku_descripcion_larga(self, client):
        long_desc = 'A' * 500
        resp = client.post('/crear-sku', json={
            'descripcion': long_desc,
            'categoria': 'SERVICIOS'
        })
        data = resp.get_json()
        assert resp.status_code == 201
        assert data['success'] is True


def login_admin_raw(client, username, password):
    return client.post('/admin/login', data={
        'username': username,
        'password': password
    }, follow_redirects=True)
