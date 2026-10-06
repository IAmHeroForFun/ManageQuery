# 09 — Setup Guide
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05
> **OS:** Linux (Ubuntu 22.04+ recommended) | Python 3.11+

---

## Prerequisites

Before starting, ensure you have:
- **Python 3.11+** installed
- **Redis** installed (`sudo apt install redis-server`)
- **Git** installed
- **ESA SNAP** (optional, for full SAR preprocessing) — https://step.esa.int/main/download/snap-download/

External accounts (free):
- **Copernicus Data Space:** https://dataspace.copernicus.eu (for satellite image download)
- **Google AI Studio:** https://aistudio.google.com/app/apikey (for Gemini API key)

---

## Step 1 — Clone / Set Up Project

```bash
# Navigate to project directory
cd /mnt/Personal/Projects/Mfdfs

# Create Python virtual environment
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Verify Python version
python --version  # Should show Python 3.11.x
```

---

## Step 2 — Install Dependencies

```bash
# Upgrade pip first
pip install --upgrade pip

# Install all dependencies
pip install -r requirements.txt
```

> **Note:** Installing PyTorch, rasterio, and geopandas may take 5–10 minutes depending on connection speed.

**If you get GDAL errors with rasterio:**
```bash
sudo apt-get install -y gdal-bin libgdal-dev python3-gdal
pip install rasterio --no-binary rasterio
```

**If you get weasyprint errors:**
```bash
sudo apt-get install -y libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0
```

---

## Step 3 — Configure Environment Variables

```bash
# Copy the example env file
cp .env.example .env

# Edit with your values
nano .env
```

**`.env` file contents:**
```bash
# ── Django ──────────────────────────────────
DJANGO_SECRET_KEY=your-random-secret-key-here-change-this
DJANGO_DEBUG=True
DJANGO_SETTINGS_MODULE=config.settings.local

# ── Copernicus Data Space ─────────────────
COPERNICUS_USER=your_copernicus_username
COPERNICUS_PASS=your_copernicus_password

# ── Google Gemini AI ─────────────────────
GEMINI_API_KEY=your_gemini_api_key_here

# ── Celery / Redis ───────────────────────
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# ── Media files ──────────────────────────
MEDIA_ROOT=/mnt/Personal/Projects/Mfdfs/media
```

**Generate a Django secret key:**
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

---

## Step 4 — Database Setup

```bash
# Create and apply database migrations
python manage.py makemigrations --settings=config.settings.local
python manage.py migrate --settings=config.settings.local

# Create a superuser (for Django admin)
python manage.py createsuperuser --settings=config.settings.local

# Verify migrations
python manage.py showmigrations --settings=config.settings.local
```

---

## Step 5 — Create Media Directories

```bash
mkdir -p media/analysis
mkdir -p data/models
mkdir -p data/training
```

---

## Step 6 — Start Redis

```bash
# Start Redis server (runs in background)
redis-server --daemonize yes

# Verify Redis is running
redis-cli ping  # Should respond: PONG
```

---

## Step 7 — Start Services (3 terminals)

Open three terminal windows in the project directory:

**Terminal 1 — Django Dev Server:**
```bash
source venv/bin/activate
python manage.py runserver --settings=config.settings.local
# Server starts at http://127.0.0.1:8000
```

**Terminal 2 — Celery Worker:**
```bash
source venv/bin/activate
celery -A config.celery worker --loglevel=info
# Worker starts and waits for tasks
```

**Terminal 3 — (Optional) Celery Flower (task monitoring UI):**
```bash
source venv/bin/activate
pip install flower
celery -A config.celery flower
# Open http://127.0.0.1:5555 to monitor tasks
```

---

## Step 8 — Verify Installation

```bash
# Run test suite
pytest apps/ -v --ds=config.settings.local

# Quick API health check
curl http://localhost:8000/api/analysis/
# Should return: []
```

Open your browser at **http://127.0.0.1:8000** — you should see the AOI selector map.

---

## Step 9 — Download Training Data (U-Net)

```bash
# Clone Kuro Siwo dataset
cd data/training
git clone https://github.com/Orion-AI-Lab/KuroSiwo
cd KuroSiwo
# Follow the dataset download instructions in their README
```

