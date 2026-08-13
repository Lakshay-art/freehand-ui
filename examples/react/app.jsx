import { createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import Doodle, { useDoodle } from "@aznabee/freehand-ui/react";

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
        note={{
          text: "fun with friends",
          position: "top-right",
          offset: { x: 100, y: 0 },
        }}
        arrow={{
          from: "bottom",
          to: "right",
          style: "looped",
          // offset: { x: 100, y: 0 },
        }}
        decorations
        padding={10}
        roughness={1.65}
        strokeWidth={1.35}
      >
        <DuoCard />
      </Doodle>

      <Doodle
        note={{
          text: "start chat",
          position: "right",
          offset: { x: 100, y: 0 },
        }}
        arrow={{
          from: "left",
          to: "edge",
          style: "looped",
          // Draws on quicker, then leans in once and stays there
          animate: { speed: 1.6, repeat: false },
          // offset: { x: 100, y: 0 },
        }}
        decorations
        addBreaks
        padding={0}
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
