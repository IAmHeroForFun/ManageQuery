from .base import *

DEBUG = False
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS', default=['*'])

DATABASES = {
    'default': env.db(
        'DATABASE_URL',
        default='postgres://mfdfs_user:mfdfs_password@db:5432/mfdfs_db'
    )
}

CELERY_TASK_ALWAYS_EAGER = False

# Reverse proxy / SSL Support (behind Nginx)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# CSRF Trusted Origins (Configurable via env, defaults to omvihub domains)
CSRF_TRUSTED_ORIGINS = env.list(
    'CSRF_TRUSTED_ORIGINS',
    default=[
        'https://*.omvihub.in',
        'http://*.omvihub.in',
        'https://omvihub.in',
        'http://localhost',
        'http://127.0.0.1:8001',
    ]
)

# Security Headers
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = env.bool('SESSION_COOKIE_SECURE', default=True)
CSRF_COOKIE_SECURE = env.bool('CSRF_COOKIE_SECURE', default=True)
