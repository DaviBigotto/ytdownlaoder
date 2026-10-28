from flask import Flask, request, send_file, jsonify, after_this_request, redirect, Response, stream_with_context
from flask_cors import CORS
import yt_dlp
import os
import uuid
import glob
import shutil
import threading
import time
import urllib.request
import urllib.parse
import subprocess
import copy
import sys
import re

app = Flask(__name__)
CORS(app)

# Cache em memória para análises recentes de vídeos (evita reprocessamento repetido)
VIDEO_INFO_CACHE = {}
CACHE_LOCK = threading.Lock()
CACHE_TTL = 900  # 15 minutos

def extract_video_id(url_str):
    if not url_str:
        return None
    match = re.search(r'(?:v=|\/|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})', url_str)
    if match:
        return match.group(1)
    return url_str.strip().split('?')[0].split('&')[0]

def get_cached_video(url_str):
    if not url_str:
        return None, None
    vid_id = extract_video_id(url_str) or url_str.strip()
    now = time.time()
    with CACHE_LOCK:
        if vid_id in VIDEO_INFO_CACHE:
            ts, formatted, raw = VIDEO_INFO_CACHE[vid_id]
            if now - ts < CACHE_TTL:
                return formatted, raw
            else:
                del VIDEO_INFO_CACHE[vid_id]
    return None, None

def set_cached_video(url_str, formatted, raw):
    if not url_str:
        return
    vid_id = extract_video_id(url_str) or url_str.strip()
    now = time.time()
    with CACHE_LOCK:
        if len(VIDEO_INFO_CACHE) > 100:
            expired = [k for k, (t, _, _) in VIDEO_INFO_CACHE.items() if now - t > CACHE_TTL]
            for k in expired:
                del VIDEO_INFO_CACHE[k]
        VIDEO_INFO_CACHE[vid_id] = (now, formatted, raw)

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
        or "please sign in" in normalized
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

def get_ffmpeg_executable():
    """Localiza o binário do FFmpeg no sistema ou variáveis de ambiente."""
    system_ffmpeg = shutil.which('ffmpeg')
    if system_ffmpeg:
        return system_ffmpeg
    f_dir = get_ffmpeg_dir()
    if f_dir:
        cand = os.path.join(f_dir, 'ffmpeg.exe' if os.name == 'nt' else 'ffmpeg')
        if os.path.exists(cand):
            return cand
    return 'ffmpeg'

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
    data = request.get_json(silent=True) or {}
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

