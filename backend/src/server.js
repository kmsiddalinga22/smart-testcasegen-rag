require("dotenv").config();
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { askQuestion, checkHealth } = require("./langflowClient");
const { ingestFile, ingestFolder, resetStore, getStatus } = require("./ingest");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: path.join(os.tmpdir(), "rag-explorer-uploads") });

app.get("/api/health", async (_req, res) => {
  try {
    const langflowUp = await checkHealth();
    res.json({ ok: true, langflow: langflowUp });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post("/api/ask", async (req, res) => {
  const { question, sessionId } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "question is required" });
  try {
    const result = await askQuestion(question, sessionId || `web-${Date.now()}`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/ingest/status", async (_req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ingest/folder", async (_req, res) => {
  try {
    const result = await ingestFolder(process.env.SAMPLE_DOCS_FOLDER);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ingest/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  try {
    const result = await ingestFile(req.file.path, req.file.originalname);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path).catch(() => {});
  }
});

app.post("/api/ingest/reset", async (_req, res) => {
  try {
    const status = await resetStore();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`RAG explorer backend listening on http://localhost:${PORT}`);
});
