import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { readEnv } from '../src/config.mjs';

readEnv();
const frontend = await createServer();
await frontend.listen();
frontend.printUrls();
const backend = spawn(process.execPath, ['--watch', 'src/main.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', APP_ORIGIN: 'http://localhost:5173' }
});
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  backend.kill('SIGTERM');
  const deadline = setTimeout(() => backend.kill('SIGKILL'), 5000);
  deadline.unref();
  await frontend.close();
}
process.on('SIGINT', () => {
  void stop();
});
process.on('SIGTERM', () => {
  void stop();
});
backend.on('error', (error) => {
  console.error(error.message);
  void stop(1);
});
backend.on('exit', (code) => {
  void stop(code ?? 1);
});
