import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import copy from "rollup-plugin-copy";

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers,
  },
  preview: {
    headers,
  },
  plugins: [
    react(),
    copy({
      hook: 'buildStart',
      targets: [
        // Use ESM build instead of UMD for proper import() support
        { src: 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', dest: 'public/ffmpeg' },
        { src: 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', dest: 'public/ffmpeg' },
      ],
      verbose: true,
    }),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
