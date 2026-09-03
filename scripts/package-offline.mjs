import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputPath = path.resolve(
  projectDir,
  '..',
  '杭高院2026秋季预选课助手-离线版.html',
);

const [css, bundledJavaScript, logo] = await Promise.all([
  readFile(path.join(projectDir, '.offline-build', 'app.css'), 'utf8'),
  readFile(path.join(projectDir, '.offline-build', 'app.js'), 'utf8'),
  readFile(path.join(projectDir, 'public', 'hias-logo-white.png')),
]);

const logoDataUrl = `data:image/png;base64,${logo.toString('base64')}`;
const javaScript = bundledJavaScript
  .replaceAll('/hias-logo-white.png', logoDataUrl)
  .replaceAll('</script', '<\\/script');

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="theme-color" content="#123f6b">
    <title>杭高院 2026 秋季预选课助手（离线版）</title>
    <style>${css}</style>
  </head>
  <body>
    <noscript>请启用浏览器 JavaScript 后使用本课表。</noscript>
    <div id="root"></div>
    <script>${javaScript}</script>
  </body>
</html>
`;

await writeFile(outputPath, html, 'utf8');
console.log(outputPath);
