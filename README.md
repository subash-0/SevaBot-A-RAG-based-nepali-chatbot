# SevaBot – Nepali Legal RAG Chatbot

A full-stack Retrieval-Augmented Generation (RAG) chatbot for Nepali legal research. The backend is Django REST + ChromaDB, the frontend is Vite/React with Tailwind. Users can start conversations, upload per-conversation PDFs, and get grounded answers with source file badges.

## Features
- Per-conversation temporary document uploads (PDF) with isolated retrieval.
- Permanent knowledge base in ChromaDB (legal codes) + user-uploaded collections.
- Source chips show which PDF (permanent vs user) contributed to each answer.
- Message editing with regenerated answers and preserved sources.
- Dark/light toggle, Romanized Nepali typing, conversation management.

## Prerequisites
- Python 3.12+
- Node.js 18+ (for frontend)
- A virtual environment tool (venv recommended)
- GROQ API key (for LLaMA-3.3 model), set as `GROQ_API_KEY`

## Backend Setup
1. **Clone & enter project**
   ```bash
   git clone <repo-url>
   cd SevaBot-A-RAG-based-nepali-chatbot
   ```
2. **Create & activate venv**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```
4. **Env variables** (create `.env` or export before run)
   - `DJANGO_SETTINGS_MODULE=backend.settings`
   - `SECRET_KEY=<django-secret>`
   - `GROQ_API_KEY=<your-groq-key>`
   - Optional: `CHROMADB_PATH=<absolute_path_to_chromadb_data>` (default: `./chromadb_data`)
5. **Migrate DB**
   ```bash
   python manage.py migrate
   ```
6. **Load permanent knowledge (optional but recommended)**
   Place permanent PDFs in `permanent_knowledge/`, then:
   ```bash
   python manage.py load_permanent_knowledge --knowledge-dir=permanent_knowledge
   # use --force-reload to rebuild the permanent collection
   ```
7. **Run backend**
   ```bash
   python manage.py runserver
   ```

## Frontend Setup
1. ```bash
   cd frontend
   npm install
   ```
2. **Run dev server** (defaults to port 5173)
   ```bash
   npm run dev
   ```
3. Frontend expects API at `http://localhost:8000/api`. Adjust `frontend/src/services/api.js` if you change the backend host/port.

## Using the App
- **Login/Signup** from the UI; tokens are handled automatically.
- **Start a chat** (sidebar “नयाँ कुराकानी”).
- **Upload PDFs to a chat** using the 📎 button; uploads are tied to that conversation only and retrieval stays isolated.
- **Ask questions**; answers show source chips (USER for uploaded PDFs, PERM for permanent KB).
- **Edit a user message**; the assistant reply refreshes and shows new sources.
- **Delete a conversation**; messages clear.
- **Delete an uploaded document** from the Documents tab; the backend also drops its Chroma collection.

## Data & Files Not in Git
- `chromadb_data/` (vector store) – auto-created at runtime.
- `db.sqlite3` (Django DB) – create locally via migrations.
- Uploaded PDFs (`media/pdfs/`) – user data.
- Permanent PDFs are expected in `permanent_knowledge/` locally; not tracked in git.

## Maintenance Tips
- **Clear Chroma**: stop the server, remove `chromadb_data/`, rerun loaders.
- **CUDA warnings** during `load_permanent_knowledge` are safe on CPU-only boxes.
- **OCR image-only PDFs**: if a file can’t be ingested (zlib/header errors), run OCR (e.g., `ocrmypdf input.pdf output.pdf`) and reload.

## Troubleshooting
- `ModuleNotFoundError: django`: activate venv (`source venv/bin/activate`).
- Missing GROQ key: set `GROQ_API_KEY` env var.
- Sources show “Unknown file”: ensure `source_file` metadata exists; permanent loader sets it from the PDF filename.

## Quick Start (fresh clone)
```bash
# backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py load_permanent_knowledge --knowledge-dir=permanent_knowledge  # optional
python manage.py runserver

# frontend (new terminal)
cd frontend
npm install
npm run dev
```

Visit the frontend (default http://localhost:5173) and start chatting.