---

## Step 10 — Train U-Net Model (Optional but Recommended)

```bash
# Train the flood segmentation model
python apps/ai/segmentation/train.py \
  --data-dir data/training/KuroSiwo \
  --epochs 50 \
  --batch-size 8 \
  --output data/models/flood_unet_best.pth

# GPU training (if CUDA available):
python apps/ai/segmentation/train.py \
  --data-dir data/training/KuroSiwo \
  --epochs 50 \
  --batch-size 16 \
  --device cuda \
  --output data/models/flood_unet_best.pth
```

> Training on CPU (~50 epochs): 8–16 hours
> Training on GPU (CUDA): 2–4 hours

---

## Step 11 — Run Trishuli Case Study

```bash
# Submit the Trishuli case study via the API
curl -X POST http://localhost:8000/api/analysis/ \
  -H "Content-Type: application/json" \
  -d '{
    "aoi": {
      "type": "Polygon",
      "coordinates": [[[85.1, 27.8], [85.7, 27.8], [85.7, 28.5], [85.1, 28.5], [85.1, 27.8]]]
    },
    "flood_date": "2026-08-26",
    "use_segmentation": true,
    "trace_flood_path": false
  }'

# Note the returned job_id
# Then open: http://localhost:8000/dashboard/<job_id>/
```

---

## ESA SNAP Setup (SAR Preprocessing)

Full SAR preprocessing requires ESA SNAP:

```bash
# Download SNAP installer
# https://step.esa.int/main/download/snap-download/
# Choose: SNAP for Sentinel toolboxes (Linux installer)

# Run installer
chmod +x esa-snap_all_linux-10.0.0.sh
./esa-snap_all_linux-10.0.0.sh

# Install snappy Python bindings
cd ~/snap/bin
./snappy-conf /path/to/venv/bin/python
```

**If SNAP is not available:** The system falls back to a simplified SAR processing using `rasterio` and `numpy` directly (less accurate but functional for demonstration).

---

## Common Issues & Troubleshooting

| Problem | Solution |
|---|---|
| `redis.exceptions.ConnectionError` | Start Redis: `redis-server` |
| `sentinelsat.exceptions.ServerError` | Check Copernicus credentials in `.env` |
| `google.api_core.exceptions.PermissionDenied` | Check `GEMINI_API_KEY` in `.env` |
| `GDAL not found` errors | `sudo apt-get install libgdal-dev` |
| `torch` not found | `pip install torch --index-url https://download.pytorch.org/whl/cpu` |
| Celery tasks stuck in PENDING | Ensure Redis is running + Celery worker is started |
| Sentinel download too slow | Normal — each scene is 1–3 GB; expect 20–40 min |
| Out of disk space during download | Ensure ≥ 20 GB free in `media/` directory |

---

## Production Deployment (Future)

For deploying to a server with PostgreSQL + PostGIS:

```bash
# 1. Install PostgreSQL + PostGIS
sudo apt install postgresql postgresql-contrib postgis

# 2. Create database
createdb floodmap
psql floodmap -c "CREATE EXTENSION postgis;"

# 3. Switch settings
export DJANGO_SETTINGS_MODULE=config.settings.production

# 4. Set DB env vars in .env
DATABASE_URL=postgresql://user:pass@localhost/floodmap

# 5. Migrate
python manage.py migrate

# 6. Collect static files
python manage.py collectstatic

# 7. Run with Gunicorn
gunicorn config.wsgi:application --workers 4 --bind 0.0.0.0:8000

# 8. Run Celery with multiple workers
celery -A config.celery worker --concurrency 4 --loglevel=info
```

---

## Directory Structure After Setup

```
Mfdfs/
├── venv/                    # Python virtual environment
├── db.sqlite3               # SQLite database (dev)
├── .env                     # Your secrets (gitignored)
├── media/
│   └── analysis/            # Per-job satellite data + results
├── data/
│   ├── models/
│   │   └── flood_unet_best.pth   # Trained U-Net weights
│   └── training/
│       └── KuroSiwo/        # Training dataset
└── docs/                    # This documentation
```
