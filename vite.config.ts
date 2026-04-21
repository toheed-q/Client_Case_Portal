import { defineConfig } from 'vite';

export default defineConfig({
  // Project root directory
  root: './',
  // Static assets directory
  publicDir: 'public',
  build: {
    // Output directory for the build
    outDir: 'dist',
    // Clean the output directory before building
    emptyOutDir: true,
    // Ensure sourcemaps are generated for easier debugging on Vercel
    sourcemap: true,
  },
  server: {
    // Default development server port
    port: 3000,
    // Automatically open the app in the browser
    open: true,
  },
});
