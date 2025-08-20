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
      targets: [
        { src: 'node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js', dest: 'public/ffmpeg' },
        { src: 'node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm', dest: 'public/ffmpeg' },
        // Try alternative paths in case the above fails
        { src: 'node_modules/@ffmpeg/core/dist/ffmpeg-core.js', dest: 'public/ffmpeg' },
        { src: 'node_modules/@ffmpeg/core/dist/ffmpeg-core.wasm', dest: 'public/ffmpeg' },
      ],
      verbose: true,
      copyOnce: false,
      hook: 'buildStart',
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
