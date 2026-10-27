from flask import Flask, request, send_file, jsonify, after_this_request, redirect
from flask_cors import CORS
import yt_dlp
import os
import uuid
import glob
import shutil
import threading
import time
import urllib.request
import copy
import sys

app = Flask(__name__)
CORS(app)

# Cache em memória para análises recentes de vídeos (evita reprocessamento repetido)
VIDEO_INFO_CACHE = {}
CACHE_LOCK = threading.Lock()
CACHE_TTL = 900  # 15 minutos

def get_cached_video(url_str):
    if not url_str:
        return None, None
    clean_url = url_str.strip().split('&list=')[0].split('&index=')[0]
    now = time.time()
    with CACHE_LOCK:
        if clean_url in VIDEO_INFO_CACHE:
            ts, formatted, raw = VIDEO_INFO_CACHE[clean_url]
            if now - ts < CACHE_TTL:
                return formatted, raw
            else:
                del VIDEO_INFO_CACHE[clean_url]
    return None, None

def set_cached_video(url_str, formatted, raw):
    if not url_str:
        return
    clean_url = url_str.strip().split('&list=')[0].split('&index=')[0]
    now = time.time()
    with CACHE_LOCK:
        if len(VIDEO_INFO_CACHE) > 100:
            expired = [k for k, (t, _, _) in VIDEO_INFO_CACHE.items() if now - t > CACHE_TTL]
            for k in expired:
                del VIDEO_INFO_CACHE[k]
        VIDEO_INFO_CACHE[clean_url] = (now, formatted, raw)

