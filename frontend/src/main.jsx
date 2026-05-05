import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Check for an update on every load
        reg.update().catch(() => {});
        // If a new SW is waiting, ask it to activate immediately
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage?.({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {});

    // When the new SW activates, hard-reload once so stale JS in memory is replaced.
    let didReload = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (didReload) return;
      didReload = true;
      window.location.reload();
    });
  });
}
