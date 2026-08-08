import { createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import Doodle, { useDoodle } from "freehand-ui/react";

function DuoCard() {
  return (
    <div className="card">
      <h2>Duo Mode</h2>
      <p>Chat with a friend</p>
    </div>
  );
}

function FindButton() {
  return <button className="cta">Find Aznabee</button>;
}

/** Dummy component that uses the hook directly instead of the wrapper. */
function HookCard() {
  const ref = useRef(null);

  useDoodle(ref, {
    note: { text: "useDoodle hook", position: "bottom-left" },
    decorations: { count: 2, types: ["sparkle", "heart"] },
    padding: 10,
    roughness: 1.6,
    strokeWidth: 1.35,
  });

  return (
    <div ref={ref} className="card hook-card">
      <h2>Hook API</h2>
      <p>Same doodle, no wrapper</p>
    </div>
  );
}

function App() {
  return (
    <main className="stage">
      <Doodle
        note={{ text: "fun with friends", position: "top-right" }}
        arrow
        decorations
        padding={10}
        roughness={1.65}
        strokeWidth={1.35}
      >
        <DuoCard />
      </Doodle>

      <Doodle
        note={{ text: "start chat", position: "right" }}
        arrow={{ from: "right", to: "edge", style: "curved" }}
        decorations
        addBreaks
        padding={8}
        roughness={1.55}
        strokeWidth={1.35}
      >
        <FindButton />
      </Doodle>

      <HookCard />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
