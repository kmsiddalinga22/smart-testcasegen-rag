# Troubleshooting

Known issues encountered while building and running Smart TestCaseGen RAG, with root cause and fix for each.

**`{"ok":false,"error":"..."}` from `/api/health`**
Cause: Langflow isn't running or isn't reachable at `LANGFLOW_BASE_URL`.
Fix:
1. Confirm Langflow is running: open `http://localhost:7860` in a browser.
2. Check `LANGFLOW_BASE_URL` in `backend/.env` matches the actual host/port.
3. Restart the backend after changing `.env`.

**`question is required` (400) from `/api/ask`**
Cause: the request body was missing or the `question` field was empty/whitespace — see the guard in `server.js:28`.
Fix: ensure the frontend textarea isn't empty before clicking Ask; if calling the API directly, include a non-empty `"question"` field in the JSON body.

**`chroma_store.py ingest failed: ... UnicodeEncodeError ... surrogates not allowed`**
Cause: on Windows, the Python subprocess's stdin/stdout can default to a non-UTF-8 codepage, mangling PDF text with smart quotes/en-dashes into invalid characters.
Fix: this is already handled in `backend/scripts/chroma_store.py` via `sys.stdin.reconfigure(encoding="utf-8")` — if you see this error, confirm you're running the version of that file from this repo and haven't reverted the encoding fix.

**Answer table looks misaligned (citation text in the wrong column, Priority missing)**
Cause: the LLM occasionally emits slightly more or fewer than 11 CSV fields per row.
Fix: `reconcileFieldCount()` in `frontend/src/csvDownload.js` anchors on the `Ref:` marker to fix this automatically. If it's still misaligned, check that the Langflow Prompt Template still instructs the model to always include a `Ref:`-prefixed Misc field (see the README's AI Service Setup section, step 6) — without that anchor, column reconciliation falls back to a weaker positional heuristic.

**`Error running graph: Error building Component Type Convert: list index out of range`**
Cause: a known intermittent ChromaDB race condition — Langflow's own ingestion Chroma node and the retrieval Chroma node both hold connections to the same on-disk `persist_directory`, and a query can briefly race against a concurrent write from this project's own ingestion path.
Fix: click **Ingest folder** again in the app to re-populate the store, then retry the question.

**Groq model silently reverts to a different model (e.g. `llama-3.1-8b-instant`) after editing the flow**
Cause: Langflow's Model Name dropdown has a refresh button that can reset the selected value when the flow is saved from an open browser tab with stale in-memory state.
Fix: re-open the flow, re-select `openai/gpt-oss-120b` on the Groq node, and confirm no other browser tab has that same flow open when you save.

**No PDF page count shown after "Ingest folder"**
Cause: the Pages/Chunks/Stored stats only reflect documents ingested through this app's own upload/"Ingest folder" flow — documents added directly through Langflow's UI won't populate the page count (it's not stored in ChromaDB metadata).
Fix: use "Ingest folder" or drag-and-drop upload in the app itself rather than ingesting through Langflow's own File node.
