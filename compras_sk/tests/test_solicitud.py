import json
from app import db
from app.models import SKU, Solicitud, ItemSolicitud, Identidad


class TestCrearSolicitud:
    def test_crear_solicitud_exitosa(self, client, app):
        with app.app_context():
            sku = SKU.query.first()
            sku_id = sku.id
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'TestCorp',
            'area': 'Testing',
            'cargo': 'Tester',
            'jefe_nombre': 'Jefe',
            'jefe_cargo': 'Gerente',
            'items': [{
                'sku_id': sku_id,
                'cantidad': 5,
                'observaciones': 'Test item',
                'destino': 'Almacén',
                'unidad': 'Unidad'
            }]
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['success'] is True
        assert 'solicitud_id' in data

    def test_crear_solicitud_sin_items(self, client):
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'TestCorp',
            'area': 'Testing',
            'items': []
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['success'] is True

    def test_crear_solicitud_sku_null(self, client):
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'TestCorp',
            'items': [{'sku_id': None, 'cantidad': 1}]
        })
        data = resp.get_json()
        assert resp.status_code == 400
        assert data['success'] is False

    def test_crear_solicitud_sku_0(self, client, app):
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'TestCorp',
            'items': [{'sku_id': 0, 'cantidad': 1}]
        })
        data = resp.get_json()
        assert resp.status_code == 400
        assert data['success'] is False

    def test_crear_solicitud_genera_numero(self, client, app):
        with app.app_context():
            sku = SKU.query.first()
            sku_id = sku.id
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'NumTest',
            'items': [{'sku_id': sku_id, 'cantidad': 1}]
        })
        data = resp.get_json()
        assert data['success'] is True
        with app.app_context():
            solicitud = db.session.get(Solicitud, data['solicitud_id'])
            assert solicitud.numero_solicitud.startswith('SC-')

    def test_crear_solicitud_item_con_fecha(self, client, app):
        with app.app_context():
            sku_id = SKU.query.first().id
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'DateTest',
            'items': [{
                'sku_id': sku_id,
                'cantidad': 2,
                'fecha_entrega': '2026-12-31'
            }]
        })
        data = resp.get_json()
        assert data['success'] is True

    def test_crear_solicitud_item_fecha_invalida(self, client, app):
        with app.app_context():
            sku_id = SKU.query.first().id
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'BadDateTest',
            'items': [{
                'sku_id': sku_id,
                'cantidad': 2,
                'fecha_entrega': 'not-a-date'
            }]
        })
        data = resp.get_json()
        assert data['success'] is True

    def test_crear_solicitud_cantidad_minima_1(self, client, app):
        with app.app_context():
            sku_id = SKU.query.first().id
        set_session_identidad(client, 'Test User')
        resp = client.post('/crear-solicitud', json={
            'empresa': 'MinQty',
            'items': [{'sku_id': sku_id, 'cantidad': 0}]
        })
        data = resp.get_json()
        assert data['success'] is True
        with app.app_context():
            solicitud = Solicitud.query.order_by(Solicitud.id.desc()).first()
            assert solicitud.items[0].cantidad == 1


