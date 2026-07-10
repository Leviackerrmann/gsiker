from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect
from config import Config

db = SQLAlchemy()
csrf = CSRFProtect()

def run_migrations():
    from sqlalchemy import text
    with db.engine.connect() as conn:
        for sql in [
            "ALTER TABLE solicitud ADD COLUMN IF NOT EXISTS nota_admin TEXT",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass


def create_app(config_object=None):
    app = Flask(__name__)
    app.config.from_object(config_object or Config)

    db.init_app(app)
    csrf.init_app(app)

    from app import routes
    app.register_blueprint(routes.bp)

    with app.app_context():
        db.create_all()
        run_migrations()

        # Sincronizar nombres existentes de Solicitud a Identidad
        from app.models import Solicitud, Identidad, Empresa
        from sqlalchemy import func
        nombres_existentes = (
            db.session.query(Solicitud.nombre_solicitante)
            .filter(Solicitud.nombre_solicitante.isnot(None))
            .distinct()
            .all()
        )
        for (nombre,) in nombres_existentes:
            existente = Identidad.query.filter_by(nombre=nombre).first()
            if not existente:
                db.session.add(Identidad(nombre=nombre))

        # Seed empresas
        if Empresa.query.count() == 0:
            for nombre in ['UNI', 'FUSIONPLAST', 'GAMAPLASTIC', 'HERTEC', 'STPACK']:
                db.session.add(Empresa(nombre=nombre, activa=True))

        db.session.commit()

    return app
