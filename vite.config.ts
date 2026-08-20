import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEVELOPMENT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173; object-src 'none'; base-uri 'none'; form-action 'none'";

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Vite's output is deliberately a portable, local-only static site.  Keep
 * every generated URL relative so the built directory can be served from a
 * sub-path or a local HTTP server without rewriting the HTML.
 */
export default defineConfig(({ command }) => ({
  base: './',
  // Product assets are authored in source; do not implicitly copy an
  // unreviewed public directory into the static bundle.
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'texture-lab-csp',
      transformIndexHtml(html) {
        return html.replace(
          '__TEXTURE_LAB_CSP__',
          command === 'serve' ? DEVELOPMENT_CSP : PRODUCTION_CSP,
        );
      },
    },
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // Avoid data: URLs and the module-preload helper.  Both make the static
    // artifact harder to audit under a restrictive CSP.
    assetsInlineLimit: 0,
    modulePreload: false,
    cssCodeSplit: false,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Stable, human-readable names are sufficient for this single-entry
        // static application and make artifact inspection/reproducibility
        // straightforward.  Content hashes belong to exported bundles, not
        // the authoring application's build directory.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
}));
