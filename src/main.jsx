import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

const rootEl = document.getElementById("root");

try {
  createRoot(rootEl).render(<App />);
} catch (err) {
  console.error("Fatal startup error:", err);
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:2rem;text-align:center;">
      <div>
        <h1 style="margin-bottom:0.5rem;">Something went wrong on startup</h1>
        <p style="color:#666;">${(err && err.message) || "Unknown error"}</p>
      </div>
    </div>`;
}