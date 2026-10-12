# AWS Lightsail Deployment Guide: Mfdfs alongside `omvi_blog`

This guide explains step-by-step how to deploy **Mapping Flood Damage from Space (Mfdfs)** on your existing **AWS Lightsail** host (`ubuntu@ip-172-26-1-124:/opt/services`) without interfering with your currently running containers (`omvi_blog-nginx-1`, `omvi_blog-web-1`, `adguard`, `unbound`, `thumbor`, etc.).

---

## 1. Architecture Overview on Your Server

```text
[Public Traffic (80 / 443)]
           │
           ▼
[omvi_blog-nginx-1] (Your existing Nginx container)
   ├── omvihub.in        ─────────► omvi_blog-web-1 (8000)
   ├── images.omvihub.in ─────────► thumbor (80)
   ├── dns.omvihub.in    ─────────► adguard (80)
   ├── toolkit.omvihub.in ────────► script proxy
   └── flood.omvihub.in  ─────────► 127.0.0.1:8001 (mfdfs-web)
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
                 [mfdfs-db (Postgres 16)]      [mfdfs-redis (Redis 7)]
                         ▲                             ▲
                         └──────────────┬──────────────┘
                                        │
                               [mfdfs-celery worker]
```

### Key Guarantees:
- **Zero Port Collisions**: `mfdfs-db` and `mfdfs-redis` run inside their own private network and **never bind host port 5432 or 6379**.
- **Safe Web Port**: `mfdfs-web` binds strictly to `127.0.0.1:8001` so it never conflicts with `omvi_blog-web` on 8000.
- **Your Blog and DNS Remain Untouched**: Existing containers keep running without interruption.

---

## 2. Step-by-Step Deployment Steps

### Step 1: Clone Mfdfs to `/opt/services/mfdfs`
SSH into your Lightsail server and clone the repository:
```bash
ssh ubuntu@your-lightsail-ip
cd /opt/services
git clone https://github.com/your-username/Mfdfs.git mfdfs
cd /opt/services/mfdfs
```

---

### Step 2: Configure Environment Variables
Copy the production environment template to `.env`:
```bash
cp .env.production.example .env
nano .env
```

Set the following variables inside `.env`:
- `DJANGO_SECRET_KEY`: Set a long random string (e.g. run `openssl rand -hex 32` to generate one).
- `DJANGO_ALLOWED_HOSTS`: `flood.omvihub.in,127.0.0.1,localhost`
- `CSRF_TRUSTED_ORIGINS`: `https://flood.omvihub.in`
- `POSTGRES_PASSWORD`: Choose a secure password for the Mfdfs PostgreSQL database.
- `GEMINI_API_KEY`: Your Gemini API key from Google AI Studio.
- `COPERNICUS_USER` & `COPERNICUS_PASS`: Your Copernicus Data Space credentials.

Save with `Ctrl+O`, then exit with `Ctrl+X`.

---

### Step 3: Issue SSL Certificate for the Subdomain
Using Certbot on your host (or through your existing Certbot container):
```bash
sudo certbot certonly --standalone -d nutriwise.omvihub.in
```
Ensure your DNS provider (e.g. Cloudflare / Route53 / Namecheap) has an `A` record pointing `flood.omvihub.in` to your Lightsail public IP.

---

### Step 4: Add the Subdomain Block to Your Existing Nginx
Open your existing Nginx configuration:
```bash
nano /opt/services/omvi_blog/nginx/default.conf
```

Scroll to the bottom and paste the block below (also available in `docker/nginx/omvihub_nginx_block.conf`):

```nginx
# ==============================================================================
# Mfdfs Satellite Flood Damage Analysis
# ==============================================================================
upstream mfdfs_app {
    server 127.0.0.1:8001;
}

server {
    listen 80;
    server_name flood.omvihub.in;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name flood.omvihub.in;

    ssl_certificate /etc/letsencrypt/live/flood.omvihub.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/flood.omvihub.in/privkey.pem;

    client_max_body_size 100M;

    # Satellite processing & Gemini AI timeouts
    proxy_connect_timeout 120s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    send_timeout 300s;

    location / {
        proxy_pass http://mfdfs_app;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
```

Save the file (`Ctrl+O`, `Enter`, `Ctrl+X`).

Reload your existing Nginx container:
```bash
docker exec omvi_blog-nginx-1 nginx -t
docker exec omvi_blog-nginx-1 nginx -s reload
```

---

### Step 5: Build and Start Mfdfs
In `/opt/services/mfdfs`, start the Docker Compose stack:
```bash
cd /opt/services/mfdfs
docker compose up -d --build
```

This single command will:
1. Start `mfdfs-db` (Postgres 16) and `mfdfs-redis`.
2. Wait for Postgres to be healthy.
3. Automatically run database migrations (`python manage.py migrate`).
4. Automatically collect static assets (`python manage.py collectstatic`).
5. Start Gunicorn (`mfdfs-web`) on `127.0.0.1:8001`.
6. Start Celery worker (`mfdfs-celery`) to process satellite images in the background.

---

### Step 6: Verify Everything Is Running
1. Check running containers:
   ```bash
   docker compose ps
   ```
   You should see:
   - `mfdfs-db` (healthy)
   - `mfdfs-redis` (healthy)
   - `mfdfs-web` (Up)
   - `mfdfs-celery` (Up)
2. Check web container logs:
   ```bash
   docker compose logs -f web
   ```
3. Test locally with curl:
   ```bash
   curl -I http://127.0.0.1:8001
   ```
   It should return `HTTP/1.1 200 OK` or `302 Found`.
4. Open your browser and visit:
   `https://flood.omvihub.in`

---

## 3. Useful Maintenance Commands

### View Live Logs:
```bash
# View web logs
docker compose logs -f mfdfs-web

# View celery worker logs (satellite processing)
docker compose logs -f mfdfs-celery
```

### Create a Django Superuser:
```bash
docker compose exec mfdfs-web python manage.py createsuperuser
```

### Restarting or Updating:
```bash
# Pull new changes and rebuild
git pull
docker compose up -d --build

# Stop the stack
docker compose down

# Restart the stack
docker compose restart
```

### Database Backup:
```bash
docker compose exec -T mfdfs-db pg_dump -U mfdfs_user mfdfs_db > backup_$(date +%F).sql
```
