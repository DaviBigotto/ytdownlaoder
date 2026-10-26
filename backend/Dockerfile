# Stage 1: Servidor oficial pré-compilado de PO Token
FROM brainicism/bgutil-ytdlp-pot-provider:latest AS pot_source

# Stage 2: Runtime Node.js 22 para resolução dos desafios JavaScript do YouTube
FROM node:22-bookworm-slim AS node_source

# Stage 3: Servidor Flask em Python 3.12
FROM python:3.12-slim

# Evita buffering e interações no terminal
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Instala FFmpeg (para fusão de vídeo/áudio), curl (para healthcheck) e certificados
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copia Node.js 22 da imagem oficial
COPY --from=node_source /usr/local/bin/node /usr/local/bin/node
COPY --from=node_source /usr/local/lib/node_modules /usr/local/lib/node_modules

# Copia o servidor de PO Token (com dependências compiladas)
COPY --from=pot_source /app /opt/pot-provider

WORKDIR /app

# Instala dependências Python (Flask, yt-dlp, bgutil-ytdlp-pot-provider, etc.)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copia o código da aplicação
COPY . .

# Permissão no script de inicialização e diretório temporário
RUN chmod +x start.sh && mkdir -p downloads

# Porta padrão de escuta
EXPOSE 5000

# Inicializa o POT Provider em background e o Gunicorn
CMD ["sh", "start.sh"]
