# 🎬 STREAMDOWN — YouTube Ultra Downloader

Aplicação Full-Stack moderna para download de vídeos e extração de áudio do YouTube em alta qualidade (**4K UHD, 2K, 1080p FHD, 720p HD e MP3 até 320 kbps**).

Inspirado na estética cinematográfica de serviços de streaming premium (Netflix), com design dark mode refinado, tabela dinâmica de resoluções com estimativa de tamanho de arquivo e integração direta com **yt-dlp** e **FFmpeg**.

---

## 🚀 Tecnologias Utilizadas

### Frontend
- **React 18** + **Vite** (Build ultra-rápido com HMR)
- **Tailwind CSS** (Design system cinematográfico e responsivo)
- **Lucide React** (Ícones modernos e consistentes)
- **Google Fonts** (Plus Jakarta Sans)

### Backend
- **Python 3.12** + **Flask** (API REST rápida e leve)
- **Flask-CORS** (Comunicação segura entre frontend e backend)
- **yt-dlp** (Motor avançado de extração de mídias e bypass de proteções)
- **FFmpeg** (Fusão de áudio e vídeo de alta fidelidade sem re-encoding pesado)

---

## 📁 Arquitetura do Projeto

```text
YTdownloader/
├── backend/
│   ├── downloads/              # Armazenamento temporário com auto-cleanup
│   ├── app.py                  # Servidor Flask com endpoints /info e /download
│   ├── requirements.txt        # Dependências Python (Flask, Flask-CORS, yt-dlp)
│   └── .gitkeep
├── frontend/
│   ├── public/                 # Assets estáticos e logo oficial
│   ├── src/
│   │   ├── components/         # Componentes reutilizáveis (Button, Input)
│   │   ├── App.jsx             # Interface cinematográfica principal
│   │   ├── index.css           # Iluminação ambiente e diretivas Tailwind
│   │   └── main.jsx            # Ponto de entrada do React
│   ├── package.json            # Dependências e scripts do React/Vite
│   ├── tailwind.config.js      # Paleta de cores Netflix e tema customizado
│   └── vite.config.js          # Configuração do Vite com proxy
└── .gitignore                  # Proteção de venv, node_modules, cookies e temporários
```

---

## 🛠️ Como Executar Localmente

### 1. Pré-requisitos
- [Node.js](https://nodejs.org/) (v18+)
- [Python 3.10+](https://www.python.org/)
- [FFmpeg](https://ffmpeg.org/) instalado no sistema

### 2. Backend (Flask)
```bash
# Entre na pasta backend
cd backend

# Crie e ative o ambiente virtual
python -m venv venv

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

### 3. Frontend (React + Vite)
Em outro terminal:
```bash
# Entre na pasta frontend
cd frontend

# Instale os pacotes
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```
> Acesse no navegador: `http://localhost:5173`.

---

## 📄 Licença
Distribuído sob a licença MIT. Desenvolvido para fins educacionais e de estudo.
