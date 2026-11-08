from flask import Flask, request, send_file, jsonify, after_this_request
from flask_cors import CORS
import requests
import yt_dlp
import os
import re
import uuid
import glob
import shutil
import threading
import time
import zipfile
import io

app = Flask(__name__)
CORS(app)

# Pasta temporária para downloads
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_FOLDER = os.path.join(BASE_DIR, 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

# Gerenciador thread-safe de progresso dos downloads
download_progress = {}
progress_lock = threading.Lock()

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.tiktok.com/'
}

def update_progress(task_id, data):
    if not task_id:
        return
    with progress_lock:
        if task_id not in download_progress:
            download_progress[task_id] = {
                'status': 'starting',
                'percent': 0,
                'speed': '',
                'eta': '',
                'downloaded': '',
                'total': '',
                'stage': 'Iniciando...',
                'timestamp': time.time()
            }
        download_progress[task_id].update(data)
        download_progress[task_id]['timestamp'] = time.time()

def cleanup_old_progress():
    """Remove entradas de progresso com mais de 10 minutos."""
    with progress_lock:
        now = time.time()
        to_del = [tid for tid, p in download_progress.items() if now - p.get('timestamp', now) > 600]
        for tid in to_del:
            download_progress.pop(tid, None)

def format_size(bytes_val):
    """Converte bytes em formato legível (KB, MB, GB)."""
    if not bytes_val or bytes_val <= 0:
        return "N/D"
    if bytes_val >= 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"
    if bytes_val >= 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.2f} MB"
    return f"{bytes_val / 1024:.1f} KB"

def format_duration(seconds):
    """Converte segundos em string de duração (ex: 0:24)."""
    if not seconds:
        return "0:00"
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins}:{secs:02d}"

def format_number(val):
    """Formata números grandes como 1.2M ou 45.3K."""
    if not val or not isinstance(val, (int, float)):
        return "0"
    if val >= 1_000_000:
        return f"{val / 1_000_000:.1f}M"
    if val >= 1_000:
        return f"{val / 1_000:.1f}K"
    return str(int(val))

def clean_tiktok_url(raw_url):
    """Extrai e valida a URL do TikTok a partir de texto bruto."""
    raw_url = raw_url.strip()
    match = re.search(r'(https?://[^\s]+)', raw_url)
    if match:
        url = match.group(1)
        # Limpar parâmetros desnecessários que possam quebrar a rota
        return url
    return raw_url

def resolve_tiktok_url(url):
    """Segue redirecionamentos para resolver links encurtados (ex: vt.tiktok.com / vm.tiktok.com)."""
    try:
        res = requests.head(url, allow_redirects=True, timeout=6, headers=DEFAULT_HEADERS)
        return res.url
    except Exception:
        return url

@app.route('/')
def home():
    return jsonify({
        "status": "online",
        "service": "TikTok Downloader API",
        "message": "Servidor Backend Flask rodando com sucesso!",
        "frontend_url": "http://localhost:5173"
    })

@app.route('/progress/<task_id>', methods=['GET'])
def get_progress(task_id):
    """Retorna o progresso em tempo real do download."""
    cleanup_old_progress()
    with progress_lock:
        data = download_progress.get(task_id, {
            'status': 'starting',
            'percent': 0,
            'speed': '',
            'eta': '',
            'downloaded': '',
            'total': '',
            'stage': 'Iniciando download...'
        })
    return jsonify(data)

