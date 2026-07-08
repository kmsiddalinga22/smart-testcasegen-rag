const STEPS = [
  { n: 1, label: "PDF", sub: "load document" },
  { n: 2, label: "Chunk", sub: "split text" },
  { n: 3, label: "Embed", sub: "Nomic vectors" },
  { n: 4, label: "Store", sub: "ChromaDB" },
  { n: 5, label: "Retrieve", sub: "top-4" },
  { n: 6, label: "Answer", sub: "Groq LLM" },
];

export default function PipelineStepper() {
  return (
    <div className="stepper">
      {STEPS.map((step, i) => (
        <div className="stepper-item" key={step.n}>
          <div className="step-box">
            <div className="step-circle step-done">{step.n}</div>
            <div className="step-text">
              <div className="step-label">{step.label}</div>
              <div className="step-sub">{step.sub}</div>
            </div>
          </div>
          {i < STEPS.length - 1 && <div className="step-arrow">→</div>}
        </div>
      ))}
    </div>
  );
}
