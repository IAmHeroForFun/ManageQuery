#!/usr/bin/env bash
set -e

echo "=== [MFDFS CONTAINER BOOT] ==="

# 1. Wait for PostgreSQL if DATABASE_URL is set to postgres
if [[ "$DATABASE_URL" == *"postgres"* ]]; then
  echo "Waiting for PostgreSQL database to be reachable..."
  python << 'EOF'
import sys, time, os
from urllib.parse import urlparse
import socket

db_url = os.environ.get('DATABASE_URL', '')
if 'postgres' in db_url:
    parsed = urlparse(db_url)
    host = parsed.hostname or 'db'
    port = parsed.port or 5432
    print(f"Connecting to Postgres at {host}:{port}...")
    for i in range(40):
        try:
            with socket.create_connection((host, port), timeout=2):
                print("PostgreSQL is up and accepting connections!")
                sys.exit(0)
        except OSError:
            time.sleep(1)
    print("Warning: Could not connect to PostgreSQL within timeout.")
EOF
fi

# 2. Run Database Migrations
echo "Applying database migrations..."
python manage.py migrate --noinput

# 3. Collect Static Files
echo "Collecting static assets..."
python manage.py collectstatic --noinput

echo "=== [MFDFS INITIALIZATION COMPLETE] ==="

# 4. Execute the main container command (e.g. gunicorn or celery)
exec "$@"
