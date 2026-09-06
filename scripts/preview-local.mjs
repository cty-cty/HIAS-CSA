import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Serve only the generated standalone page, never the workspace files.
const previewFile = new URL(
  '../../HIAS-CSA-2026秋季预选课助手-离线版.html',
  import.meta.url,
);
const server = createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/favicon.ico') {
    response.writeHead(404).end();
    return;
  }
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  try {
    const html = await readFile(previewFile);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(html);
  } catch {
    response
      .writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('请先生成本地预览。');
  }
});
server.listen(4173, '127.0.0.1', () =>
  console.log('Local: http://127.0.0.1:4173/'),
);