def get_media_stream_urls(url, height=None, media_type='video'):
    """
    Retorna (title, video_url, audio_url, has_audio, video_headers, audio_headers) prontos para streaming.
    Utiliza o cache da análise de /info se disponível, ou faz extração rápida.
    """
    formatted, raw = get_cached_video(url)
    if not raw:
        pot_active = is_pot_provider_available()
        ydl_opts = get_base_ydl_opts(use_proxy=False if pot_active else True)
        ydl_opts['skip_download'] = True
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                raw = ydl.extract_info(url, download=False)
        except Exception as first_err:
            if PROXY_URL and not ydl_opts.get('proxy'):
                ydl_opts_proxy = get_base_ydl_opts(use_proxy=True)
                ydl_opts_proxy.update({'skip_download': True})
                with yt_dlp.YoutubeDL(ydl_opts_proxy) as ydl_proxy:
                    raw = ydl_proxy.extract_info(url, download=False)
            else:
                raise first_err

    title = (formatted.get('title') if formatted else None) or (raw.get('title') if raw else "video")
    formats = raw.get('formats', []) if raw else []

    # Caso 1: Apenas Áudio (MP3)
    if media_type == 'audio':
        best_audio = None
        for f in formats:
            if f.get('vcodec') == 'none' and f.get('acodec') != 'none' and f.get('url'):
                if not best_audio or (f.get('tbr') or 0) > (best_audio.get('tbr') or 0):
                    best_audio = f
        audio_url = best_audio.get('url') if best_audio else None
        audio_headers = best_audio.get('http_headers') if best_audio else None
        return title, None, audio_url, False, None, audio_headers

    # Caso 2: Vídeo (MP4)
    target_h = None
    if height:
        try:
            target_h = int(height)
        except (ValueError, TypeError):
            pass

    # Filtra formatos de vídeo válidos
    v_candidates = [
        f for f in formats 
        if f.get('vcodec') and f.get('vcodec') != 'none' and f.get('url') and f.get('height')
    ]

    chosen_video = None
    if target_h and v_candidates:
        # Busca formatos compatíveis com a altura solicitada (+- 15px de tolerância)
        h_matches = [f for f in v_candidates if abs(f['height'] - target_h) <= 15]
        if h_matches:
            # Prioriza:
            # 1) Formato com áudio embutido se existir
            # 2) Formato MP4 / H.264 (avc1)
            # 3) Maior taxa de bits (tbr)
            h_matches.sort(key=lambda x: (
                1 if (x.get('acodec') and x.get('acodec') != 'none') else 0,
                1 if x.get('ext') == 'mp4' else 0,
                x.get('tbr') or 0
            ), reverse=True)
            chosen_video = h_matches[0]

    if not chosen_video and v_candidates:
        # Fallback: seleciona o melhor vídeo em resolução e qualidade
        v_candidates.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)
        chosen_video = v_candidates[0]

    if not chosen_video:
        return title, None, None, False, None, None

    video_url = chosen_video.get('url')
    video_headers = chosen_video.get('http_headers')
    has_audio = bool(chosen_video.get('acodec') and chosen_video.get('acodec') != 'none')

    audio_url = None
    audio_headers = None
    if not has_audio:
        # Busca o melhor áudio puro. Prioriza áudio M4A / AAC para cópia rápida e sincronia perfeita
        m4a_candidates = [
            f for f in formats
            if f.get('vcodec') == 'none' and f.get('acodec') != 'none' and f.get('url')
            and (f.get('ext') == 'm4a' or 'mp4a' in str(f.get('acodec', '')).lower())
        ]
        if m4a_candidates:
            m4a_candidates.sort(key=lambda x: x.get('tbr') or 0, reverse=True)
            chosen_audio = m4a_candidates[0]
            audio_url = chosen_audio.get('url')
            audio_headers = chosen_audio.get('http_headers')
        else:
            all_audios = [
                f for f in formats
                if f.get('vcodec') == 'none' and f.get('acodec') != 'none' and f.get('url')
            ]
            if all_audios:
                all_audios.sort(key=lambda x: x.get('tbr') or 0, reverse=True)
                chosen_audio = all_audios[0]
                audio_url = chosen_audio.get('url')
                audio_headers = chosen_audio.get('http_headers')

    return title, video_url, audio_url, has_audio, video_headers, audio_headers