# Pasta temporária com caminho absoluto
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_FOLDER = os.path.join(BASE_DIR, 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
COOKIES_FILE = os.path.join(BASE_DIR, 'cookies.txt')

# Se cookies foram fornecidos via variável de ambiente (útil no Render), salva em cookies.txt
cookies_env = os.environ.get('YOUTUBE_COOKIES') or os.environ.get('COOKIES_CONTENT')
if cookies_env and (not os.path.exists(COOKIES_FILE) or os.path.getsize(COOKIES_FILE) == 0):
    try:
        with open(COOKIES_FILE, 'w', encoding='utf-8') as f:
            f.write(cookies_env.strip())
        print("Arquivo cookies.txt criado a partir da variável de ambiente com sucesso.")
    except Exception as e:
        print(f"Erro ao salvar cookies da variável de ambiente: {e}")

def parse_proxy_url(proxy_str):
    """Normaliza o proxy para o formato aceito pelo yt-dlp (http://user:pass@host:port)."""
    if not proxy_str:
        return None
    proxy_str = proxy_str.strip()
    if proxy_str.startswith(('http://', 'https://', 'socks5://', 'socks4://')):
        return proxy_str
    parts = proxy_str.split(':')
    if len(parts) == 4:
        # Formato host:port:user:pass
        host, port, user, password = parts
        return f"http://{user}:{password}@{host}:{port}"
    if len(parts) == 2:
        # Formato host:port
        host, port = parts
        return f"http://{host}:{port}"
    return f"http://{proxy_str}"

# Proxy rotativo configurado via variável de ambiente PROXY_URL ou ROTATING_PROXY_URL
PROXY_URL = parse_proxy_url(os.environ.get('PROXY_URL') or os.environ.get('ROTATING_PROXY_URL'))
if PROXY_URL:
    print(f"Proxy rotativo configurado com sucesso.")

# Gerenciador thread-safe de progresso dos downloads
download_progress = {}
progress_lock = threading.Lock()

def is_youtube_bot_error(err_str):
    """Verifica se o erro é decorrente de bloqueio de IP/Datacenter ou desafio anti-bot do YouTube."""
    if not err_str:
        return False
    # Normaliza aspas simples, curvas e crases (e.g. you're, you’re, you`re)
    normalized = err_str.lower().replace("’", "'").replace("`", "'")
    return (
        "sign in to confirm you're not a bot" in normalized
        or "failed to extract any player response" in normalized
        or "confirm you are on the latest version" in normalized
        or "http error 429" in normalized
        or "too many requests" in normalized
    )

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
                'stage': 'Iniciando download...',
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

def get_ffmpeg_dir():
    """Detecta o diretório do FFmpeg instalado no sistema ou no WinGet."""
    system_ffmpeg = shutil.which('ffmpeg')
    if system_ffmpeg:
        return os.path.dirname(system_ffmpeg)

    winget_pattern = os.path.expandvars(
        r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\*FFmpeg*\*\bin\ffmpeg.exe'
    )
    matches = glob.glob(winget_pattern)
    if matches and os.path.exists(matches[0]):
        return os.path.dirname(matches[0])

    return None

def is_pot_provider_available():
    """Verifica se o servidor local do PO Token Provider (bgutil) está ativo."""
    try:
        req = urllib.request.Request("http://127.0.0.1:4416/ping")
        with urllib.request.urlopen(req, timeout=1.0) as res:
            if res.status == 200:
                return True
    except Exception:
        pass
    return False

def get_node_path():
    """Localiza o executável do Node.js para os desafios JavaScript do YouTube."""
    system_node = shutil.which('node')
    if system_node:
        return system_node
    default_node = r'C:\Program Files\nodejs\node.exe'
    if os.path.exists(default_node):
        return default_node
    return None

def get_base_ydl_opts(use_proxy=None):
    """Retorna as opções base para contornar proteções e desafios do YouTube com máxima velocidade."""
    pot_active = is_pot_provider_available()

    opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'playlist_items': '1',
        'remote_components': ['ejs:github'],
    }

    if pot_active:
        # Quando o POT provider (bgutil) está ativo, usamos 'tv_simply' e 'web_embedded'.
        # NÃO usamos player_skip: ['configs'] porque o visitor_data da configuração é obrigatório
        # para a assinatura dos GVS PO Tokens que liberam as resoluções HD (720p, 1080p, 1440p, 4K).
        opts['extractor_args'] = {
            'youtube': {
                'player_client': ['tv_simply', 'web_embedded'],
            }
        }
    else:
        # Fallback para mobile quando não há POT provider disponível
        opts['extractor_args'] = {
            'youtube': {
                'player_client': ['ios', 'android']
            }
        }

    # Se use_proxy for explicitamente True/False, respeita a decisão do chamador.
    # Se use_proxy for None: quando o POT provider está ativo, NUNCA usa proxy por padrão,
    # pois o proxy rotativo troca de IP a cada request e quebra o PO Token com 403 / bot detection.
    should_use_proxy = use_proxy if use_proxy is not None else (not pot_active)
    if should_use_proxy and PROXY_URL:
        opts['proxy'] = PROXY_URL

    node_path = get_node_path()
    if node_path:
        opts['js_runtimes'] = {'node': {'path': node_path}}

    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
        opts['cookiefile'] = COOKIES_FILE

    return opts

def format_size(bytes_val):
    """Converte bytes em formato legível (MB, GB)."""
    if not bytes_val or bytes_val <= 0:
        return "N/D"
    if bytes_val >= 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"
    return f"{bytes_val / (1024 * 1024):.2f} MB"

