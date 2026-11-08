#!/bin/sh
set -e

echo "=== [TikDown Backend Startup] ==="
echo "[GUNICORN] Iniciando servidor WSGI na porta ${PORT:-5000} com 1 worker e 8 threads..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 8 --timeout 600 app:app
