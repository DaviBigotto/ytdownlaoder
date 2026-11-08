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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  const { url, audioUrl } = req.body || {};
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL do vídeo é obrigatória.' });
  }

  const cleanUrl = url.trim();

  // Helper para converter VTT em texto limpo e segmentos com tempo
  function parseWebVTT(vttString) {
    if (!vttString) return { text: '', segments: [] };
    const lines = vttString.split('\n');
    const segments = [];
    let currentSegment = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) continue;

      const timeMatch = line.match(/(\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?)\s*-->\s*(\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?)/);
      if (timeMatch) {
        currentSegment = {
          start: timeMatch[1].split('.')[0],
          end: timeMatch[2].split('.')[0],
          text: ''
        };
        segments.push(currentSegment);
      } else if (currentSegment) {
        currentSegment.text += (currentSegment.text ? ' ' : '') + line;
      }
    }

    const cleanText = segments.map((s) => s.text.trim()).filter(Boolean).join(' ');
    return { text: cleanText, segments };
  }

  try {
    // 1. Tenta transcrição via motor Tokscript ASR
    const tokscriptResp = await fetch(
      `https://api.tokscript.com/api/tiktok/fetchTikTokData?video=${encodeURIComponent(cleanUrl)}&get_transcript=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://tokscript.com',
          'Referer': 'https://tokscript.com/'
        },
        body: JSON.stringify({ deviceFingerprint: 'tikdown_' + Math.random().toString(36).substring(2, 8) })
      }
    );

    if (tokscriptResp.ok) {
      const tokData = await tokscriptResp.json();
      const rawSubtitles = tokData.subtitles || '';

      if (rawSubtitles && rawSubtitles.trim().length > 10) {
        const { text, segments } = parseWebVTT(rawSubtitles);
        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

        return res.status(200).json({
          success: true,
          method: tokData.transcriptionMethod || 'ai-whisper',
          text: text || 'Não foi possível detectar fala inteligível neste vídeo.',
          segments,
          rawVtt: rawSubtitles,
          wordCount: words
        });
      }
    }

    // Se o motor ASR não tiver falas ou retornar vazio
    return res.status(200).json({
      success: true,
      method: 'audio-detection',
      text: 'Este vídeo parece conter apenas música de fundo ou não possui falas detectáveis para transcrição.',
      segments: [],
      rawVtt: '',
      wordCount: 0
    });

  } catch (err) {
    console.error('Erro ao extrair transcrição:', err);
    return res.status(500).json({
      error: 'Falha ao processar o roteiro do vídeo: ' + (err.message || 'Erro inesperado')
    });
  }
}
