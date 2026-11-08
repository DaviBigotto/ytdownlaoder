import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, 
  Link as LinkIcon, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Music, 
  Sparkles, 
  Play, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Heart, 
  MessageCircle, 
  Eye, 
  Clipboard, 
  X, 
  Image as ImageIcon,
  Activity,
  Timer,
  Check,
  Film,
  Archive,
  History,
  Trash2,
  FileText,
  Copy,
  AlignLeft,
  Bot
} from 'lucide-react';
import AdBanner from './components/AdBanner';
import { AD_CONFIG } from './adConfig';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

export default function App() {
  const [url, setUrl] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedClipboard, setCopiedClipboard] = useState(false);

  // Modal de Pré-visualização do Vídeo
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState('');

  // Aba ativa e Transcrição com IA
  const [activeTab, setActiveTab] = useState('download'); // 'download' | 'transcript'
  const [transcriptData, setTranscriptData] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);

  // Histórico Local de Vídeos Recentes
  const [recentHistory, setRecentHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tikdown_history') || '[]');
    } catch {
      return [];
    }
  });

  // Estado da Barra de Progresso em Tempo Real
  const [progressData, setProgressData] = useState(null);
  const pollingRef = useRef(null);

  // Salva histórico no localStorage
  const saveToHistory = (item) => {
    setRecentHistory((prev) => {
      const filtered = prev.filter((p) => p.url !== item.url);
      const updated = [item, ...filtered].slice(0, 6);
      try {
        localStorage.setItem('tikdown_history', JSON.stringify(updated));
      } catch (e) {
        console.warn('Erro ao salvar histórico:', e);
      }
      return updated;
    });
  };

  // Limpa o histórico
  const handleClearHistory = () => {
    setRecentHistory([]);
    try {
      localStorage.removeItem('tikdown_history');
    } catch (e) {
      console.warn('Erro ao limpar histórico:', e);
    }
  };

  // Cola link diretamente da área de transferência
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setCopiedClipboard(true);
        setTimeout(() => setCopiedClipboard(false), 2000);
      }
    } catch (err) {
      console.warn('Permissão de área de transferência negada ou indisponível:', err);
    }
  };

  // Limpa o input
  const handleClear = () => {
    setUrl('');
    setVideoData(null);
    setErrorMessage('');
    setSuccessMessage('');
    setProgressData(null);
    setTranscriptData(null);
    setActiveTab('download');
  };

  // Busca os dados do vídeo e opções sem marca d'água
  const handleFetchInfo = async (e, customUrl) => {
    if (e) e.preventDefault();
    const targetUrl = (customUrl || url).trim();
    if (!targetUrl) return;

    if (customUrl) setUrl(customUrl);

    setLoadingInfo(true);
    setErrorMessage('');
    setSuccessMessage('');
    setVideoData(null);
    setProgressData(null);
    setTranscriptData(null);
    setActiveTab('download');

    try {
      const response = await fetch(`${API_BASE}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível analisar este vídeo do TikTok.');
      }

      setVideoData({ ...data, targetUrl });

      // Salva no histórico
      saveToHistory({
        id: data.id,
        title: data.title,
        cover: data.cover,
        url: targetUrl,
        nickname: data.author?.nickname,
        unique_id: data.author?.unique_id,
        timestamp: Date.now()
      });

    } catch (err) {
      setErrorMessage(err.message || 'Erro ao conectar com o servidor backend.');
    } finally {
      setLoadingInfo(false);
    }
  };

  // Extrai roteiro / transcrição com IA
  const handleFetchTranscript = async () => {
    const targetUrl = videoData?.targetUrl || url.trim();
    if (!targetUrl) return;

    setLoadingTranscript(true);
    setErrorMessage('');

    try {
      const resp = await fetch(`${API_BASE}/api/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Falha ao processar o roteiro');
      }

      setTranscriptData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Erro ao extrair transcrição do vídeo.');
    } finally {
      setLoadingTranscript(false);
    }
  };

  // Copia o texto do roteiro
  const handleCopyTranscript = () => {
    if (!transcriptData?.text) return;
    const content = showTimestamps && transcriptData.segments?.length
      ? transcriptData.segments.map(s => `[${s.start} - ${s.end}] ${s.text}`).join('\n')
      : transcriptData.text;

    navigator.clipboard.writeText(content);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  // Copia prompt formatado para ChatGPT
  const handleCopyPrompt = () => {
    if (!transcriptData?.text) return;
    const prompt = `Analise a estrutura do roteiro viral do TikTok abaixo (gancho, retenção e chamada para ação) e crie um novo roteiro persuasivo de 30 a 60 segundos com a mesma fórmula:\n\nROTEIRO ORIGINAL:\n"${transcriptData.text}"`;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Baixa o roteiro em arquivo TXT
  const handleDownloadTxt = () => {
    if (!transcriptData?.text) return;
    const content = showTimestamps && transcriptData.segments?.length
      ? transcriptData.segments.map(s => `[${s.start} - ${s.end}] ${s.text}`).join('\n')
      : transcriptData.text;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${videoData?.author?.unique_id || 'tiktok'}_roteiro.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  // Dispara o download da opção selecionada (Sem Marca d'Água, Com Marca d'Água ou MP3)
  const handleDownloadOption = async (option) => {
    // Abre anúncio apenas ao clicar no botão de baixar sem marca d'água
    if (AD_CONFIG.DIRECT_LINK_URL && (option.id === 'nowatermark' || option.id === 'nowatermark_hd')) {
      try {
        window.open(AD_CONFIG.DIRECT_LINK_URL, '_blank');
      } catch (e) {
        console.warn('Popup bloqueado pelo navegador:', e);
      }
    }

    const taskId = 'tk_' + Math.random().toString(36).substring(2, 9);
    
    setDownloadingId(option.id);
    setErrorMessage('');
    setSuccessMessage('');

    setProgressData({
      taskId,
      label: option.label,
      format: option.format,
      percent: 15,
      speed: '',
      eta: 'Conectando...',
      downloaded: '',
      total: option.size || '',
      stage: 'Conectando ao CDN de alta velocidade...',
    });

    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/progress/${taskId}`);
        if (res.ok) {
          const p = await res.json();
          setProgressData((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              percent: Math.max(prev.percent, p.percent || 15),
              speed: p.speed || prev.speed,
              eta: p.eta || prev.eta,
              downloaded: p.downloaded || prev.downloaded,
              total: p.total || prev.total,
              stage: p.stage || prev.stage,
            };
          });
        }
      } catch (err) {
        // Ignora erros temporários de rede
      }
    }, 400);

    try {
      const payload = {
        url: url.trim(),
        downloadUrl: option.url,
        optionId: option.id,
        type: option.type,
        title: videoData.title,
        author: videoData.author?.unique_id?.replace('@', '') || 'tiktok',
        taskId: taskId,
      };

      const response = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao processar o download.');
      }

      // Leitura do stream em tempo real direto pelo navegador
      const contentLength = +response.headers.get('Content-Length') || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;

        const percent = contentLength > 0
          ? Math.min(Math.round((receivedLength / contentLength) * 100), 99)
          : Math.min(20 + Math.round((receivedLength / (8 * 1024 * 1024)) * 75), 95);

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = elapsedSec > 0 ? (receivedLength / elapsedSec) : 0;

        setProgressData((prev) => prev ? {
          ...prev,
          percent,
          speed: formatBytes(speed) + '/s',
          downloaded: formatBytes(receivedLength),
          total: contentLength > 0 ? formatBytes(contentLength) : prev.total,
          stage: 'Baixando em alta velocidade...'
        } : null);
      }

      if (pollingRef.current) clearInterval(pollingRef.current);
      setProgressData((prev) => prev ? {
        ...prev,
        percent: 100,
        stage: 'Download concluído! Salvando arquivo...',
        eta: 'Concluído'
      } : null);

      let filename = option.type === 'audio' 
        ? `${videoData.author?.unique_id || 'tiktok'}_audio.mp3`
        : `${videoData.author?.unique_id || 'tiktok'}_sem_marca.mp4`;

      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^"';]+)['"]?/i);
        if (match && match[1]) filename = decodeURIComponent(match[1]);
      }

      const blob = new Blob(chunks);
      const downloadBlobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadBlobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadBlobUrl);

      setSuccessMessage(`Download de "${option.label}" concluído com sucesso!`);
      
      setTimeout(() => {
        setProgressData(null);
      }, 3500);

    } catch (err) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setProgressData(null);
      setErrorMessage(err.message || 'Erro durante o download do vídeo.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Download de todas as imagens em ZIP
  const handleDownloadAllImagesZip = async () => {
    if (!videoData?.images?.length) return;
    const taskId = 'zip_' + Math.random().toString(36).substring(2, 9);
    
    setDownloadingId('all_images');
    setErrorMessage('');
    setSuccessMessage('');

    setProgressData({
      taskId,
      label: 'Fotos do Carrossel (.ZIP)',
      format: 'ZIP',
      percent: 15,
      speed: '',
      eta: 'Compactando...',
      downloaded: '',
      total: `${videoData.images.length} fotos`,
      stage: 'Baixando e compactando imagens em arquivo ZIP...',
    });

    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/progress/${taskId}`);
        if (res.ok) {
          const p = await res.json();
          setProgressData((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              percent: Math.max(prev.percent, p.percent || 15),
              speed: p.speed || prev.speed,
              eta: p.eta || prev.eta,
              downloaded: p.downloaded || prev.downloaded,
              total: p.total || prev.total,
              stage: p.stage || prev.stage,
            };
          });
        }
      } catch (err) {
        // Ignora erros temporários
      }
    }, 400);

    try {
      const payload = {
        url: url.trim(),
        optionId: 'all_images',
        type: 'zip',
        images: videoData.images,
        title: videoData.title,
        author: videoData.author?.unique_id?.replace('@', '') || 'tiktok',
        taskId: taskId,
      };

      const response = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao compactar imagens.');
      }

      const contentLength = +response.headers.get('Content-Length') || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;

        const percent = contentLength > 0
          ? Math.min(Math.round((receivedLength / contentLength) * 100), 99)
          : Math.min(25 + Math.round((receivedLength / (5 * 1024 * 1024)) * 70), 95);

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = elapsedSec > 0 ? (receivedLength / elapsedSec) : 0;

        setProgressData((prev) => prev ? {
          ...prev,
          percent,
          speed: formatBytes(speed) + '/s',
          downloaded: formatBytes(receivedLength),
          stage: 'Compactando e baixando ZIP...'
        } : null);
      }

      if (pollingRef.current) clearInterval(pollingRef.current);
      setProgressData((prev) => prev ? {
        ...prev,
        percent: 100,
        stage: 'Arquivo ZIP pronto! Baixando...',
        eta: 'Concluído'
      } : null);

      let filename = `${videoData.author?.unique_id || 'tiktok'}_fotos.zip`;
      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^"';]+)['"]?/i);
        if (match && match[1]) filename = decodeURIComponent(match[1]);
      }

      const blob = new Blob(chunks);
      const downloadBlobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadBlobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadBlobUrl);

      setSuccessMessage(`Todas as ${videoData.images.length} fotos foram baixadas em ZIP!`);
      setTimeout(() => setProgressData(null), 3500);

    } catch (err) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setProgressData(null);
      setErrorMessage(err.message || 'Erro ao baixar o arquivo ZIP.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Download direto de imagem do carrossel
  const handleDownloadImage = async (imgUrl, index) => {
    try {
      const resp = await fetch(imgUrl);
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `tiktok_foto_${index + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(imgUrl, '_blank');
    }
  };

  // Abre o modal de pré-visualização do vídeo
  const handleOpenPreview = () => {
    const cleanVideoOption = videoData?.options?.find(o => o.id === 'nowatermark' || o.id === 'nowatermark_hd');
    if (cleanVideoOption?.url) {
      setPreviewVideoUrl(cleanVideoOption.url);
      setShowPreviewModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans selection:bg-[#fe2c55] selection:text-white relative tiktok-glow-bg">
      
      {/* Navbar Superior */}
      <header className="border-b border-white/[0.06] bg-[#090a0f]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          
          {/* Logo TikDown */}
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.location.reload()}>
            <div className="relative w-11 h-11 rounded-2xl overflow-hidden border border-white/10 shadow-lg shadow-black/80 flex items-center justify-center bg-gradient-to-br from-[#090a0f] to-[#12131a] group-hover:border-[#00f2fe]/50 transition-all duration-300">
              <svg className="w-6 h-6 text-[#00f2fe] drop-shadow-[0_0_8px_rgba(0,242,254,0.6)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.89 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.35 0 .68.06 1 .17V9.45a6.38 6.38 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.71a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.05a8.31 8.31 0 0 0 3.91 1.05V6.69z" />
              </svg>
            </div>
            <div>
              <span className="font-extrabold text-xl sm:text-2xl tracking-tight text-white flex items-center gap-0.5">
                TIK<span className="text-[#00f2fe]">DOWN</span>
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-widest text-[#fe2c55]">
                Sem Marca d'Água
              </span>
            </div>
          </div>

          {/* Badges de Destaque */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-3 text-xs text-zinc-400 font-medium mr-2">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                <Zap className="w-3.5 h-3.5 text-[#00f2fe]" /> Instantâneo
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Sem Marca d'Água
              </span>
            </div>
            <span className="px-3 py-1 text-[11px] font-bold tracking-wider rounded-full bg-gradient-to-r from-[#00f2fe]/20 to-[#fe2c55]/20 text-white border border-white/10 uppercase">
              100% Grátis
            </span>
          </div>

        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-12 flex flex-col items-center">
        
        {/* Hero Section */}
        <div className="text-center max-w-2xl mb-10 space-y-3.5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-semibold text-zinc-300 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#00f2fe]" />
            <span>Downloader do TikTok em Alta Definição (HD)</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
            Baixe vídeos do TikTok <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f2fe] via-sky-400 to-[#fe2c55]">
              sem marca d'água
            </span>.
          </h1>
          
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Cole o link do TikTok (app ou navegador) para baixar o vídeo limpo em MP4 ou extrair apenas o áudio em MP3.
          </p>
        </div>

        {/* Input Bar Estilo Moderno */}
        <form onSubmit={handleFetchInfo} className="w-full max-w-2xl mb-4 group">
          <div className="relative flex flex-col sm:flex-row gap-2.5 p-2 bg-[#12141c] rounded-2xl border border-white/[0.1] shadow-2xl shadow-black/80 focus-within:border-[#00f2fe]/60 focus-within:shadow-[0_0_35px_-5px_rgba(0,242,254,0.25)] transition-all duration-300">
            
            <div className="relative flex-1 flex items-center">
              <div className="absolute left-4 text-zinc-500 group-focus-within:text-[#00f2fe] transition-colors duration-200">
                <LinkIcon className="w-5 h-5" />
              </div>

              <input
                type="text"
                placeholder="Cole o link do TikTok aqui (ex: https://vm.tiktok.com/...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loadingInfo}
                className="w-full pl-12 pr-20 py-3.5 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none font-medium"
              />

              {/* Botões Utilitários dentro do input: Colar e Limpar */}
              <div className="absolute right-2 flex items-center gap-1">
                {url ? (
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Limpar campo"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePaste}
                    title="Colar da área de transferência"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    {copiedClipboard ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Colado</span>
                      </>
                    ) : (
                      <>
                        <Clipboard className="w-3.5 h-3.5 text-[#00f2fe]" />
                        <span>Colar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingInfo || !url.trim()}
              className="px-8 py-3.5 bg-gradient-to-r from-[#00f2fe] to-[#fe2c55] hover:brightness-110 disabled:opacity-40 text-black font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#00f2fe]/20 active:scale-[0.98] text-sm tracking-wide cursor-pointer disabled:cursor-not-allowed"
            >
              {loadingInfo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Obtendo...</span>
                </>
              ) : (
                <>
                  <span>Baixar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Alertas de Feedback */}
        {errorMessage && (
          <div className="w-full max-w-2xl mb-6 p-4 rounded-2xl bg-red-950/40 border border-red-800/60 text-red-300 flex items-start gap-3 animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#fe2c55]" />
            <div className="text-sm font-medium leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {successMessage && (
          <div className="w-full max-w-2xl mb-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-start gap-3 animate-in fade-in duration-200">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div className="text-sm font-medium">{successMessage}</div>
          </div>
        )}

        {/* CARD DE PROGRESSO EM TEMPO REAL */}
        {progressData && (
          <div className="w-full max-w-2xl mb-6 p-5 sm:p-6 bg-[#13151f] border border-[#00f2fe]/40 rounded-3xl shadow-2xl shadow-[#00f2fe]/10 animate-in fade-in slide-in-from-top-3 duration-300 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#00f2fe]/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00f2fe]/15 border border-[#00f2fe]/30 flex items-center justify-center text-[#00f2fe]">
                  {progressData.percent >= 100 ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-[#00f2fe]" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{progressData.label}</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold">
                      {progressData.format}
                    </span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">{progressData.stage}</p>
                </div>
              </div>

              <div className="text-right">
                <span className="font-extrabold text-2xl tracking-tight text-white font-mono">
                  {progressData.percent}%
                </span>
              </div>
            </div>

            <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/[0.08] mb-3">
              <div
                className="h-full bg-gradient-to-r from-[#00f2fe] via-sky-400 to-[#fe2c55] rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(0,242,254,0.8)]"
                style={{ width: `${Math.max(progressData.percent, 3)}%` }}
              ></div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-zinc-400 font-medium pt-1">
              <div className="flex items-center gap-4">
                {progressData.speed && (
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <Activity className="w-3.5 h-3.5 text-[#00f2fe]" />
                    <span>{progressData.speed}</span>
                  </span>
                )}
                {progressData.eta && (
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <Timer className="w-3.5 h-3.5 text-amber-400" />
                    <span>{progressData.eta}</span>
                  </span>
                )}
              </div>

              <div>
                {progressData.downloaded && (
                  <span className="font-mono text-zinc-300">
                    {progressData.downloaded} {progressData.total ? `/ ${progressData.total}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Banner de Anúncio Adsterra 300x250 (quando na tela inicial sem busca) */}
        {!videoData && (
          <AdBanner 
            adKey={AD_CONFIG.BANNER_300x250_KEY} 
            invokeSrc={AD_CONFIG.BANNER_300x250_SRC} 
            width={300} 
            height={250} 
          />
        )}

        {/* CARD DO VÍDEO DO TIKTOK COM OPÇÕES DIRETAS (ESTILO SSSTIK / TIKWM) */}
        {videoData && (
          <div className="w-full max-w-2xl bg-[#12141c] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl shadow-black/90 animate-in fade-in slide-in-from-bottom-3 duration-300 mb-8">
            
            {/* Header com Preview e Perfil do Criador */}
            <div className="p-5 sm:p-6 bg-gradient-to-b from-[#181a24] to-[#12141c] border-b border-white/[0.06] flex flex-col sm:flex-row items-start gap-5">
              
              {/* Thumbnail / Capa vertical do TikTok com botão de Prévia */}
              {videoData.cover && (
                <div 
                  onClick={handleOpenPreview}
                  className="relative w-full sm:w-36 aspect-[9/16] sm:aspect-[3/4] rounded-2xl overflow-hidden flex-shrink-0 border border-white/[0.1] bg-black shadow-xl group cursor-pointer"
                  title="Clique para assistir prévia"
                >
                  <img
                    src={videoData.cover}
                    alt={videoData.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Overlay Play Hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#00f2fe]/90 flex items-center justify-center text-black shadow-lg">
                      <Play className="w-6 h-6 fill-black ml-0.5" />
                    </div>
                  </div>

                  {videoData.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md text-[10px] text-zinc-200 px-2 py-0.5 rounded-md font-mono font-bold tracking-tight">
                      {videoData.duration}
                    </span>
                  )}
                  {videoData.is_slideshow && (
                    <span className="absolute top-2 left-2 bg-[#fe2c55] text-[10px] text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      Fotos
                    </span>
                  )}
                </div>
              )}

              {/* Informações do Vídeo e Autor */}
              <div className="min-w-0 flex-1 space-y-3">
                {/* Perfil do Criador */}
                <div className="flex items-center gap-3">
                  {videoData.author?.avatar ? (
                    <img 
                      src={videoData.author.avatar} 
                      alt={videoData.author.nickname} 
                      className="w-10 h-10 rounded-full object-cover border-2 border-[#00f2fe]/40"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
                      {videoData.author?.nickname?.[0] || 'T'}
                    </div>
                  )}

                  <div>
                    <h4 className="font-extrabold text-white text-sm sm:text-base leading-tight">
                      {videoData.author?.nickname}
                    </h4>
                    <p className="text-xs text-[#00f2fe] font-mono font-medium">
                      {videoData.author?.unique_id}
                    </p>
                  </div>
                </div>

                {/* Legenda do Vídeo */}
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3">
                  {videoData.title}
                </p>

                {/* Estatísticas (Curtidas, Comentários, Views) */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-zinc-400">
                  {videoData.stats?.likes && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      <Heart className="w-3.5 h-3.5 text-[#fe2c55]" />
                      <span className="font-semibold text-zinc-200">{videoData.stats.likes}</span>
                    </span>
                  )}
                  {videoData.stats?.comments && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      <MessageCircle className="w-3.5 h-3.5 text-sky-400" />
                      <span className="font-semibold text-zinc-200">{videoData.stats.comments}</span>
                    </span>
                  )}
                  {videoData.stats?.views && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      <Eye className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-semibold text-zinc-200">{videoData.stats.views}</span>
                    </span>
                  )}
                </div>

              </div>

            </div>

            {/* Abas: Opções de Download vs Extrair Roteiro com IA */}
            <div className="flex border-b border-white/[0.08] bg-[#0d0f17]">
              <button
                type="button"
                onClick={() => setActiveTab('download')}
                className={`flex-1 py-3.5 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
                  activeTab === 'download'
                    ? 'border-[#00f2fe] text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <Download className="w-4 h-4 text-[#00f2fe]" />
                <span>Opções de Download</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('transcript');
                  if (!transcriptData && !loadingTranscript) {
                    handleFetchTranscript();
                  }
                }}
                className={`flex-1 py-3.5 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
                  activeTab === 'transcript'
                    ? 'border-[#fe2c55] text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#fe2c55]" />
                <span>Extrair Roteiro (IA)</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fe2c55] text-white leading-none">
                  Novo
                </span>
              </button>
            </div>

            {/* ABA 1: Ações de Download Diretas */}
            {activeTab === 'download' && (
            <div className="p-5 sm:p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
                <Download className="w-4 h-4 text-[#00f2fe]" />
                Escolha a opção de download:
              </h3>

              <div className="grid grid-cols-1 gap-2.5">
                {videoData.options.map((option) => {
                  const isDownloading = downloadingId === option.id;
                  const isNoWatermarkHD = option.id === 'nowatermark_hd';
                  const isNoWatermark = option.id === 'nowatermark';
                  const isAudio = option.id === 'music';

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleDownloadOption(option)}
                      disabled={downloadingId !== null}
                      className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition-all duration-200 group active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed ${
                        isNoWatermarkHD
                          ? 'bg-gradient-to-r from-[#00f2fe]/20 via-[#00f2fe]/10 to-transparent border border-[#00f2fe]/40 hover:border-[#00f2fe] hover:shadow-lg hover:shadow-[#00f2fe]/20 text-white'
                          : isNoWatermark
                          ? 'bg-white/[0.04] border border-white/[0.08] hover:border-[#00f2fe]/50 hover:bg-white/[0.07] text-white'
                          : isAudio
                          ? 'bg-gradient-to-r from-[#fe2c55]/20 via-[#fe2c55]/10 to-transparent border border-[#fe2c55]/40 hover:border-[#fe2c55] hover:shadow-lg hover:shadow-[#fe2c55]/20 text-white'
                          : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isNoWatermarkHD || isNoWatermark
                            ? 'bg-[#00f2fe]/20 text-[#00f2fe]'
                            : isAudio
                            ? 'bg-[#fe2c55]/20 text-[#fe2c55]'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {isAudio ? (
                            <Music className="w-5 h-5" />
                          ) : (
                            <Film className="w-5 h-5" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm sm:text-base text-white">
                              {option.label}
                            </span>
                            {isNoWatermarkHD && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00f2fe] text-black uppercase tracking-wider">
                                Recomendado
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-400 block mt-0.5">
                            {option.sublabel} {option.size ? `• ${option.size}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 pl-3">
                        {isDownloading ? (
                          <div className="flex items-center gap-2 text-xs font-bold text-[#00f2fe]">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="hidden sm:inline">Baixando...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white/[0.06] group-hover:bg-white/[0.12] text-zinc-200 group-hover:text-white">
                            <Download className="w-4 h-4" />
                            <span>Baixar</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Se for carrossel de fotos (slideshow) */}
              {videoData.images && videoData.images.length > 0 && (
                <div className="mt-6 pt-5 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between mb-3.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-[#fe2c55]" />
                      Fotos do Carrossel ({videoData.images.length})
                    </h4>

                    {/* Botão Baixar Tudo em ZIP */}
                    <button
                      type="button"
                      onClick={handleDownloadAllImagesZip}
                      disabled={downloadingId !== null}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#fe2c55]/20 hover:bg-[#fe2c55]/30 border border-[#fe2c55]/40 text-[#fe2c55] hover:text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Baixar Todas em ZIP</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {videoData.images.map((imgUrl, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-white/[0.1] bg-black group">
                        <img src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleDownloadImage(imgUrl, idx)}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-xs font-bold cursor-pointer"
                        >
                          <Download className="w-5 h-5 text-[#00f2fe]" />
                          <span>Baixar Foto {idx + 1}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
            )}

            {/* ABA 2: Transcrição e Roteiro com IA */}
            {activeTab === 'transcript' && (
              <div className="p-5 sm:p-6 space-y-4">
                {/* Header da Aba */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div>
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#fe2c55]" />
                      Roteiro Extraído com IA (Whisper)
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Transcreva e modele o roteiro deste vídeo viral para usar em seus próprios conteúdos.
                    </p>
                  </div>

                  {transcriptData && (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] font-mono text-zinc-300">
                        {transcriptData.wordCount || 0} palavras
                      </span>
                      {transcriptData.segments?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowTimestamps(!showTimestamps)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            showTimestamps
                              ? 'bg-[#00f2fe]/20 text-[#00f2fe] border-[#00f2fe]/40'
                              : 'bg-white/[0.05] text-zinc-400 border-white/[0.08] hover:text-white'
                          }`}
                        >
                          <AlignLeft className="w-3.5 h-3.5 inline mr-1" />
                          {showTimestamps ? 'Ocultar Tempos' : 'Ver Tempos'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Estado: Carregando Transcrição */}
                {loadingTranscript && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#fe2c55]" />
                    <p className="text-sm font-bold text-white">Processando áudio com IA Whisper...</p>
                    <p className="text-xs text-zinc-400 max-w-sm">
                      Detectando padrões de fala e transcrevendo o roteiro completo com pontuação.
                    </p>
                  </div>
                )}

                {/* Estado: Sem Transcrição Gerada */}
                {!loadingTranscript && !transcriptData && (
                  <div className="py-10 flex flex-col items-center justify-center text-center space-y-4 bg-white/[0.02] rounded-2xl border border-white/[0.06] p-6">
                    <div className="w-12 h-12 rounded-2xl bg-[#fe2c55]/15 border border-[#fe2c55]/30 flex items-center justify-center text-[#fe2c55]">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-white">Deseja extrair o roteiro deste vídeo?</h4>
                      <p className="text-xs text-zinc-400 mt-1 max-w-md">
                        Nossa inteligência artificial analisa a faixa de áudio e transcreve exatamente tudo o que foi falado.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleFetchTranscript}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#fe2c55] to-rose-600 hover:brightness-110 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-[#fe2c55]/20 flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Gerar Roteiro Agora</span>
                    </button>
                  </div>
                )}

                {/* Estado: Transcrição Pronta */}
                {!loadingTranscript && transcriptData && (
                  <div className="space-y-3">
                    {/* Barra de Ações Rápidas */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyTranscript}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer border border-white/[0.08]"
                      >
                        {copiedTranscript ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#00f2fe]" />
                            <span>Copiar Roteiro</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyPrompt}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#fe2c55]/20 to-purple-500/20 hover:from-[#fe2c55]/30 hover:to-purple-500/30 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer border border-[#fe2c55]/40"
                        title="Copia o roteiro formatado com prompt para o ChatGPT reescrever"
                      >
                        {copiedPrompt ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Prompt Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Bot className="w-3.5 h-3.5 text-[#fe2c55]" />
                            <span>Copiar para ChatGPT</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadTxt}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer border border-white/[0.08]"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Baixar .TXT</span>
                      </button>
                    </div>

                    {/* Caixa de Texto do Roteiro */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#0a0c12] border border-white/[0.08] max-h-72 overflow-y-auto text-xs sm:text-sm leading-relaxed text-zinc-200 select-text whitespace-pre-wrap font-sans shadow-inner">
                      {showTimestamps && transcriptData.segments?.length > 0 ? (
                        <div className="space-y-2.5">
                          {transcriptData.segments.map((seg, i) => (
                            <div key={i} className="flex items-start gap-3">
                              <span className="font-mono text-[11px] font-bold text-[#00f2fe] bg-white/[0.05] px-2 py-0.5 rounded flex-shrink-0">
                                {seg.start}
                              </span>
                              <span className="text-zinc-200">{seg.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>{transcriptData.text}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Banner de Anúncio Adsterra 300x250 (abaixo do card de resultados do vídeo) */}
        {videoData && (
          <AdBanner 
            adKey={AD_CONFIG.BANNER_300x250_KEY} 
            invokeSrc={AD_CONFIG.BANNER_300x250_SRC} 
            width={300} 
            height={250} 
          />
        )}

        {/* HISTÓRICO DE DOWNLOADS RECENTES */}
        {recentHistory.length > 0 && (
          <section className="w-full max-w-2xl mb-12">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-[#00f2fe]" />
                Recentes Analisados
              </h3>
              <button
                type="button"
                onClick={handleClearHistory}
                className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar histórico</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentHistory.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleFetchInfo(null, item.url)}
                  className="p-3 bg-[#12141c] hover:bg-[#181a24] border border-white/[0.06] hover:border-[#00f2fe]/40 rounded-2xl flex items-center gap-3 transition-all cursor-pointer group"
                >
                  {item.cover ? (
                    <img 
                      src={item.cover} 
                      alt={item.title} 
                      className="w-12 h-16 rounded-xl object-cover bg-black flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                      <Film className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white line-clamp-1 group-hover:text-[#00f2fe] transition-colors">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      {item.unique_id}
                    </p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-[#00f2fe] group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Guia Rápido: Como usar (Passo a Passo estilo ssstik) */}
        <section className="w-full max-w-2xl mb-12">
          <h3 className="text-center font-extrabold text-xl text-white mb-6">
            Como baixar vídeos do TikTok sem marca d'água?
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-[#12141c] border border-white/[0.06] flex flex-col items-center text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-[#00f2fe]/10 border border-[#00f2fe]/30 flex items-center justify-center text-[#00f2fe] font-black text-sm">
                1
              </div>
              <h4 className="font-bold text-sm text-white">Copie o link</h4>
              <p className="text-xs text-zinc-400">
                Abra o TikTok, clique no botão <strong>Compartilhar</strong> do vídeo e escolha <strong>Copiar Link</strong>.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#12141c] border border-white/[0.06] flex flex-col items-center text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#00f2fe]/15 to-[#fe2c55]/15 border border-white/10 flex items-center justify-center text-white font-black text-sm">
                2
              </div>
              <h4 className="font-bold text-sm text-white">Cole o link</h4>
              <p className="text-xs text-zinc-400">
                Cole a URL no campo de busca acima e clique no botão <strong>Baixar</strong>.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#12141c] border border-white/[0.06] flex flex-col items-center text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-[#fe2c55]/10 border border-[#fe2c55]/30 flex items-center justify-center text-[#fe2c55] font-black text-sm">
                3
              </div>
              <h4 className="font-bold text-sm text-white">Baixe em HD</h4>
              <p className="text-xs text-zinc-400">
                Escolha a opção <strong>Sem Marca d'Água (HD)</strong> ou <strong>Áudio (MP3)</strong> para salvar no aparelho.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* Modal de Prévia do Vídeo */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative max-w-sm w-full bg-[#12141c] rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col items-center">
            
            {/* Header do Modal */}
            <div className="w-full px-5 py-3.5 flex items-center justify-between border-b border-white/[0.08] bg-[#181a24]">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-[#00f2fe] fill-current" />
                Prévia Sem Marca d'Água
              </span>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Vídeo Player */}
            <div className="p-3 w-full flex items-center justify-center bg-black">
              <video 
                src={previewVideoUrl} 
                controls 
                autoPlay 
                className="max-h-[65vh] w-auto rounded-2xl shadow-lg"
              />
            </div>

            {/* Rodapé do Modal */}
            <div className="w-full p-4 border-t border-white/[0.08] bg-[#181a24] flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white transition-all cursor-pointer"
              >
                Fechar Prévia
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-zinc-600 bg-[#090a0f]">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="font-extrabold text-zinc-300">TIK<span className="text-[#00f2fe]">DOWN</span></span>
            <span>&bull; Baixador de Vídeos do TikTok Sem Marca d'Água</span>
          </div>
          <p className="text-zinc-600 text-[11px]">
            Não somos afiliados ao TikTok ou ByteDance &bull; 2026
          </p>
        </div>
      </footer>

    </div>
  );
}
