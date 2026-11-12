import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const cargoBin = path.join(homedir(), '.cargo', 'bin');
const suffix = process.platform === 'win32' ? '.exe' : '';
const findTool = (name) => existsSync(path.join(cargoBin, name + suffix)) ? path.join(cargoBin, name + suffix) : name;
const mode = process.argv[2];
const commands = {
  lock: [findTool('cargo'), ['generate-lockfile']],
  test: [findTool('cargo'), ['test', '--locked']],
  build: [process.env.CARGO_NEAR || findTool('cargo-near'), ['near', 'build', 'non-reproducible-wasm', '--no-abi', '--locked', '--out-dir', path.join(root, 'contract', 'build')]],
};
if (!commands[mode]) throw new Error('Expected contract mode: lock, build, or test');
const [command, args] = commands[mode];
const env = { ...process.env };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
env[pathKey] = [cargoBin, env[pathKey]].filter(Boolean).join(path.delimiter);
const result = spawnSync(command, args, { cwd: path.join(root, 'contract'), env, stdio: 'inherit', windowsHide: true });
if (result.error) { console.error('Install Rust and cargo-near using the contract setup instructions. ' + result.error.message); process.exit(1); }
if (result.status !== 0) process.exit(result.status || 1);
if (mode === 'build') {
  const file = path.join(root, 'contract/build/appeal_anchors.wasm');
  const bytes = readFileSync(file);
  const exports = WebAssembly.Module.exports(new WebAssembly.Module(bytes)).map((item) => item.name);
  for (const name of ['new', 'register_worker', 'anchor', 'get_anchor', 'is_registered', 'get_config']) {
    if (!exports.includes(name)) throw new Error('Missing contract export: ' + name);
  }
  console.log(JSON.stringify({ artifact: 'contract/build/appeal_anchors.wasm', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), exports }, null, 2));
}
