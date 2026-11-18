import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function firestoreReadGuardPlugin() {
  const guardedPath = path.resolve(__dirname, 'src/services/guardedFirestore.ts');
  return {
    name: 'firestore-read-guard',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (source !== 'firebase/firestore' || !importer) return null;
      const cleanImporter = importer.split('?')[0].replace(/\\/g, '/');
      if (cleanImporter.endsWith('/src/services/guardedFirestore.ts')) {
        return null;
      }
      if (cleanImporter.includes('/src/')) {
        return guardedPath;
      }
      return null;
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [firestoreReadGuardPlugin(), react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
