import { useEffect, useRef, useState } from "react";
import { getIngestStatus, ingestFolder, uploadFile, resetStore } from "../api";

const SOURCE_FOLDER = "Smart_TestCaseGen_RAG/Sample_docs";
const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md"];

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function baseName(p) {
  if (!p) return "";
  return p.split(/[\\/]/).pop();
}

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value ?? "—"}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function IngestionPanel() {
  const [status, setStatus] = useState("idle"); // idle | working | error
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]); // [{name, sizeBytes}]
  const [stats, setStats] = useState({ pages: null, chunks: null, dims: null, stored: null });
  const [sampleEmbedding, setSampleEmbedding] = useState(null);
  const [chunkPreview, setChunkPreview] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  async function refreshStatus() {
    const s = await getIngestStatus();
    setStats((prev) => ({ ...prev, chunks: s.stored, dims: s.dims, stored: s.stored }));
    setSampleEmbedding(s.sampleEmbedding);
    setChunkPreview(s.chunkPreview || []);
    if (s.chunkPreview?.length) {
      const seen = new Set();
      const derived = [];
      for (const c of s.chunkPreview) {
        const name = baseName(c.source);
        if (name && !seen.has(name)) {
          seen.add(name);
          derived.push({ name, sizeBytes: null });
        }
      }
      if (derived.length) setFiles(derived);
    }
  }

  useEffect(() => {
    refreshStatus().catch((err) => setError(err.message));
  }, []);

  async function handleIngestFolder() {
    setStatus("working");
    setError(null);
    try {
      const result = await ingestFolder();
      setFiles(result.files);
      setStats({ pages: result.pages, chunks: result.chunks, dims: result.dims, stored: result.stored });
      await refreshStatus();
      setStatus("idle");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  async function handleUpload(file) {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type: ${ext}. Use PDF, .txt or .md.`);
      setStatus("error");
      return;
    }
    setStatus("working");
    setError(null);
    try {
      const result = await uploadFile(file);
      setFiles(result.files);
      setStats({ pages: result.pages, chunks: result.chunks, dims: result.dims, stored: result.stored });
      await refreshStatus();
      setStatus("idle");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  async function handleReset() {
    setStatus("working");
    setError(null);
    try {
      await resetStore();
      setFiles([]);
      setStats({ pages: 0, chunks: 0, dims: 0, stored: 0 });
      setSampleEmbedding(null);
      setChunkPreview([]);
      setStatus("idle");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  const busy = status === "working";

  return (
    <section className="panel">
      <div className="panel-header ingestion-panel-header">
        <h2>1 · Ingestion</h2>
        <div className="ingestion-actions">
          <button className="ingest-button" onClick={handleIngestFolder} disabled={busy}>
            {busy ? "Working…" : "Ingest folder"}
          </button>
          <button className="reset-button" onClick={handleReset} disabled={busy}>
            Reset
          </button>
        </div>
      </div>

      <div className="source-folder-line">
        Source folder: <span className="source-folder-path">{SOURCE_FOLDER}</span>
      </div>

      {error && <div className="status-line status-error">{error}</div>}

      <div className="source-files">
        {files.length === 0 && <div className="source-file-empty">No documents ingested yet.</div>}
        {files.map((f) => (
          <div className="source-file-row" key={f.name}>
            <span className="source-file-icon">📄</span>
            <span className="source-file-name">{f.name}</span>
            {f.sizeBytes != null && <span className="source-file-size">{formatSize(f.sizeBytes)}</span>}
          </div>
        ))}
      </div>

      <div className="upload-divider">or upload your own</div>

      <div
        className={`dropzone${dragOver ? " dropzone-active" : ""}`}
        onClick={() => !busy && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleUpload(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="dropzone-icon">⬆</div>
        <div className="dropzone-title">Drop a PDF, .txt or .md here — or click to browse</div>
        <div className="dropzone-sub">Your file replaces the store and is chunked, embedded, and indexed.</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          hidden
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />
      </div>

      <div className="stats-grid">
        <StatCard value={stats.pages} label="Pages" />
        <StatCard value={stats.chunks} label="Chunks" />
        <StatCard value={stats.dims} label="Embed dims" />
        <StatCard value={stats.stored} label="Stored" />
      </div>

      {sampleEmbedding && (
        <div className="embedding-preview">
          <div className="preview-label">Sample embedding (first {sampleEmbedding.length} of {stats.dims})</div>
          <div className="embedding-values">
            [{sampleEmbedding.map((v) => v.toFixed(4)).join(", ")}, …]
          </div>
        </div>
      )}

      {chunkPreview.length > 0 && (
        <div className="chunk-preview">
          <div className="preview-label">Chunk preview</div>
          {chunkPreview.map((c) => (
            <div className="chunk-preview-item" key={c.index}>
              <div className="chunk-preview-header">
                <span className="chunk-preview-tag">chunk {c.index}</span>
                <span className="chunk-preview-chars">{c.chars} chars</span>
              </div>
              <div className="chunk-preview-text">{c.text}…</div>
            </div>
          ))}
        </div>
      )}

      <div className="config-line">
        Chunk Size: <b>1000</b> · Chunk Overlap: <b>200</b> · Embedding: <b>nomic-embed-text</b> (Ollama) · Vector Store: <b>ChromaDB</b>
      </div>
    </section>
  );
}
