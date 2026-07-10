import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'clave-super-secreta-cambiar'
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://comprasuser:Arjuna%2A2107%40%402025@localhost/comprasdb"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SEND_FILE_MAX_AGE_DEFAULT = 0
    WTF_CSRF_ENABLED = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = False
