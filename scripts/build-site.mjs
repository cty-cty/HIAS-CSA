import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const cli = resolve('node_modules/vinext/dist/cli.js');
const child = spawn(process.execPath, [cli, 'build'], {
  env: {
    ...process.env,
    CI: 'true',
    WRANGLER_SEND_METRICS: 'false',
  },
  stdio: ['inherit', 'pipe', 'pipe'],
});

let output = '';

child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(chunk);
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('close', (code) => {
  const windowsTeardownOnly =
    process.platform === 'win32' &&
    output.includes('Build complete.') &&
    output.includes('UV_HANDLE_CLOSING') &&
    existsSync(resolve('dist/client/index.html'));

  if (code === 0 || windowsTeardownOnly) {
    if (windowsTeardownOnly) {
      console.warn(
        'Build artifacts verified; ignored the known Node 24 Windows teardown assertion.',
      );
    }
    process.exitCode = 0;
    return;
  }

  process.exitCode = code || 1;
});
