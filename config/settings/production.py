from .base import *

DEBUG = False

# Resilient host parsing: supports custom hosts from env, while always allowing omvihub subdomains, localhost, and proxy forwards
_raw_hosts = env.list('DJANGO_ALLOWED_HOSTS', default=['*'])
ALLOWED_HOSTS = list(set([
    '*',
    '.omvihub.in',
    'omvihub.in',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
] + [h.strip() for h in _raw_hosts if h.strip()]))

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
_raw_origins = env.list('CSRF_TRUSTED_ORIGINS', default=[])
CSRF_TRUSTED_ORIGINS = list(set([
    'https://*.omvihub.in',
    'http://*.omvihub.in',
    'https://omvihub.in',
    'http://omvihub.in',
    'http://localhost',
    'http://localhost:8001',
    'http://127.0.0.1',
    'http://127.0.0.1:8001',
] + [o.strip() for o in _raw_origins if o.strip()]))

# Security Headers
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = env.bool('SESSION_COOKIE_SECURE', default=True)
CSRF_COOKIE_SECURE = env.bool('CSRF_COOKIE_SECURE', default=True)
