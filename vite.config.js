import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Le front appelle /api/... et Vite relaie vers l'API Node : même origine → pas de CORS,
    // et le cookie de session HttpOnly fonctionne sans configuration supplémentaire.
    // xfwd : transmet l'IP réelle du poste (X-Forwarded-For) → la limite de connexions
    // reste PAR POSTE quand la classe se connecte en réseau (npm run dev:reseau).
    proxy: { '/api': { target: 'http://127.0.0.1:3001', xfwd: true } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
