import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useStore } from "./store";
import "./styles.css";

// Handy in the console and for end-to-end tests.
if (import.meta.env.DEV) (window as unknown as { poiForge: typeof useStore }).poiForge = useStore;

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
