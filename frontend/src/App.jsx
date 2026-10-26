import React, { useState } from 'react';
import { 
  Download, 
  Link as LinkIcon, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Film, 
  Music, 
  Clock, 
  User, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Play,
  ArrowRight,
  ShieldCheck,
  Zap,
  HardDrive
} from 'lucide-react';

export default function App() {
  const [url, setUrl] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [activeTab, setActiveTab] = useState('video'); // 'video' | 'audio'
  const [showAllVideos, setShowAllVideos] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Busca as informações e formatos disponíveis do vídeo
  const handleFetchInfo = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoadingInfo(true);
    setErrorMessage('');
    setSuccessMessage('');
    setVideoData(null);

    try {
      const response = await fetch('http://localhost:5000/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível analisar este vídeo.');
      }

      setVideoData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Erro de conexão com o servidor backend.');
    } finally {
      setLoadingInfo(false);
    }
  };

  // Dispara o download da opção selecionada
  const handleDownloadItem = async (item, type) => {
    const itemKey = type === 'video' ? `video_${item.height}` : `audio_${item.bitrate}`;
    setDownloadingKey(itemKey);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        url: url.trim(),
        type: type,
        height: type === 'video' ? item.height : undefined,
        bitrate: type === 'audio' ? item.bitrate : undefined,
      };

      const response = await fetch('http://localhost:5000/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao baixar arquivo.');
      }

      let filename = type === 'audio' ? `${videoData.title}.mp3` : `${videoData.title}.mp4`;
      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^"';]+)['"]?/i);
        if (match && match[1]) filename = decodeURIComponent(match[1]);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSuccessMessage(`Download de "${item.quality}" concluído com sucesso!`);
    } catch (err) {
      setErrorMessage(err.message || 'Erro durante o download.');
    } finally {
      setDownloadingKey(null);
    }
  };

  const visibleVideos = videoData?.videos 
    ? (showAllVideos ? videoData.videos : videoData.videos.slice(0, 5))
    : [];

  // Helper para renderizar badges de qualidade estilo streaming
  const renderQualityBadge = (quality) => {
    const isUltra = quality.includes('4K') || quality.includes('2K');
    const isFHD = quality.includes('1080');
    
    if (isUltra) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider bg-red-600/20 text-red-400 border border-red-500/30">
          <Sparkles className="w-2.5 h-2.5 text-red-400" />
          {quality}
        </span>
      );
    }
    if (isFHD) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wider bg-zinc-800 text-zinc-200 border border-zinc-700">
          {quality}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-zinc-400 border border-zinc-800 bg-zinc-900/60">
        {quality}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-zinc-100 flex flex-col font-sans selection:bg-[#E50914] selection:text-white relative cinema-glow-bg">
      
      {/* Navbar Superior Estilo Netflix */}
      <header className="border-b border-white/[0.06] bg-[#0b0c0e]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          
          {/* Logo e Nome */}
          <div className="flex items-center gap-3.5 group cursor-pointer">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-white/10 shadow-lg shadow-black/80 flex items-center justify-center bg-black group-hover:border-red-500/40 transition-all duration-300">
              <img 
                src="/logo.jpg" 
                alt="StreamDown Logo" 
                className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <span className="font-extrabold text-xl sm:text-2xl tracking-tighter text-white flex items-center gap-0.5">
              STREAM<span className="text-[#E50914]">DOWN</span>
            </span>
          </div>

          {/* Badges de Destaque no Header */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-3 text-xs text-zinc-400 font-medium mr-2">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                <Zap className="w-3.5 h-3.5 text-[#E50914]" /> Alta Velocidade
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Sem Anúncios
              </span>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-bold tracking-wider rounded bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30 uppercase">
              4K UHD
            </span>
          </div>

        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-12 flex flex-col items-center">
        
        {/* Hero Section */}
        <div className="text-center max-w-2xl mb-10 space-y-3.5">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
            Baixe seus vídeos favoritos <br className="hidden sm:inline" />
            com <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E50914] via-red-500 to-rose-400">qualidade máxima</span>.
          </h1>
          
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Cole a URL abaixo para acessar o catálogo de resoluções originais, sem perdas e sem limites de download.
          </p>
        </div>

        {/* Input Bar Estilo Netflix */}
        <form onSubmit={handleFetchInfo} className="w-full max-w-2xl mb-8 group">
          <div className="relative flex flex-col sm:flex-row gap-2.5 p-2 bg-[#13151b] rounded-2xl border border-white/[0.1] shadow-2xl shadow-black/80 focus-within:border-[#E50914]/60 focus-within:shadow-[0_0_35px_-5px_rgba(229,9,20,0.25)] transition-all duration-300">
            <div className="relative flex-1 flex items-center">
              <div className="absolute left-4 text-zinc-500 group-focus-within:text-[#E50914] transition-colors duration-200">
                <LinkIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Cole o link do YouTube aqui (ex: https://youtube.com/watch?v=...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loadingInfo}
                className="w-full pl-12 pr-4 py-3.5 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={loadingInfo || !url.trim()}
              className="px-7 py-3.5 bg-[#E50914] hover:bg-[#f6121d] disabled:opacity-50 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#E50914]/30 active:scale-[0.98] text-sm tracking-wide cursor-pointer disabled:cursor-not-allowed"
            >
              {loadingInfo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analisando...</span>
                </>
              ) : (
                <>
                  <span>Analisar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Alertas de Feedback */}
        {errorMessage && (
          <div className="w-full max-w-2xl mb-6 p-4 rounded-2xl bg-red-950/40 border border-red-800/60 text-red-300 flex flex-col gap-2 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#E50914]" />
              <div className="text-sm font-medium leading-relaxed">{errorMessage}</div>
            </div>
            {errorMessage.includes("anti-bot") && (
              <div className="mt-2 pt-3 border-t border-red-800/40 text-xs text-zinc-300 space-y-1.5 pl-8">
                <p className="font-semibold text-red-400">💡 Como liberar o download agora:</p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Instale no Chrome a extensão gratuita <strong className="text-white">Get cookies.txt LOCALLY</strong>.</li>
                  <li>Abra o YouTube logado na sua conta normal.</li>
                  <li>Clique na extensão e escolha <strong className="text-white">Export</strong>.</li>
                  <li>Salve o arquivo como <strong className="text-white font-mono">cookies.txt</strong> na pasta <code className="text-red-400 bg-black/60 px-1 rounded">backend/</code>.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="w-full max-w-2xl mb-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-start gap-3 animate-in fade-in duration-200">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div className="text-sm font-medium">{successMessage}</div>
          </div>
        )}

        {/* Card do Vídeo e Tabela de Qualidades */}
        {videoData && (
          <div className="w-full max-w-2xl bg-[#13151b] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl shadow-black/90 animate-in fade-in slide-in-from-bottom-3 duration-300">
            
            {/* Header com Thumbnail e Dados do Vídeo */}
            <div className="relative p-5 sm:p-6 bg-gradient-to-b from-[#181a22] to-[#13151b] border-b border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {videoData.thumbnail && (
                <div className="relative w-full sm:w-36 aspect-video sm:aspect-square rounded-2xl overflow-hidden flex-shrink-0 border border-white/[0.1] bg-black shadow-lg">
                  <img
                    src={videoData.thumbnail}
                    alt={videoData.title}
                    className="w-full h-full object-cover"
                  />
                  {videoData.duration && (
                    <span className="absolute bottom-1.5 right-1.5 bg-black/85 backdrop-blur-md text-[10px] text-zinc-200 px-2 py-0.5 rounded font-mono font-bold tracking-tight">
                      {videoData.duration}
                    </span>
                  )}
                </div>
              )}
              
              <div className="min-w-0 flex-1 space-y-2">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#E50914] uppercase tracking-wider">
                  <Play className="w-3 h-3 fill-current" /> Vídeo Pronto para Download
                </div>
                <h3 className="font-bold text-white text-base sm:text-lg line-clamp-2 leading-snug">
                  {videoData.title}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-0.5">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" /> {videoData.uploader}
                  </span>
                  {videoData.duration && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" /> {videoData.duration}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Abas Vídeo / Áudio Estilo Netflix */}
            <div className="flex border-b border-white/[0.06] bg-[#0e1015]">
              <button
                type="button"
                onClick={() => setActiveTab('video')}
                className={`flex-1 py-4 font-bold text-xs sm:text-sm tracking-wide text-center border-b-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'video'
                    ? 'border-[#E50914] text-white bg-white/[0.02]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.01]'
                }`}
              >
                <Film className="w-4 h-4 text-[#E50914]" />
                Vídeo (MP4)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audio')}
                className={`flex-1 py-4 font-bold text-xs sm:text-sm tracking-wide text-center border-b-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'audio'
                    ? 'border-[#E50914] text-white bg-white/[0.02]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.01]'
                }`}
              >
                <Music className="w-4 h-4 text-[#E50914]" />
                Áudio (MP3)
              </button>
            </div>

            {/* Tabela de Qualidades */}
            <div className="p-4 sm:p-6">
              
              {/* Opções de Vídeo */}
              {activeTab === 'video' && (
                <div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06] pb-3">
                          <th className="pb-3.5 font-bold pl-2">Qualidade</th>
                          <th className="pb-3.5 font-bold">Formato</th>
                          <th className="pb-3.5 font-bold">Tamanho Est.</th>
                          <th className="pb-3.5 font-bold text-right pr-2">Download</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {visibleVideos.map((item, idx) => {
                          const itemKey = `video_${item.height}`;
                          const isDownloading = downloadingKey === itemKey;

                          return (
                            <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                              <td className="py-3.5 pl-2 font-medium text-white flex items-center gap-2.5">
                                {renderQualityBadge(item.quality)}
                                {item.label && (
                                  <span className="text-[10px] text-zinc-400 font-medium">
                                    {item.label}
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 text-xs font-mono text-zinc-400 uppercase font-semibold">
                                {item.format}
                              </td>
                              <td className="py-3.5 text-xs text-zinc-400 font-mono">
                                {item.size}
                              </td>
                              <td className="py-3.5 pr-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadItem(item, 'video')}
                                  disabled={downloadingKey !== null}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#E50914] hover:bg-[#f6121d] disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-[#E50914]/20 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                                >
                                  {isDownloading ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>Baixando...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-3.5 h-3.5" />
                                      <span>Baixar</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Toggle Mostrar Mais / Menos */}
                  {videoData.videos.length > 5 && (
                    <div className="mt-4 pt-3 border-t border-white/[0.06] text-center">
                      <button
                        type="button"
                        onClick={() => setShowAllVideos(!showAllVideos)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors py-1 px-3 rounded-lg hover:bg-white/[0.04]"
                      >
                        {showAllVideos ? (
                          <>
                            <span>Mostrar menos</span>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            <span>Ver todas as resoluções ({videoData.videos.length})</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Opções de Áudio (MP3) */}
              {activeTab === 'audio' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06] pb-3">
                        <th className="pb-3.5 font-bold pl-2">Bitrate</th>
                        <th className="pb-3.5 font-bold">Formato</th>
                        <th className="pb-3.5 font-bold">Tamanho Est.</th>
                        <th className="pb-3.5 font-bold text-right pr-2">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {videoData.audios.map((item, idx) => {
                        const itemKey = `audio_${item.bitrate}`;
                        const isDownloading = downloadingKey === itemKey;

                        return (
                          <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3.5 pl-2 font-medium text-white flex items-center gap-2.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider bg-red-600/20 text-red-400 border border-red-500/30">
                                <Music className="w-2.5 h-2.5" />
                                {item.quality}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-medium">
                                {item.label}
                              </span>
                            </td>
                            <td className="py-3.5 text-xs font-mono text-zinc-400 uppercase font-semibold">
                              {item.format}
                            </td>
                            <td className="py-3.5 text-xs text-zinc-400 font-mono">
                              {item.size}
                            </td>
                            <td className="py-3.5 pr-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleDownloadItem(item, 'audio')}
                                disabled={downloadingKey !== null}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#E50914] hover:bg-[#f6121d] disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-[#E50914]/20 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                              >
                                {isDownloading ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Baixando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Baixar MP3</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Footer Minimalista Estilo Netflix */}
      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-zinc-600">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="font-extrabold text-zinc-300">STREAM<span className="text-[#E50914]">DOWN</span></span>
            <span>&bull; Processamento em alta definição</span>
          </div>
          <p className="text-zinc-600 text-[11px]">
            Desenvolvido para uso pessoal e educacional &bull; 2026
          </p>
        </div>
      </footer>

    </div>
  );
}
