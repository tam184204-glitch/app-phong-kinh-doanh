// Biến toàn cục Node (process, Buffer) cho bản demo chạy trong trình duyệt — esbuild «inject» vào mọi module.
import { Buffer } from 'buffer';
const process = globalThis.process || {
  env: { NO_LOGIN: '0', DEFAULT_PW: '123456', NO_JOBS: '1' },   // bắt buộc đăng nhập (tài khoản admin)
  argv: [], platform: 'browser', version: 'v22', versions: {},
  loadEnvFile() { throw new Error('no env'); },
  nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)),
  cwd: () => '/', exit() {}, on() {},
};
globalThis.process = process;
globalThis.Buffer = Buffer;
export { process, Buffer };
