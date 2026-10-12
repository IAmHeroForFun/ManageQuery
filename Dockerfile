# ==============================================================================
# Mapping Flood Damage from Space (Mfdfs) - Production Dockerfile
# Optimized for Python, Geospatial wheels (GDAL, GEOS, Rasterio), & Gunicorn
# ==============================================================================
FROM python:3.12-slim-bookworm

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# System dependencies for GIS, PostgreSQL, and image manipulation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install Python requirements
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Copy entrypoint and project code
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY . /app/

# Ensure directories for static, media, and data exist
RUN mkdir -p /app/staticfiles /app/media /app/data

# Make entrypoint runnable
ENTRYPOINT ["/bin/bash", "/app/docker-entrypoint.sh"]

# Default command: run Gunicorn with 3 workers
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "300"]
