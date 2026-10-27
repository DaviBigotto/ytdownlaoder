#!/bin/sh
set -e

echo "=== [YTDL Backend Startup] ==="

# Verifica se o diretório do POT provider existe e inicia em background
if [ -f "/opt/pot-provider/build/main.js" ]; then
    echo "[POT-PROVIDER] Iniciando servidor de PO Token na porta 4416..."
    if [ -n "$PROXY_URL" ]; then
        HTTP_PROXY="$PROXY_URL" HTTPS_PROXY="$PROXY_URL" node /opt/pot-provider/build/main.js --host 127.0.0.1 --port 4416 &
    else
        node /opt/pot-provider/build/main.js --host 127.0.0.1 --port 4416 &
    fi
    POT_PID=$!
    echo "[POT-PROVIDER] Servidor disparado (PID $POT_PID). Verificando disponibilidade..."
    
    for i in $(seq 1 12); do
        if curl -s http://127.0.0.1:4416/ping > /dev/null 2>&1; then
            echo "[POT-PROVIDER] OK: Servidor de PO Token respondendo com sucesso em http://127.0.0.1:4416 !"
            break
        fi
        sleep 1
    done
else
    echo "[POT-PROVIDER] AVISO: /opt/pot-provider/build/main.js não encontrado. Servidor iniciando sem provedor local de POT."
fi

echo "[GUNICORN] Iniciando servidor WSGI na porta ${PORT:-5000} com 1 worker e 8 threads..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 8 --timeout 600 app:app
