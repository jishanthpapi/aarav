import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { tutorMiddleware } from './server/tutorMiddleware';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'ANTHROPIC_');
  for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value;
  return { plugins: [react(), { name: 'aarav-tutor',
    configureServer(server) { server.middlewares.use(tutorMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(tutorMiddleware); },
  }] };
});
