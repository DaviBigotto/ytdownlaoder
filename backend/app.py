from flask import Flask, request, send_file, jsonify, after_this_request
from flask_cors import CORS
import yt_dlp
import os
import uuid
import glob
import shutil

app = Flask(__name__)
CORS(app)

# Pasta temporária com caminho absoluto
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_FOLDER = os.path.join(BASE_DIR, 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
COOKIES_FILE = os.path.join(BASE_DIR, 'cookies.txt')

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

def get_node_path():
    """Localiza o executável do Node.js para os desafios JavaScript do YouTube."""
    system_node = shutil.which('node')
    if system_node:
        return system_node
    default_node = r'C:\Program Files\nodejs\node.exe'
    if os.path.exists(default_node):
        return default_node
    return None

def get_base_ydl_opts():
    """Retorna as opções base para contornar proteções e desafios do YouTube."""
    opts = {
        'quiet': False,
        'no_warnings': False,
        'remote_components': ['ejs:github'],
    }

    node_path = get_node_path()
    if node_path:
        opts['js_runtimes'] = {'node': {'path': node_path}}

    # Se o usuário tiver colocado cookies.txt na pasta backend, usa automaticamente
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
    return jsonify({
        "status": "online",
        "message": "Servidor Backend Flask rodando com sucesso!",
        "frontend_url": "http://localhost:5173",
        "ffmpeg_ready": get_ffmpeg_dir() is not None,
        "has_cookies": os.path.exists(COOKIES_FILE)
    })

@app.route('/info', methods=['POST'])
def video_info():
    data = request.json or {}
    url = data.get('url', '').strip()

    if not url:
        return jsonify({"error": "URL é obrigatória"}), 400

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'skip_download': True,
    })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            title = info.get('title', 'Vídeo do YouTube')
            thumbnail = info.get('thumbnail')
            duration = info.get('duration', 0)
            uploader = info.get('uploader') or info.get('channel', 'Desconhecido')

            # Localizar melhor faixa de áudio para somar estimativa de tamanho
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

            # Mapeamento e agrupamento de qualidades de vídeo
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

                total_size = (v_size or 0) + (best_audio_size if f.get('acodec') == 'none' else 0)

                if matched_standard not in video_formats_by_height or total_size > video_formats_by_height[matched_standard]['raw_size']:
                    lbl, sub_lbl = quality_labels.get(matched_standard, (f"{matched_standard}p", ""))
                    video_formats_by_height[matched_standard] = {
                        'height': matched_standard,
                        'quality': lbl,
                        'label': sub_lbl,
                        'format': 'MP4',
                        'raw_size': total_size,
                        'size': format_size(total_size)
                    }

            video_list = [
                video_formats_by_height[k]
                for k in sorted(video_formats_by_height.keys(), reverse=True)
            ]

            # Opções de Áudio (MP3)
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
                    'size': format_size(est_bytes)
                })

            return jsonify({
                "title": title,
                "thumbnail": thumbnail,
                "duration": format_duration(duration),
                "uploader": uploader,
                "videos": video_list,
                "audios": audio_list
            })

    except Exception as e:
        err_str = str(e)
        print(f"Erro ao obter info: {err_str}")
        if "Sign in to confirm you're not a bot" in err_str:
            return jsonify({
                "error": "O YouTube solicitou verificação anti-bot para esta requisição. Adicione o arquivo cookies.txt na pasta backend para liberar qualquer vídeo.",
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
    
    if not url:
        return jsonify({"error": "URL é obrigatória"}), 400

    file_id = str(uuid.uuid4())[:8]
    output_template = os.path.join(DOWNLOAD_FOLDER, f"%(title)s_{file_id}.%(ext)s")
    ffmpeg_dir = get_ffmpeg_dir()

    ydl_opts = get_base_ydl_opts()

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

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'video')

            matches = [
                f for f in glob.glob(os.path.join(DOWNLOAD_FOLDER, f"*{file_id}*"))
                if not f.endswith('.part') and not f.endswith('.ytdl')
            ]
            if not matches:
                matches = glob.glob(os.path.join(DOWNLOAD_FOLDER, f"*{file_id}*"))
                if not matches:
                    return jsonify({"error": "Arquivo baixado não foi encontrado no servidor."}), 500

            actual_file = matches[0]
            ext = os.path.splitext(actual_file)[1] or ('.mp3' if media_type == 'audio' else '.mp4')
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()
            download_name = f"{safe_title}{ext}"

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
        if "Sign in to confirm you're not a bot" in err_str:
            return jsonify({
                "error": "O YouTube solicitou verificação anti-bot para esta requisição. Adicione o arquivo cookies.txt na pasta backend para liberar.",
                "is_bot_error": True
            }), 403
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
