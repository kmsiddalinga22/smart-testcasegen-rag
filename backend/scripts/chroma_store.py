import json
import sys

# On Windows, sys.stdin/stdout default to the console's locale codepage
# (e.g. cp1252) rather than UTF-8 when spawned as a subprocess pipe. That
# silently mangles non-ASCII PDF text (smart quotes, en-dashes, bullets)
# into lone surrogates via the surrogateescape error handler, which Chroma's
# Rust bindings then reject with a UnicodeEncodeError. Force UTF-8 both ways.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")

import chromadb

PERSIST_DIR = sys.argv[2]
COLLECTION_NAME = sys.argv[3]


def get_client():
    return chromadb.PersistentClient(path=PERSIST_DIR)


def get_or_create_collection(client):
    return client.get_or_create_collection(COLLECTION_NAME)


def action_status():
    client = get_client()
    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        print(json.dumps({"stored": 0, "dims": 0, "sampleEmbedding": None, "chunkPreview": []}))
        return

    count = collection.count()
    peek = collection.get(limit=5, include=["documents", "metadatas", "embeddings"])
    sample_embedding = None
    dims = 0
    embeddings = peek.get("embeddings")
    if embeddings is not None and len(embeddings) > 0:
        sample_embedding = list(embeddings[0][:8])
        dims = len(embeddings[0])

    chunk_preview = []
    documents = peek.get("documents") or []
    metadatas = peek.get("metadatas") or []
    for i, doc in enumerate(documents):
        meta = metadatas[i] if i < len(metadatas) else {}
        chunk_preview.append({
            "index": i,
            "chars": len(doc or ""),
            "text": (doc or "")[:220],
            "source": (meta or {}).get("source") or (meta or {}).get("file_path") or "",
        })

    print(json.dumps({
        "stored": count,
        "dims": dims,
        "sampleEmbedding": sample_embedding,
        "chunkPreview": chunk_preview,
    }))


def action_reset():
    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    get_or_create_collection(client)
    print(json.dumps({"ok": True}))


def action_ingest():
    payload = json.load(sys.stdin)
    ids = payload["ids"]
    documents = payload["documents"]
    embeddings = payload["embeddings"]
    metadatas = payload["metadatas"]

    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    collection = get_or_create_collection(client)

    batch_size = 100
    for start in range(0, len(ids), batch_size):
        end = start + batch_size
        collection.add(
            ids=ids[start:end],
            documents=documents[start:end],
            embeddings=embeddings[start:end],
            metadatas=metadatas[start:end],
        )

    print(json.dumps({"ok": True, "stored": collection.count()}))


ACTIONS = {
    "status": action_status,
    "reset": action_reset,
    "ingest": action_ingest,
}

if __name__ == "__main__":
    action = sys.argv[1]
    ACTIONS[action]()
