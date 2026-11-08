export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  const { url } = req.body || {};
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Por favor, insira o link do vídeo do TikTok.' });
  }

  const cleanUrl = url.trim();
  if (!cleanUrl.includes('tiktok.com')) {
    return res.status(400).json({ error: 'O link informado não parece ser um link válido do TikTok.' });
  }

  try {
    // Segue redirecionamentos se for link curto (vt.tiktok.com / vm.tiktok.com)
    let targetUrl = cleanUrl;
    try {
      const headResp = await fetch(cleanUrl, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
      });
      if (headResp && headResp.url) {
        targetUrl = headResp.url;
      }
    } catch (headErr) {
      // Segue com a URL original se HEAD falhar
    }

    // Consulta API do TikWM (motor de alta velocidade e sem marca d'água)
    const tikwmResp = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      },
      body: new URLSearchParams({ url: targetUrl, hd: '1' }).toString()
    });

    const tikData = await tikwmResp.json();
    if (tikData.code !== 0) {
      return res.status(400).json({
        error: 'Não foi possível encontrar este vídeo do TikTok. Verifique se o link está correto e se o perfil não é privado.'
      });
    }

    const d = tikData.data || {};
    const author = d.author || {};

    const formatSize = (bytes) => {
      if (!bytes || bytes <= 0) return 'N/D';
      if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      return (bytes / 1024).toFixed(1) + ' KB';
    };

    const formatDuration = (seconds) => {
      if (!seconds) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const formatNumber = (num) => {
      if (!num) return '0';
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return String(num);
    };

    const options = [];

    // 1. Sem Marca d'Água HD (se disponível)
    if (d.hdplay) {
      options.push({
        id: 'nowatermark_hd',
        label: 'Sem Marca d\'Água (HD)',
        sublabel: 'Alta Definição Original',
        format: 'MP4',
        type: 'video',
        is_hd: true,
        url: d.hdplay,
        size: formatSize(d.hd_size || d.size)
      });
    }

    // 2. Sem Marca d'Água (Padrão)
    if (d.play) {
      options.push({
        id: 'nowatermark',
        label: 'Sem Marca d\'Água',
        sublabel: 'Versão Limpa Recomendada',
        format: 'MP4',
        type: 'video',
        is_hd: !d.hdplay,
        url: d.play,
        size: formatSize(d.size)
      });
    }

    // 3. Com Marca d'Água
    if (d.wmplay) {
      options.push({
        id: 'watermark',
        label: 'Com Marca d\'Água',
        sublabel: 'Original do App TikTok',
        format: 'MP4',
        type: 'video',
        is_hd: false,
        url: d.wmplay,
        size: formatSize(d.wm_size)
      });
    }

    // 4. Áudio MP3
    if (d.music) {
      const musicInfo = d.music_info || {};
      const musicTitle = musicInfo.title || 'Som Original';
      const musicAuthor = musicInfo.author || author.unique_id || 'tiktok';
      options.push({
        id: 'music',
        label: 'Baixar Áudio (MP3)',
        sublabel: `${musicTitle} • ${musicAuthor}`,
        format: 'MP3',
        type: 'audio',
        is_hd: false,
        url: d.music,
        size: 'Áudio Leve'
      });
    }

    return res.status(200).json({
      id: String(d.id || ''),
      title: d.title || `Vídeo de @${author.unique_id || 'tiktok'}`,
      cover: d.cover || d.origin_cover,
      duration: formatDuration(d.duration),
      author: {
        nickname: author.nickname || 'Criador do TikTok',
        unique_id: `@${author.unique_id || 'tiktok_user'}`,
        avatar: author.avatar
      },
      stats: {
        likes: formatNumber(d.digg_count),
        comments: formatNumber(d.comment_count),
        shares: formatNumber(d.share_count),
        views: formatNumber(d.play_count)
      },
      options,
      images: d.images || [],
      is_slideshow: Array.isArray(d.images) && d.images.length > 0
    });

  } catch (err) {
    console.error('Erro na rota /api/info:', err);
    return res.status(500).json({
      error: 'Erro ao consultar vídeo no TikTok: ' + (err.message || 'Falha de conexão')
    });
  }
}

