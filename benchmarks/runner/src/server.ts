import { createServer, type ViteDevServer } from 'vite';
import type { FrameworkDef } from './types.js';

export async function startFrameworkServer(framework: FrameworkDef): Promise<{ server: ViteDevServer; url: string }> {
  const server = await createServer({
    root: framework.dir,
    server: {
      port: framework.port,
      strictPort: false,
      host: '127.0.0.1',
    },
    logLevel: 'error',
  });

  await server.listen();
  const address = server.httpServer?.address();
  const actualPort = typeof address === 'object' && address ? address.port : framework.port;
  const url = `http://127.0.0.1:${actualPort}/index.html`;

  return { server, url };
}
