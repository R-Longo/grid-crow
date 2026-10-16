import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static site build, deployable on Netlify as-is (publish dir: dist).
export default defineConfig({
  plugins: [react()],
});