@app.route('/info', methods=['POST'])
@app.route('/api/info', methods=['POST'])
def video_info():
    data = request.json or {}
    raw_url = data.get('url', '').strip()

    if not raw_url:
        return jsonify({"error": "Por favor, insira o link do vídeo do TikTok."}), 400

    url = clean_tiktok_url(raw_url)
    if 'tiktok.com' not in url:
        return jsonify({"error": "O link informado não parece ser um link válido do TikTok."}), 400

    # Tenta obter dados através do motor TikWM (rápido e com sem marca d'água nativo)
    try:
        resolved_url = resolve_tiktok_url(url)
        resp = requests.post(
            'https://www.tikwm.com/api/',
            data={'url': resolved_url, 'hd': 1},
            headers=DEFAULT_HEADERS,
            timeout=12
        )

        tik_res = resp.json()
        if tik_res.get('code') == 0:
            d = tik_res.get('data', {})
            author_data = d.get('author', {})

            duration = d.get('duration', 0)
            cover = d.get('cover') or d.get('origin_cover')
            avatar = author_data.get('avatar')
            nickname = author_data.get('nickname') or 'Criador do TikTok'
            unique_id = author_data.get('unique_id') or 'tiktok_user'
            title = d.get('title') or f"Vídeo de @{unique_id}"

            # Links de download
            play_no_watermark = d.get('play')
            hd_play = d.get('hdplay')
            watermark_play = d.get('wmplay')
            music_url = d.get('music')
            music_info = d.get('music_info', {})
            images = d.get('images', [])

            # Monta lista de opções de download
            options = []

            # 1. Sem Marca d'Água HD (se disponível)
            if hd_play:
                options.append({
                    'id': 'nowatermark_hd',
                    'label': 'Sem Marca d\'Água (HD)',
                    'sublabel': 'Alta Definição Original',
                    'format': 'MP4',
                    'type': 'video',
                    'is_hd': True,
                    'url': hd_play,
                    'size': format_size(d.get('hd_size') or d.get('size'))
                })

            # 2. Sem Marca d'Água (Padrão)
            if play_no_watermark:
                options.append({
                    'id': 'nowatermark',
                    'label': 'Sem Marca d\'Água',
                    'sublabel': 'Versão Limpa Recomendada',
                    'format': 'MP4',
                    'type': 'video',
                    'is_hd': not bool(hd_play),
                    'url': play_no_watermark,
                    'size': format_size(d.get('size'))
                })

            # 3. Com Marca d'Água (Original com créditos)
            if watermark_play:
                options.append({
                    'id': 'watermark',
                    'label': 'Com Marca d\'Água',
                    'sublabel': 'Original do App TikTok',
                    'format': 'MP4',
                    'type': 'video',
                    'is_hd': False,
                    'url': watermark_play,
                    'size': format_size(d.get('wm_size'))
                })

            # 4. Áudio MP3 da Trend
            if music_url:
                music_title = music_info.get('title') or "Som Original"
                music_author = music_info.get('author') or unique_id
                options.append({
                    'id': 'music',
                    'label': 'Baixar Áudio (MP3)',
                    'sublabel': f"{music_title} • {music_author}",
                    'format': 'MP3',
                    'type': 'audio',
                    'is_hd': False,
                    'url': music_url,
                    'size': "Áudio Leve"
                })

            return jsonify({
                "id": str(d.get('id', '')),
                "title": title,
                "cover": cover,
                "duration": format_duration(duration),
                "author": {
                    "nickname": nickname,
                    "unique_id": f"@{unique_id}",
                    "avatar": avatar
                },
                "stats": {
                    "likes": format_number(d.get('digg_count')),
                    "comments": format_number(d.get('comment_count')),
                    "shares": format_number(d.get('share_count')),
                    "views": format_number(d.get('play_count'))
                },
                "options": options,
                "images": images,
                "is_slideshow": bool(images and len(images) > 0)
            })

    except Exception as e:
        print(f"Erro na extração primária TikWM: {e}")

    # Fallback secundário usando yt-dlp
    try:
        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'noplaylist': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'Vídeo do TikTok')
            cover = info.get('thumbnail')
            uploader = info.get('uploader', 'tiktok_user')
            duration = info.get('duration', 0)

            options = [
                {
                    'id': 'nowatermark',
                    'label': 'Sem Marca d\'Água (HD)',
                    'sublabel': 'Stream Original',
                    'format': 'MP4',
                    'type': 'video',
                    'is_hd': True,
                    'url': None,
                    'size': 'Vídeo HD'
                },
                {
                    'id': 'music',
                    'label': 'Baixar Áudio (MP3)',
                    'sublabel': 'Áudio original do vídeo',
                    'format': 'MP3',
                    'type': 'audio',
                    'is_hd': False,
                    'url': None,
                    'size': 'MP3'
                }
            ]

            return jsonify({
                "id": str(info.get('id', '')),
                "title": title,
                "cover": cover,
                "duration": format_duration(duration),
                "author": {
                    "nickname": uploader,
                    "unique_id": f"@{uploader}",
                    "avatar": cover
                },
                "stats": {
                    "likes": format_number(info.get('like_count', 0)),
                    "comments": format_number(info.get('comment_count', 0)),
                    "shares": "0",
                    "views": format_number(info.get('view_count', 0))
                },
                "options": options,
                "images": [],
                "is_slideshow": False
            })

    except Exception as fallback_err:
        print(f"Erro no fallback yt-dlp: {fallback_err}")
        return jsonify({
            "error": "Não foi possível encontrar este vídeo do TikTok. Verifique se o link está correto e se o perfil/vídeo não é privado."
        }), 400