class TestActualizarSolicitud:
    def test_actualizar_exitosa(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            old_sku_id = solicitud.items[0].sku_id
            new_sku = SKU.query.filter(SKU.id != old_sku_id).first()
            new_sku_id = new_sku.id
        resp = client.post(f'/actualizar-solicitud/{sample_solicitud}', json={
            'empresa': 'UpdatedCorp',
            'items': [{'sku_id': new_sku_id, 'cantidad': 99}]
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['success'] is True

    def test_actualizar_reemplaza_items(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        with app.app_context():
            sku_id = SKU.query.first().id
        resp = client.post(f'/actualizar-solicitud/{sample_solicitud}', json={
            'items': [{'sku_id': sku_id, 'cantidad': 7}]
        })
        data = resp.get_json()
        assert data['success'] is True
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            assert len(solicitud.items) == 1

    def test_actualizar_con_items_vacios(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.post(f'/actualizar-solicitud/{sample_solicitud}', json={
            'items': []
        })
        data = resp.get_json()
        assert data['success'] is True
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            assert len(solicitud.items) == 0

    def test_actualizar_sku_null_error(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.post(f'/actualizar-solicitud/{sample_solicitud}', json={
            'items': [{'sku_id': None, 'cantidad': 1}]
        })
        data = resp.get_json()
        assert resp.status_code == 400
        assert data['success'] is False

    def test_actualizar_solicitud_inexistente(self, client):
        set_session_identidad(client, 'Test User')
        resp = client.post('/actualizar-solicitud/99999', json={'items': []})
        assert resp.status_code == 404

    def test_actualizar_guarda_campos(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        with app.app_context():
            sku_id = SKU.query.first().id
        resp = client.post(f'/actualizar-solicitud/{sample_solicitud}', json={
            'empresa': 'NewEmpresa',
            'area': 'NewArea',
            'cargo': 'NewCargo',
            'jefe_nombre': 'NewJefe',
            'jefe_cargo': 'NewJefeCargo',
            'items': [{'sku_id': sku_id, 'cantidad': 1}]
        })
        data = resp.get_json()
        assert data['success'] is True
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            assert solicitud.empresa == 'NewEmpresa'
            assert solicitud.area == 'NewArea'


class TestSolicitudDetalle:
    def test_solicitud_json(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get(f'/solicitud/{sample_solicitud}/json')
        data = resp.get_json()
        assert data['success'] is True
        assert data['solicitud']['empresa'] == 'TestCorp'
        assert len(data['solicitud']['items']) == 1

    def test_solicitud_json_inexistente(self, client):
        resp = client.get('/solicitud/99999/json')
        assert resp.status_code == 404

    def test_solicitud_detalle(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get(f'/solicitud/{sample_solicitud}')
        assert resp.status_code == 200
        assert b'TestCorp' in resp.data

    def test_solicitud_detalle_inexistente(self, client):
        resp = client.get('/solicitud/99999')
        assert resp.status_code == 404


class TestIndex:
    def test_index_sin_identidad(self, client):
        resp = client.get('/')
        assert resp.status_code == 200

    def test_index_con_identidad(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get('/')
        assert resp.status_code == 200
        assert b'solicitud' in resp.data.lower()

    def test_index_edit_mode(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get(f'/?editar={sample_solicitud}')
        assert resp.status_code == 200

    def test_index_edit_mode_invalido(self, client):
        resp = client.get('/?editar=99999')
        assert resp.status_code == 200


class TestPDF:
    def test_generar_pdf(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get(f'/generar-pdf/{sample_solicitud}')
        assert resp.status_code == 200
        assert resp.data[:4] == b'%PDF'

    def test_generar_pdf_sin_items(self, client, app, sample_identidad):
        set_session_identidad(client, 'Juan Pérez')
        with app.app_context():
            solicitud = Solicitud(numero_solicitud='SC-EMPTY', empresa='EmptyTest', nombre_solicitante='Juan Pérez')
            db.session.add(solicitud)
            db.session.commit()
            sid = solicitud.id
        resp = client.get(f'/generar-pdf/{sid}')
        assert resp.status_code == 200

    def test_generar_pdf_inexistente(self, client):
        resp = client.get('/generar-pdf/99999')
        assert resp.status_code == 404

    def test_generar_pdf_content_type(self, client, app, sample_solicitud):
        set_session_identidad(client, 'Juan Pérez')
        resp = client.get(f'/generar-pdf/{sample_solicitud}')
        assert resp.status_code == 200
        assert resp.data[:4] == b'%PDF'


def set_session_identidad(client, nombre):
    with client.session_transaction() as sess:
        sess['identidad'] = nombre
