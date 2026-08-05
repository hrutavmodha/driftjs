/**
 * lib/devServer.js
 * ---------------------------------------------------------------------------
 * Zero-dependency dev server: plain node:http + fs.watch. No bundler is
 * required because the starter app uses native ES modules directly in the
 * browser. A tiny injected script opens an SSE connection and reloads the
 * page whenever a file under srcDir changes.
 * ---------------------------------------------------------------------------
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const RELOAD_SCRIPT = `
<script>
  const es = new EventSource('/__drift_reload');
  es.onmessage = () => location.reload();
</script>`;

export function startDevServer({ rootDir, srcDir, publicDir, port, onReady, onFileChange }) {
  const clients = new Set();

  const server = http.createServer(async (req, res) => {
    if (req.url === '/__drift_reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(urlPath);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('400 Bad Request');
      return;
    }

    // Resolve and confirm the final path is still inside rootDir. Blocks
    // "../" and encoded-"../" (%2e%2e%2f) directory-traversal attempts.
    const resolvedRoot = path.resolve(rootDir);
    let filePath = path.resolve(resolvedRoot, '.' + path.sep + decodedPath);
    if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    try {
      const stat = await fsp.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      let body = await fsp.readFile(filePath);
      const ext = path.extname(filePath);

      if (ext === '.html') {
        body = Buffer.from(body.toString('utf-8').replace('</body>', `${RELOAD_SCRIPT}</body>`));
      }

      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  server.listen(port, () => onReady?.(port));

  const notifyClients = () => {
    for (const client of clients) client.write('data: reload\n\n');
  };

  // De-dupe (serve.js watches the same dir for src/public) and skip missing dirs.
  const watchTargets = [...new Set([srcDir, publicDir])].filter(fs.existsSync);
  const watchers = watchTargets
    .map((dir) => {
      try {
        // recursive:true is unsupported on Linux before Node 20.13 and on
        // some other platforms; fall back to non-recursive rather than crash.
        return fs.watch(dir, { recursive: true }, (_, filename) => {
          onFileChange?.(filename);
          notifyClients();
        });
      } catch (err) {
        if (err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
          console.warn(
            `[drift] recursive file watching isn't supported on this Node/OS combo — ` +
              `watching "${dir}" non-recursively (top-level changes only). Upgrade to Node 20.13+ for full support.`
          );
          return fs.watch(dir, { recursive: false }, (_, filename) => {
            onFileChange?.(filename);
            notifyClients();
          });
        }
        throw err;
      }
    })
    .filter(Boolean);

  return {
    server,
    close: () => {
      watchers.forEach((w) => w.close());
      server.close();
    },
  };
}
