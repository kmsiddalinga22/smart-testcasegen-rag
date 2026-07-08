import "./App.css";
import PipelineStepper from "./components/PipelineStepper";
import IngestionPanel from "./components/IngestionPanel";
import AskPanel from "./components/AskPanel";

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Smart TestCaseGen <span className="app-header-accent">RAG</span></h1>
        <p className="app-sub">Generate test cases from your PRD, formatted to match your existing CSV template.</p>
      </header>

      <PipelineStepper />

      <main className="panel-grid">
        <IngestionPanel />
        <AskPanel />
      </main>
    </div>
  );
}

export default App;