def format_duration(seconds):
    """Converte segundos em string de duração (ex: 12:34)."""
    if not seconds:
        return ""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    hours = int(mins // 60)
    mins = int(mins % 60)
    if hours > 0:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"

@app.route('/')
def home():
    pot_ready = is_pot_provider_available()
    return jsonify({
        "status": "online",
        "message": "Servidor Backend Flask rodando com sucesso!",
        "frontend_url": "https://streamdownload.vercel.app",
        "yt_dlp_version": getattr(yt_dlp, '__version__', getattr(getattr(yt_dlp, 'version', None), '__version__', 'unknown')),
        "ffmpeg_ready": get_ffmpeg_dir() is not None,
        "pot_provider_ready": pot_ready,
        "has_cookies": os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0,
        "has_proxy": bool(PROXY_URL)
    })

@app.route('/diag', methods=['GET'])
def diag():
    yt_test = None
    try:
        req = urllib.request.Request("https://www.youtube.com", headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4.0) as r:
            yt_test = f"OK {r.status}"
    except Exception as e:
        yt_test = f"ERR: {e}"

    pot_test = None
    try:
        req = urllib.request.Request("http://127.0.0.1:4416/get_pot", data=b'{}', headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=4.0) as r:
            pot_test = f"OK {r.status}"
    except Exception as e:
        pot_test = f"ERR: {e}"

    return jsonify({
        "pot_provider_ready": is_pot_provider_available(),
        "has_proxy": bool(PROXY_URL),
        "has_cookies": os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0,
        "yt_direct_connection": yt_test,
        "pot_get_pot_test": pot_test,
        "node_path": get_node_path(),
        "ffmpeg_path": get_ffmpeg_dir(),
        "python_version": sys.version
    })

@app.route('/progress/<task_id>', methods=['GET'])
def get_progress(task_id):
    """Retorna o estado e progresso em tempo real do download para a barra de progresso."""
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
def video_info():
    data = request.json or {}
    url = data.get('url', '').strip()

    if not url:
        return jsonify({"error": "URL é obrigatória"}), 400

    # Verifica cache em memória (resposta imediata em < 5ms se já foi analisado recentemente)
    cached_formatted, _ = get_cached_video(url)
    if cached_formatted:
        return jsonify(cached_formatted)

    pot_active = is_pot_provider_available()
    ydl_opts = get_base_ydl_opts(use_proxy=False if pot_active else True)
    ydl_opts.update({
        'skip_download': True,
    })

    try:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as first_err:
            # Se falhou sem proxy e temos proxy configurado, tenta com proxy como fallback
            if PROXY_URL and not ydl_opts.get('proxy'):
                print(f"Tentativa direta com POT falhou ({str(first_err)[:80]}). Tentando fallback com proxy...")
                ydl_opts_proxy = get_base_ydl_opts(use_proxy=True)
                ydl_opts_proxy.update({'skip_download': True})
                with yt_dlp.YoutubeDL(ydl_opts_proxy) as ydl_proxy:
                    info = ydl_proxy.extract_info(url, download=False)
            else:
                raise first_err

            title = info.get('title', 'Vídeo do YouTube')
            thumbnail = info.get('thumbnail')
            duration = info.get('duration', 0)
            uploader = info.get('uploader') or info.get('channel', 'Desconhecido')

            best_audio_size = 0
            best_audio_tbr = 128
            for f in info.get('formats', []):
                if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
                    size = f.get('filesize') or f.get('filesize_approx')
                    if size and size > best_audio_size:
                        best_audio_size = size
                    if f.get('tbr') and f.get('tbr') > best_audio_tbr:
                        best_audio_tbr = f.get('tbr')

            if best_audio_size == 0 and duration > 0:
                best_audio_size = int((best_audio_tbr * 1000 / 8) * duration)

            quality_labels = {
                2160: ("4K", "Ultra HD"),
                1440: ("2K", "Quad HD"),
                1080: ("1080p", "Full HD"),
                720: ("720p", "HD"),
                480: ("480p", "SD"),
                360: ("360p", "Normal"),
                240: ("240p", "Baixa"),
                144: ("144p", "Mínima")
            }

            video_formats_by_height = {}
            for f in info.get('formats', []):
                # Ignora formatos sem vídeo (áudios puros e imagens de storyboard)
                if not f.get('vcodec') or f.get('vcodec') == 'none':
                    continue
                h = f.get('height')
                if not h:
                    continue

                matched_standard = None
                for std_h in sorted(quality_labels.keys(), reverse=True):
                    if h >= std_h - 10:
                        matched_standard = std_h
                        break

                if not matched_standard:
                    continue

                v_size = f.get('filesize') or f.get('filesize_approx')
                if not v_size and f.get('tbr') and duration > 0:
                    v_size = int((f.get('tbr') * 1000 / 8) * duration)

                has_audio = bool(f.get('acodec') and f.get('acodec') != 'none')
                total_size = (v_size or 0) + (best_audio_size if not has_audio else 0)

                should_update = False
                if matched_standard not in video_formats_by_height:
                    should_update = True
                elif has_audio and not video_formats_by_height[matched_standard]['has_audio']:
                    should_update = True
                elif total_size > video_formats_by_height[matched_standard]['raw_size']:
                    should_update = True

                if should_update:
                    lbl, sub_lbl = quality_labels.get(matched_standard, (f"{matched_standard}p", ""))
                    video_formats_by_height[matched_standard] = {
                        'height': matched_standard,
                        'quality': lbl,
                        'label': sub_lbl,
                        'format': 'MP4',
                        'raw_size': total_size,
                        'size': format_size(total_size),
                        'direct_url': f.get('url'),
                        'has_audio': has_audio
                    }

            video_list = [
                video_formats_by_height[k]
                for k in sorted(video_formats_by_height.keys(), reverse=True)
            ]

            # Localiza o melhor stream direto de áudio puro (M4A)
            best_audio_direct = None
            for f in info.get('formats', []):
                if f.get('vcodec') == 'none' and f.get('acodec') != 'none' and f.get('url'):
                    if not best_audio_direct or (f.get('tbr') or 0) > (best_audio_direct.get('tbr') or 0):
                        best_audio_direct = f

            audio_direct_url = best_audio_direct.get('url') if best_audio_direct else None
            audio_direct_ext = (best_audio_direct.get('ext') or 'm4a').upper() if best_audio_direct else 'M4A'

            audio_options = [
                {"quality": "320 kbps", "label": "Qualidade Máxima", "bitrate": "320", "format": "MP3"},
                {"quality": "192 kbps", "label": "Alta Qualidade", "bitrate": "192", "format": "MP3"},
                {"quality": "128 kbps", "label": "Qualidade Padrão", "bitrate": "128", "format": "MP3"},
                {"quality": "64 kbps", "label": "Econômico", "bitrate": "64", "format": "MP3"}
            ]

            audio_list = []
            for a in audio_options:
                b_val = int(a['bitrate'])
                est_bytes = int((b_val * 1000 / 8) * duration) if duration > 0 else 0
                audio_list.append({
                    'quality': a['quality'],
                    'label': a['label'],
                    'bitrate': a['bitrate'],
                    'format': a['format'],
                    'size': format_size(est_bytes),
                    'direct_url': audio_direct_url,
                    'direct_format': audio_direct_ext
                })

            res_data = {
                "title": title,
                "thumbnail": thumbnail,
                "duration": format_duration(duration),
                "uploader": uploader,
                "videos": video_list,
                "audios": audio_list
            }

            # Armazena em cache para acelerar reanálise e o início do download
            set_cached_video(url, res_data, info)

            return jsonify(res_data)

    except Exception as e:
        err_str = str(e)
        print(f"Erro ao obter info: {err_str}")
        if is_youtube_bot_error(err_str):
            return jsonify({
                "error": "O YouTube solicitou verificação de autenticidade (anti-bot). O servidor PO Token tentou validar a sessão automaticamente. Tente novamente em alguns segundos ou adicione cookies.",
                "is_bot_error": True
            }), 403
        return jsonify({"error": f"Erro ao analisar o vídeo: {err_str}"}), 500

@app.route('/download', methods=['POST'])
def download_video():
    data = request.json or {}
    url = data.get('url', '').strip()
    media_type = data.get('type', 'video')
    height = data.get('height')
    bitrate = data.get('bitrate', '192')
    task_id = data.get('taskId') or str(uuid.uuid4())[:8]
    
    if not url:
        return jsonify({"error": "URL é obrigatória"}), 400

    file_id = task_id
    output_template = os.path.join(DOWNLOAD_FOLDER, f"%(title)s_{file_id}.%(ext)s")
    ffmpeg_dir = get_ffmpeg_dir()

    update_progress(task_id, {
        'status': 'starting',
        'percent': 5,
        'stage': 'Conectando ao YouTube...'
    })

    def progress_hook(d):
        if d['status'] == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            percent = 0
            if total and total > 0:
                percent = min(round((downloaded / total) * 100, 1), 98.0)

            speed = d.get('speed')
            speed_str = (format_size(speed) + "/s") if speed else ""

            eta = d.get('eta')
            eta_str = f"{eta}s restantes" if (eta and eta > 0) else ""

            update_progress(task_id, {
                'status': 'downloading',
                'percent': max(percent, 5.0),
                'speed': speed_str,
                'eta': eta_str,
                'downloaded': format_size(downloaded),
                'total': format_size(total) if total > 0 else '',
                'stage': 'Baixando stream de mídia...'
            })
        elif d['status'] == 'finished':
            update_progress(task_id, {
                'status': 'merging',
                'percent': 99.0,
                'speed': '',
                'eta': '',
                'stage': 'Unindo e finalizando arquivo com FFmpeg...'
            })

    use_proxy_dl = os.environ.get('PROXY_DOWNLOAD', 'false').lower() in ('true', '1', 'yes')
    ydl_opts = get_base_ydl_opts(use_proxy=use_proxy_dl)
    ydl_opts['progress_hooks'] = [progress_hook]

    if media_type == 'audio':
        ydl_opts.update({
            'format': 'bestaudio/best',
            'outtmpl': output_template,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': str(bitrate),
            }],
            'noplaylist': True,
            'socket_timeout': 30,
        })
    else:
        if height and ffmpeg_dir:
            format_rule = (
                f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/"
                f"bestvideo[height<={height}]+bestaudio/"
                f"best[height<={height}]/best"
            )
        elif ffmpeg_dir:
            format_rule = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
        else:
            format_rule = f'best[height<={height}][ext=mp4]/best[ext=mp4]/best' if height else 'best[ext=mp4]/best'

        ydl_opts.update({
            'format': format_rule,
            'outtmpl': output_template,
            'merge_output_format': 'mp4' if ffmpeg_dir else None,
            'noplaylist': True,
            'socket_timeout': 30,
        })

    if ffmpeg_dir:
        ydl_opts['ffmpeg_location'] = ffmpeg_dir

    _, cached_raw = get_cached_video(url)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            if cached_raw:
                try:
                    # Aproveita a extração feita na tela de info, poupando 4 a 6 segundos!
                    ydl.process_ie_result(copy.deepcopy(cached_raw), download=True)
                    title = cached_raw.get('title', 'video')
                except Exception:
                    info = ydl.extract_info(url, download=True)
                    title = info.get('title', 'video')
            else:
                info = ydl.extract_info(url, download=True)
                title = info.get('title', 'video')

        matches = [
            f for f in glob.glob(os.path.join(DOWNLOAD_FOLDER, f"*{file_id}*"))
            if not f.endswith('.part') and not f.endswith('.ytdl')
        ]
        if not matches:
            matches = glob.glob(os.path.join(DOWNLOAD_FOLDER, f"*{file_id}*"))
            if not matches:
                update_progress(task_id, {'status': 'error', 'stage': 'Arquivo não encontrado'})
                return jsonify({"error": "Arquivo baixado não foi encontrado no servidor."}), 500

        actual_file = matches[0]
        ext = os.path.splitext(actual_file)[1] or ('.mp3' if media_type == 'audio' else '.mp4')
        safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()
        download_name = f"{safe_title}{ext}"

        update_progress(task_id, {
            'status': 'finished',
            'percent': 100,
            'stage': 'Download finalizado! Salvando no seu dispositivo...'
        })

        @after_this_request
        def cleanup(response):
            try:
                if os.path.exists(actual_file):
                    os.remove(actual_file)
            except Exception as ex:
                print(f"Erro ao limpar arquivo temporário: {ex}")
            return response

        return send_file(
            actual_file,
            as_attachment=True,
            download_name=download_name
        )

    except Exception as e:
        err_str = str(e)
        print(f"Erro no download: {err_str}")
        update_progress(task_id, {'status': 'error', 'stage': err_str})
        if is_youtube_bot_error(err_str):
            return jsonify({
                "error": "O YouTube solicitou verificação anti-bot para esta requisição. Adicione o arquivo cookies.txt na pasta backend ou configure a variável YOUTUBE_COOKIES no Render.",
                "is_bot_error": True
            }), 403
        return jsonify({"error": str(e)}), 500

@app.route('/redirect-download', methods=['GET'])
def redirect_download():
    """Redireciona o navegador diretamente para o Google Video (Google CDN), estilo ytultra."""
    target_url = request.args.get('url')
    if not target_url:
        return jsonify({"error": "URL de download não fornecida"}), 400
    return redirect(target_url, code=302)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
