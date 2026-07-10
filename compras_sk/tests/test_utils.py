import os
from app import db
from app.utils import generar_pdf_solicitud
from app.models import Solicitud, Identidad


class TestPDFGeneration:
    def test_generar_pdf_solicitud_existe(self, app, sample_solicitud):
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            pdf_path = generar_pdf_solicitud(solicitud)
            assert pdf_path is not None
            assert os.path.exists(pdf_path)
            assert pdf_path.startswith('/tmp/')

    def test_generar_pdf_sin_items(self, app, sample_identidad):
        with app.app_context():
            identidad = db.session.get(Identidad, sample_identidad)
            solicitud = Solicitud(
                numero_solicitud='SC-PDF-EMPTY',
                empresa='EmptyPDF',
                area='Testing',
                nombre_solicitante=identidad.nombre
            )
            db.session.add(solicitud)
            db.session.commit()
            pdf_path = generar_pdf_solicitud(solicitud)
            assert pdf_path is not None
            assert os.path.exists(pdf_path)

    def test_generar_pdf_contenido_pdf(self, app, sample_solicitud):
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            pdf_path = generar_pdf_solicitud(solicitud)
            with open(pdf_path, 'rb') as f:
                header = f.read(4)
            assert header == b'%PDF'

    def test_pdf_en_tmp(self, app, sample_solicitud):
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            pdf_path = generar_pdf_solicitud(solicitud)
            assert pdf_path.startswith('/tmp/')

    def test_pdf_multiple_sin_error(self, app, sample_solicitud):
        with app.app_context():
            solicitud = db.session.get(Solicitud, sample_solicitud)
            path1 = generar_pdf_solicitud(solicitud)
            path2 = generar_pdf_solicitud(solicitud)
            assert os.path.exists(path1)
            assert os.path.exists(path2)
