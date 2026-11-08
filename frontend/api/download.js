import { Readable } from 'stream';
import archiver from 'archiver';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Suporte a POST (body JSON) e GET (query params)
  const data = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const { downloadUrl, optionId, type, title = 'tiktok_video', author = 'tiktok', images } = data;

  const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const safeAuthor = (author || 'tiktok').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);

  // Caso seja download de todas as fotos do carrossel em formato ZIP
  if (optionId === 'all_images' && Array.isArray(images) && images.length > 0) {
    const zipFilename = `${safeAuthor}_${safeTitle}_fotos.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (let i = 0; i < images.length; i++) {
      try {
        const imgResp = await fetch(images[i], {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.tiktok.com/'
          }
        });
        if (imgResp.ok) {
          const arrayBuf = await imgResp.arrayBuffer();
          const num = String(i + 1).padStart(2, '0');
          archive.append(Buffer.from(arrayBuf), { name: `foto_${num}.jpg` });
        }
      } catch (e) {
        console.warn(`Erro ao baixar imagem ${i}:`, e.message);
      }
    }

    await archive.finalize();
    return;
  }

  // Caso seja streaming de vídeo MP4 ou áudio MP3
  if (!downloadUrl) {
    return res.status(400).json({ error: 'URL de download não fornecida.' });
  }

  try {
    const ext = type === 'audio' || optionId === 'music' ? 'mp3' : 'mp4';
    const filename = `${safeAuthor}_${safeTitle}_${optionId || 'video'}.${ext}`;

    const streamResp = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      }
    });

    if (!streamResp.ok) {
      return res.status(streamResp.status).json({ error: 'Falha ao conectar com o CDN do TikTok.' });
    }

    const contentType = ext === 'mp3' ? 'audio/mpeg' : 'video/mp4';
    const contentLength = streamResp.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Pipe nativo direto do WebStream para a Response do Node.js
    Readable.fromWeb(streamResp.body).pipe(res);

  } catch (err) {
    console.error('Erro no streaming de download:', err);
    return res.status(500).json({ error: 'Erro durante o streaming do arquivo: ' + err.message });
  }
}