def stream_media_ffmpeg(video_url, audio_url, download_filename, media_type='video', bitrate='192', video_headers=None, audio_headers=None):
    """
    Executa o FFmpeg conectado diretamente aos streams assinados do Google Video (via PO Token).
    Mescla e transcodifica os dados diretamente no pipe stdout, sem salvar nenhum byte em disco no servidor.
    """
    ffmpeg_bin = get_ffmpeg_executable()
    default_ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    def format_headers(h_dict):
        if not h_dict:
            return f"User-Agent: {default_ua}\r\n"
        headers_copy = dict(h_dict)
        if not any(k.lower() == 'user-agent' for k in headers_copy.keys()):
            headers_copy['User-Agent'] = default_ua
        return "".join(f"{k}: {v}\r\n" for k, v in headers_copy.items())

    v_headers = format_headers(video_headers)
    a_headers = format_headers(audio_headers)

    proxy_args = []
    if PROXY_URL and PROXY_URL.startswith(('http://', 'https://')):
        proxy_args = ['-http_proxy', PROXY_URL]

    if media_type == 'audio':
        cmd = [
            ffmpeg_bin,
            '-y',
            '-loglevel', 'error',
            *proxy_args,
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-headers', a_headers,
            '-i', audio_url,
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', f'{bitrate}k',
            '-f', 'mp3',
            'pipe:1'
        ]
        mimetype = 'audio/mpeg'
    elif video_url and audio_url:
        cmd = [
            ffmpeg_bin,
            '-y',
            '-loglevel', 'error',
            *proxy_args,
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-headers', v_headers,
            '-i', video_url,
            *proxy_args,
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-headers', a_headers,
            '-i', audio_url,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            'pipe:1'
        ]
        mimetype = 'video/mp4'
    else:
        # Vídeo único que já contém áudio embutido
        cmd = [
            ffmpeg_bin,
            '-y',
            '-loglevel', 'error',
            *proxy_args,
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-headers', v_headers,
            '-i', video_url,
            '-c', 'copy',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            'pipe:1'
        ]
        mimetype = 'video/mp4'

    env = os.environ.copy()
    if PROXY_URL:
        env['http_proxy'] = PROXY_URL
        env['https_proxy'] = PROXY_URL
        env['HTTP_PROXY'] = PROXY_URL
        env['HTTPS_PROXY'] = PROXY_URL
        env['ALL_PROXY'] = PROXY_URL
        env['all_proxy'] = PROXY_URL

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=65536,
            env=env
        )
    except Exception as e:
        return jsonify({"error": f"Falha ao iniciar processo de stream FFmpeg: {str(e)}"}), 500

    # Valida leitura inicial para garantir que o FFmpeg conectou com sucesso
    first_chunk = proc.stdout.read(65536)
    if not first_chunk:
        err_msg = ""
        if proc.stderr:
            try:
                err_msg = proc.stderr.read().decode('utf-8', errors='ignore')
            except Exception:
                pass
        try:
            proc.kill()
        except Exception:
            pass
        return jsonify({"error": f"Falha ao conectar aos servidores de mídia do YouTube: {err_msg or 'Fluxo vazio'}"}), 500

    def generate():
        yield first_chunk
        try:
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        except GeneratorExit:
            # Download cancelado ou finalizado pelo navegador do cliente
            pass
        except Exception as ex:
            print(f"Exceção durante transmissão do stream: {ex}")
        finally:
            try:
                if proc.stdout:
                    proc.stdout.close()
            except Exception:
                pass
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass

    safe_name = "".join(c for c in download_filename if c.isalnum() or c in (' ', '-', '_', '.', '(', ')')).strip()
    if not safe_name:
        safe_name = "download" + (".mp3" if media_type == 'audio' else ".mp4")
    encoded_name = urllib.parse.quote(safe_name)

    headers = {
        'Content-Type': mimetype,
        'Content-Disposition': f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{encoded_name}',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Accel-Buffering': 'no'
    }

    return Response(
        stream_with_context(generate()),
        headers=headers,
        mimetype=mimetype
    )

@app.route('/download-stream', methods=['GET', 'POST'])
def download_stream():
    """
    Endpoint de streaming direto de alta performance para o navegador.
    Mescla vídeo e áudio em tempo real via FFmpeg sem tocar no disco do servidor.
    """
    json_data = request.get_json(silent=True) or {}
    url = (request.args.get('url') or json_data.get('url', '')).strip()
    media_type = request.args.get('type') or json_data.get('type') or 'video'
    height = request.args.get('height') or json_data.get('height') or None
    bitrate = request.args.get('bitrate') or json_data.get('bitrate') or '192'
    custom_title = request.args.get('title') or json_data.get('title') or None

    if not url:
        return jsonify({"error": "URL é obrigatória"}), 400

    try:
        title, video_url, audio_url, has_audio, v_headers, a_headers = get_media_stream_urls(url, height=height, media_type=media_type)
    except Exception as e:
        err_str = str(e)
        if is_youtube_bot_error(err_str):
            return jsonify({
                "error": "O YouTube solicitou verificação anti-bot. Tente novamente em alguns segundos ou adicione cookies.",
                "is_bot_error": True
            }), 403
        return jsonify({"error": f"Erro ao extrair fluxos de mídia: {err_str}"}), 500

    final_title = custom_title or title or "video"
    if media_type == 'audio':
        if not audio_url:
            return jsonify({"error": "Fluxo de áudio não encontrado para este vídeo."}), 404
        filename = f"{final_title}.mp3"
        return stream_media_ffmpeg(None, audio_url, filename, media_type='audio', bitrate=bitrate, audio_headers=a_headers)
    else:
        if not video_url:
            return jsonify({"error": "Fluxo de vídeo não encontrado na resolução solicitada."}), 404
        filename = f"{final_title}_{height or 'HD'}.mp4"
        return stream_media_ffmpeg(video_url, audio_url if not has_audio else None, filename, media_type='video', video_headers=v_headers, audio_headers=a_headers)

@app.route('/download', methods=['POST'])
def download_video():
    """
    Compatibilidade com endpoint POST /download legado, agora utilizando FFmpeg stream-piping
    para evitar esgotamento de disco e memória no servidor.
    """
    return download_stream()

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
