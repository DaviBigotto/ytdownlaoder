FROM python:3.12-slim

# Evita buffering e interações no terminal
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Instala FFmpeg (para áudio e contingência), curl e certificados
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copia o código da aplicação
COPY . .

# Permissão no script de inicialização e diretório temporário
RUN chmod +x start.sh && mkdir -p downloads

# Porta padrão de escuta
EXPOSE 5000

# Inicializa o Gunicorn via start.sh
CMD ["sh", "start.sh"]
