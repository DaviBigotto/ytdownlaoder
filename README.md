# 🎵 TIKDOWN — TikTok Video Downloader Sem Marca d'Água

Aplicação Full-Stack moderna e de alta velocidade para download de vídeos do TikTok **sem marca d'água em Alta Definição (HD)**, versão original e extração de áudio/música (**MP3**) das trends. Inspirado no **ssstik.io**.

---

## ✨ Recursos

- 🟢 **Sem Marca d'Água (HD)**: Extração direta do stream original do TikTok sem o logo saltitante.
- 🎵 **Áudio / Som Original (MP3)**: Baixe a música ou efeito sonoro da trend em alta fidelidade.
- 📸 **Carrossel de Fotos**: Suporte completo para baixar posts de slides/fotos do TikTok.
- ⚡ **Download Instantâneo**: Arquivos leves (5 a 30 MB) entregues com barra de progresso em tempo real.
- 📋 **Botão de Colar Inteligente**: Integração com a área de transferência com um clique.
- 🛡️ **Zero Burocracia**: Sem necessidade de cookies, sem bloqueios de cipher ou login.

---

## 🚀 Tecnologias Utilizadas

### Frontend
- **React 18** + **Vite** (Build ultra-rápido com HMR)
- **Tailwind CSS** (Design neon dark mode com paleta característica do TikTok)
- **Lucide React** (Ícones modernos)
- **Google Fonts** (Plus Jakarta Sans)

### Backend
- **Python 3.12** + **Flask** (API REST rápida e leve)
- **Requests + Streaming** (Download em tempo real com chunk-streaming)
- **TikWM Engine & yt-dlp Contingency** (Arquitetura resiliente de extração)

---

## 🛠️ Como Executar Localmente

### 1. Backend (Flask)
```bash
# Entre na pasta backend
cd backend

# No Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# No Linux/Mac:
source venv/bin/activate

# Instale as dependências
pip install -r requirements.txt

# Inicie o servidor
python app.py
```
> O servidor iniciará em `http://localhost:5000`.

### 2. Frontend (React + Vite)
Em outro terminal:
```bash
# Entre na pasta frontend
cd frontend

# Inicie o servidor de desenvolvimento
npm run dev
```
> Acesse no navegador: `http://localhost:5173`.

---

## 📄 Licença
Distribuído sob a licença MIT. Desenvolvido para fins educacionais e de estudo. Não afiliado ao TikTok ou ByteDance.
