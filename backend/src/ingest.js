const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const fetch = require("node-fetch");
const { PDFParse } = require("pdf-parse");

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL || "nomic-embed-text";
const PYTHON_BIN = process.env.CHROMA_PYTHON_BIN;
const CHROMA_SCRIPT = path.join(__dirname, "..", "scripts", "chroma_store.py");
const PERSIST_DIR = process.env.CHROMA_PERSIST_DIR;
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "rag_testcasegen";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// PDF text extraction occasionally emits unpaired UTF-16 surrogates (broken
// ligatures/bullets in some fonts), which Chroma's Rust bindings reject with
// a UnicodeEncodeError -- strip them before chunking.
function stripLoneSurrogates(str) {
  return str
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "") // high surrogate with no following low surrogate
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, ""); // low surrogate with no preceding high surrogate
}

function chunkText(text) {
  const clean = stripLoneSurrogates(text.replace(/\r\n/g, "\n")).trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".pdf") {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text, pages: result.total || 1 };
  }
  const text = await fs.readFile(filePath, "utf-8");
  return { text, pages: 1 };
}

async function embedChunks(chunks) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: chunks }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama embed failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.embeddings;
}

function runChromaScript(action, stdinPayload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [CHROMA_SCRIPT, action, PERSIST_DIR, COLLECTION_NAME]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`chroma_store.py ${action} failed: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`chroma_store.py ${action} returned invalid JSON: ${stdout}`));
      }
    });
    if (stdinPayload !== undefined) {
      child.stdin.write(JSON.stringify(stdinPayload));
    }
    child.stdin.end();
  });
}

async function ingestFiles(files) {
  const allChunks = [];
  const ids = [];
  const metadatas = [];
  let totalPages = 0;
  const fileInfos = [];

  for (const { filePath, originalName } of files) {
    const { text, pages } = await extractText(filePath, originalName);
    const chunks = chunkText(text);
    chunks.forEach((chunk, i) => {
      allChunks.push(chunk);
      ids.push(`${originalName}-${i}`);
      metadatas.push({ source: originalName, chunk: i });
    });
    totalPages += pages;
    const stat = await fs.stat(filePath);
    fileInfos.push({ name: originalName, sizeBytes: stat.size });
  }

  const embeddings = await embedChunks(allChunks);

  const result = await runChromaScript("ingest", {
    ids,
    documents: allChunks,
    embeddings,
    metadatas,
  });

  return {
    files: fileInfos,
    pages: totalPages,
    chunks: allChunks.length,
    dims: embeddings[0]?.length || 0,
    stored: result.stored,
  };
}

async function ingestFile(filePath, originalName) {
  return ingestFiles([{ filePath, originalName }]);
}

async function ingestFolder(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && [".pdf", ".txt", ".md", ".csv"].includes(path.extname(e.name).toLowerCase()))
    .map((e) => ({ filePath: path.join(folderPath, e.name), originalName: e.name }));

  if (files.length === 0) {
    throw new Error(`No ingestible files found in ${folderPath}`);
  }

  return ingestFiles(files);
}

async function resetStore() {
  await runChromaScript("reset");
  return getStatus();
}

async function getStatus() {
  return runChromaScript("status");
}

module.exports = { ingestFile, ingestFolder, resetStore, getStatus, chunkText };