@app.route('/download', methods=['POST'])
@app.route('/api/download', methods=['POST'])
def download_media():
    data = request.json or {}
    url = data.get('url', '').strip()
    download_url = data.get('downloadUrl')
    option_id = data.get('optionId', 'nowatermark')
    media_type = data.get('type', 'video')
    task_id = data.get('taskId') or str(uuid.uuid4())[:8]
    title = data.get('title', 'tiktok_video')
    author = data.get('author', 'tiktok')

    update_progress(task_id, {
        'status': 'starting',
        'percent': 10,
        'stage': 'Conectando ao CDN de alta velocidade...'
    })

    # Limpar título para nome de arquivo seguro
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_title or len(safe_title) > 60:
        safe_title = safe_title[:60] if safe_title else "video"
    safe_author = "".join(c for c in author if c.isalnum() or c in ('-', '_')).strip()

    ext = 'mp3' if media_type == 'audio' or option_id == 'music' else 'mp4'
    filename = f"{safe_author}_{safe_title}_{option_id}.{ext}"
    local_filepath = os.path.join(DOWNLOAD_FOLDER, f"{task_id}_{filename}")

    try:
        # Se for download de todas as imagens do carrossel compactadas em ZIP
        if option_id == 'all_images':
            images = data.get('images', [])
            if not images:
                return jsonify({"error": "Nenhuma imagem encontrada no carrossel."}), 400

            update_progress(task_id, {
                'status': 'downloading',
                'percent': 15,
                'stage': f'Iniciando download de {len(images)} fotos...'
            })

            zip_filename = f"{safe_author}_{safe_title}_fotos.zip"
            local_filepath = os.path.join(DOWNLOAD_FOLDER, f"{task_id}_{zip_filename}")

            with zipfile.ZipFile(local_filepath, 'w', compression=zipfile.ZIP_DEFLATED) as zipf:
                for idx, img_url in enumerate(images):
                    try:
                        img_resp = requests.get(img_url, headers=DEFAULT_HEADERS, timeout=15)
                        if img_resp.status_code == 200:
                            zipf.writestr(f"foto_{idx + 1:02d}.jpg", img_resp.content)
                    except Exception as img_err:
                        print(f"Erro ao baixar imagem {idx}: {img_err}")

                    percent = min(round(15 + ((idx + 1) / len(images)) * 80, 1), 95.0)
                    update_progress(task_id, {
                        'status': 'downloading',
                        'percent': percent,
                        'stage': f'Compactando imagem {idx + 1} de {len(images)}...'
                    })

            filename = zip_filename

        # Se temos uma URL direta do stream (TikWM CDN)
        elif download_url and download_url.startswith('http'):
            update_progress(task_id, {
                'status': 'downloading',
                'percent': 25,
                'stage': 'Baixando arquivo sem marca d\'água...'
            })

            # Faz o download por chunks para reportar progresso
            with requests.get(download_url, headers=DEFAULT_HEADERS, stream=True, timeout=25) as r:
                r.raise_for_status()
                total_size = int(r.headers.get('content-length', 0))
                downloaded_size = 0
                start_time = time.time()

                with open(local_filepath, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            f.write(chunk)
                            downloaded_size += len(chunk)
                            if total_size > 0:
                                percent = min(round((downloaded_size / total_size) * 100, 1), 98.0)
                                elapsed = time.time() - start_time
                                speed = downloaded_size / elapsed if elapsed > 0 else 0
                                speed_str = format_size(speed) + "/s"
                                eta = int((total_size - downloaded_size) / speed) if speed > 0 else 0
                                eta_str = f"{eta}s restantes" if eta > 0 else ""
                                update_progress(task_id, {
                                    'status': 'downloading',
                                    'percent': percent,
                                    'speed': speed_str,
                                    'eta': eta_str,
                                    'downloaded': format_size(downloaded_size),
                                    'total': format_size(total_size),
                                    'stage': 'Baixando arquivo...'
                                })

        else:
            # Fallback com yt-dlp se não houver downloadUrl direta
            update_progress(task_id, {
                'status': 'downloading',
                'percent': 30,
                'stage': 'Extraindo com motor de contingência...'
            })

            output_template = os.path.join(DOWNLOAD_FOLDER, f"{task_id}_%(title)s.%(ext)s")
            ydl_opts = {
                'outtmpl': output_template,
                'noplaylist': True,
                'quiet': True
            }

            if media_type == 'audio' or option_id == 'music':
                ydl_opts.update({
                    'format': 'bestaudio/best',
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }]
                })
            else:
                ydl_opts.update({
                    'format': 'best'
                })

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            matches = glob.glob(os.path.join(DOWNLOAD_FOLDER, f"{task_id}_*"))
            if not matches:
                raise Exception("Arquivo baixado não foi encontrado.")
            local_filepath = matches[0]

        update_progress(task_id, {
            'status': 'finished',
            'percent': 100,
            'stage': 'Download finalizado! Entregando arquivo...'
        })

        def delayed_cleanup(filepath):
            # No Windows, o send_file segura o handle durante o streaming
            time.sleep(15)
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
            except Exception:
                pass

        cleanup_thread = threading.Thread(target=delayed_cleanup, args=(local_filepath,), daemon=True)
        cleanup_thread.start()

        return send_file(
            local_filepath,
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        err_msg = str(e)
        print(f"Erro durante download do TikTok: {err_msg}")
        update_progress(task_id, {'status': 'error', 'stage': err_msg})
        return jsonify({"error": f"Falha ao realizar o download: {err_msg}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
