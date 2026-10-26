#!/bin/sh
set -e

echo "=== [YTDL Backend Startup] ==="

# Verifica se o diretório do POT provider existe e inicia em background
if [ -f "/opt/pot-provider/build/main.js" ]; then
    echo "[POT-PROVIDER] Iniciando servidor de PO Token na porta 4416..."
    node /opt/pot-provider/build/main.js --host 127.0.0.1 --port 4416 &
    POT_PID=$!
    echo "[POT-PROVIDER] Servidor disparado (PID $POT_PID). Verificando disponibilidade..."
    
    for i in $(seq 1 12); do
        if curl -s http://127.0.0.1:4416/ping > /dev/null 2>&1; then
            echo "[POT-PROVIDER] OK: Servidor de PO Token respondendo com sucesso em http://127.0.0.1:4416 !"
            # Pré-aquecimento em background para o primeiro usuário não esperar o BotGuard compilar
            echo "[POT-PROVIDER] Pré-aquecendo gerador de tokens BotGuard..."
            curl -s -X POST http://127.0.0.1:4416/get_pot -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1 || true
            echo "[POT-PROVIDER] Pré-aquecimento concluído!"
            break
        fi
        sleep 1
    done
else
    echo "[POT-PROVIDER] AVISO: /opt/pot-provider/build/main.js não encontrado. Servidor iniciando sem provedor local de POT."
fi

echo "[GUNICORN] Iniciando servidor WSGI na porta ${PORT:-5000} com timeout de 600s..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 2 --timeout 600 app:app
