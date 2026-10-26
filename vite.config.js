import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// base: './' memastikan build menghasilkan relative path untuk semua asset (CSS, JS, media),
// sehingga dapat berjalan langsung di GitHub Pages subfolder (https://USER.github.io/REPO-NAME/)
// tanpa khawatir nama repository berubah.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || './',
});
