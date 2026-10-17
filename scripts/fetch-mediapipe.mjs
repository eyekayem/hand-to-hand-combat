// Stages MediaPipe's runtime files under public/ so the app serves them from
// its own origin with long-lived caching, instead of jsdelivr + Google
// Storage on every first visit. Runs before dev and build.
//
// WASM comes from the installed npm package (version-matched by construction).
// The hand model is downloaded once; if that fails (offline, blocked network)
// the build still succeeds and the app falls back to the CDN at runtime.
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const { version } = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));
const out = join(root, 'public', 'mediapipe', version);
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_FILE = join(root, 'public', 'mediapipe', 'hand_landmarker_float16_v1.task');

const exists = p => stat(p).then(() => true, () => false);

await mkdir(join(out, 'wasm'), { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  await copyFile(join(pkgDir, 'wasm', f), join(out, 'wasm', f));
}
console.log(`[mediapipe] wasm ${version} staged`);

if (await exists(MODEL_FILE)) {
  console.log('[mediapipe] model already staged');
} else {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1_000_000) throw new Error(`model too small (${buf.length} bytes)`);
    await writeFile(MODEL_FILE, buf);
    console.log(`[mediapipe] model staged (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.warn(`[mediapipe] model download failed (${err.message}); app will use the CDN copy`);
  }
}
