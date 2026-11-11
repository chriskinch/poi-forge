import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileApi } from "./server/fileApi";

export default defineConfig({
    plugins: [react(), fileApi()],
    server: { port: 5199 },
});
