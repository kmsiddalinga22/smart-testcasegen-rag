import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { askQuestion } from "../api";
import { looksLikeCsv, parseTestCaseRows, downloadCsv, COLUMNS } from "../csvDownload";

const SESSION_ID = `web-${Date.now()}`;

const SUGGESTED = [
  "login test cases",
  "registration test cases",
  "password reset test cases",
];

export default function AskPanel() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("idle"); // idle | asking | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleGenerate(q) {
    const finalQuestion = q ?? question;
    if (!finalQuestion.trim() || status === "asking") return;
    setQuestion(finalQuestion);
    setStatus("asking");
    setError(null);
    try {
      const data = await askQuestion(finalQuestion, SESSION_ID);
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  function handleClear() {
    setQuestion("");
    setResult(null);
    setError(null);
    setStatus("idle");
  }

  const isCsv = result && looksLikeCsv(result.answer);
  const rows = isCsv ? parseTestCaseRows(result.answer) : [];

  return (
    <section className="panel">
      <div className="panel-header ask-panel-header">
        <h2>2 · Ask the document</h2>
        <button
          className="ingest-button"
          onClick={handleClear}
          disabled={status === "asking" || (!question && !result && status !== "error")}
        >
          Clear
        </button>
      </div>

      <div className="ask-row">
        <textarea
          className="ask-input"
          placeholder="What feature should test cases be generated for? (e.g. login test cases)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />
        <button className="ask-button" onClick={() => handleGenerate()} disabled={status === "asking"}>
          {status === "asking" ? "Generating…" : "Ask"}
        </button>
      </div>

      <div className="suggested-row">
        {SUGGESTED.map((q) => (
          <button key={q} className="suggested-chip" onClick={() => handleGenerate(q)} disabled={status === "asking"}>
            {q}
          </button>
        ))}
      </div>

      {status === "error" && <div className="status-line status-error">{error}</div>}
      {status === "asking" && (
        <div className="status-line status-pending">
          Running retrieval + generation — this can take up to a minute.
        </div>
      )}

      {status === "done" && result && (
        <div className="answer-block">
          <div className="answer-header">
            <span className="answer-label">Answer</span>
            <div className="answer-header-right">
              {result.model && (
                <span className="answer-model">
                  {result.model}
                  {result.usage ? ` · ${result.usage.total_tokens} tok` : ""}
                </span>
              )}
              {isCsv && (
                <button className="download-button" onClick={() => downloadCsv(rows)}>
                  ⬇ Download CSV
                </button>
              )}
            </div>
          </div>

          {isCsv ? (
            <div className="test-case-table-wrap">
              <table className="test-case-table">
                <thead>
                  <tr>
                    <th>{COLUMNS[0]}</th>
                    <th>{COLUMNS[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td>{row[0]}</td>
                      <td>{row[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-note">Full test case detail (steps, expected result, priority, etc.) is included in the downloaded CSV.</div>
            </div>
          ) : (
            <div className="answer-body">
              <ReactMarkdown>{result.answer}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
