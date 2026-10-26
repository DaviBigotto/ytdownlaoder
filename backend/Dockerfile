FROM python:3.12-slim

# Evita buffering e interações no terminal
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Instala FFmpeg e Node.js (essenciais para fusão de vídeo e desafios do YouTube)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copia o código da aplicação
COPY . .

# Garante a existência do diretório temporário
RUN mkdir -p downloads

# Porta padrão de escuta
EXPOSE 5000

# Inicia com Gunicorn e timeout estendido (600s) para suportar downloads de alta resolução
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 2 --timeout 600 app:app"]
