import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileApi } from "./server/fileApi.ts";
import { staticBundle } from "./server/staticBundle.ts";

export default defineConfig({
    plugins: [react(), fileApi(), staticBundle()],
    server: { port: 5199 },
});
