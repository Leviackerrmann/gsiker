import json
from app import db
from app.models import SKU, Solicitud, Identidad


def set_session_identidad(client, nombre):
    with client.session_transaction() as sess:
        sess['identidad'] = nombre


class TestCatalogoSKU:
    def test_catalogo_sku(self, client):
        resp = client.get('/catalogo-sku')
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert 'registrados' in html
        assert 'Harina' in html

    def test_catalogo_con_query(self, client):
        resp = client.get('/catalogo-sku?q=Harina')
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert 'Harina' in html

    def test_catalogo_con_categoria(self, client):
        resp = client.get('/catalogo-sku?categoria=MATERIA PRIMA')
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert 'Harina' in html
        assert 'CG' not in html or 'Caja' not in html

    def test_catalogo_paginacion(self, client):
        resp = client.get('/catalogo-sku?page=1')
        assert resp.status_code == 200

    def test_catalogo_orden(self, client):
        resp = client.get('/catalogo-sku?sort_by=descripcion&sort_order=asc')
        assert resp.status_code == 200


class TestBuscarSKU:
    def test_buscar_por_codigo(self, client):
        resp = client.get('/buscar-sku?q=MP-00001')
        data = resp.get_json()
        assert len(data['skus']) >= 1
        codigos = [s['codigo'] for s in data['skus']]
        assert 'MP-00001' in codigos

    def test_buscar_por_descripcion(self, client):
        resp = client.get('/buscar-sku?q=Harina')
        data = resp.get_json()
        assert len(data['skus']) >= 1
        assert 'Harina' in data['skus'][0]['descripcion']

    def test_buscar_sin_resultados(self, client):
        resp = client.get('/buscar-sku?q=ZZZZNONEXISTENT')
        data = resp.get_json()
        assert len(data['skus']) == 0

    def test_buscar_query_vacia(self, client):
        resp = client.get('/buscar-sku?q=')
        data = resp.get_json()
        assert len(data['skus']) == 0


class TestCrearSKU:
    def test_crear_sku_exitoso(self, client):
        resp = client.post('/crear-sku', json={
            'descripcion': 'Nuevo SKU de prueba',
            'categoria': 'HERRAMIENTAS',
            'subcategoria': 'Manuales',
            'unidad': 'Unidad',
            'precio': 100.50
        })
        data = resp.get_json()
        assert resp.status_code == 201
        assert data['success'] is True
        assert data['codigo_sku'].startswith('HER-')

    def test_crear_sku_sin_descripcion(self, client):
        resp = client.post('/crear-sku', json={
            'descripcion': '',
            'categoria': 'PRUEBAS'
        })
        data = resp.get_json()
        assert resp.status_code == 400
        assert data['success'] is False

    def test_crear_sku_sin_categoria(self, client):
        resp = client.post('/crear-sku', json={
            'descripcion': 'SKU sin categoría',
            'categoria': ''
        })
        data = resp.get_json()
        assert resp.status_code == 400
        assert data['success'] is False

    def test_crear_sku_precio_invalido(self, client):
        resp = client.post('/crear-sku', json={
            'descripcion': 'SKU con precio inválido',
            'categoria': 'SERVICIOS',
            'precio': 'no-un-numero'
        })
        data = resp.get_json()
        assert resp.status_code == 201
        assert data['success'] is True


class TestMisSolicitudes:
    def test_mis_solicitudes_sin_filtros(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/mis-solicitudes')
        assert resp.status_code == 200
        assert b'SC-00001' in resp.data

    def test_mis_solicitudes_con_query(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/mis-solicitudes?q=TestCorp')
        assert resp.status_code == 200
        assert b'SC-00001' in resp.data

    def test_mis_solicitudes_sin_resultados(self, client):
        set_session_identidad(client, 'Nobody')
        resp = client.get('/mis-solicitudes')
        assert resp.status_code == 200

    def test_mis_solicitudes_con_fechas(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/mis-solicitudes?desde=2026-01-01&hasta=2026-12-31')
        assert resp.status_code == 200

    def test_mis_solicitudes_fechas_invalidas(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/mis-solicitudes?desde=not-a-date&hasta=also-bad')
        assert resp.status_code == 200

    def test_mis_solicitudes_orden(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/mis-solicitudes?sort_by=empresa&sort_order=asc')
        assert resp.status_code == 200

    def test_mis_solicitudes_sin_identidad(self, client):
        resp = client.get('/mis-solicitudes')
        assert resp.status_code == 200
