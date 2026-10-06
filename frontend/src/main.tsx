import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// A page that was already open during a new deployment can still reference an
// old hashed lazy chunk that the new container no longer has. Vite emits this
// event specifically for that deployment-skew case. Reload once so the browser
// gets the new index + chunk map instead of showing an unhandled-promise screen.
const PRELOAD_RETRY_KEY = "b2b-preload-retry-at";
window.addEventListener("vite:preloadError", (event) => {
  const lastRetry = Number(window.sessionStorage.getItem(PRELOAD_RETRY_KEY) ?? "0");
  const now = Date.now();

  if (!Number.isFinite(lastRetry) || now - lastRetry > 15_000) {
    event.preventDefault();
    window.sessionStorage.setItem(PRELOAD_RETRY_KEY, String(now));
    window.location.reload();
  }
});

// StrictMode deliberately double-mounts in dev, which conflicts with Pixi.js's
// async init - Application.destroy() fires before init() resolves.
createRoot(document.getElementById("root")!).render(<App />);
