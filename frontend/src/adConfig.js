// Configuração centralizada de monetização do Adsterra
export const AD_CONFIG = {
  // Banner 300x250 (Retângulo no centro da página)
  BANNER_300x250_KEY: 'ce4611ccbf02e17fc29e9a30b260bb12',
  BANNER_300x250_SRC: 'https://bauval.org/22/ce4611ccbf02e17fc29e9a30b260bb12',

  // Direct Link (Smartlink) do Adsterra - abre anúncio APENAS ao clicar no botão de download
  DIRECT_LINK_URL: import.meta.env.VITE_AD_DIRECT_LINK || '',
};
