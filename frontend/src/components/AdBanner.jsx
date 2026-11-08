import React, { useEffect, useRef } from 'react';

/**
 * Componente Wrapper para Banners do Adsterra no React
 */
export default function AdBanner({ 
  adKey = 'ce4611ccbf02e17fc29e9a30b260bb12',
  invokeSrc = 'https://bauval.org/22/ce4611ccbf02e17fc29e9a30b260bb12',
  format = 'iframe', 
  width = 300, 
  height = 250, 
  className = '' 
}) {
  const adRef = useRef(null);

  useEffect(() => {
    if (!adRef.current || !adKey) return;

    // Limpa anúncios anteriores no container
    adRef.current.innerHTML = '';

    const confScript = document.createElement('script');
    confScript.type = 'text/javascript';
    confScript.innerHTML = `
      atOptions = {
        'key': '${adKey}',
        'format': '${format}',
        'height': ${height},
        'width': ${width},
        'params': {}
      };
    `;

    const invokeScript = document.createElement('script');
    invokeScript.type = 'text/javascript';
    invokeScript.src = invokeSrc || `https://bauval.org/22/${adKey}`;

    adRef.current.appendChild(confScript);
    adRef.current.appendChild(invokeScript);
  }, [adKey, invokeSrc, format, width, height]);

  if (!adKey) return null;

  return (
    <div className={`flex flex-col items-center justify-center my-6 ${className}`}>
      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1.5 select-none">
        Publicidade
      </span>
      <div 
        ref={adRef} 
        className="overflow-hidden flex items-center justify-center rounded-2xl border border-white/[0.04] bg-[#0c0d14] shadow-lg shadow-black/40"
        style={{ minWidth: `${Math.min(width, 320)}px`, minHeight: `${height}px` }}
      />
    </div>
  );
}
