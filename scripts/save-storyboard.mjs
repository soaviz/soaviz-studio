#!/usr/bin/env node
/**
 * save-storyboard.mjs
 * Usage: node scripts/save-storyboard.mjs <project-name>
 * Example: node scripts/save-storyboard.mjs soaviz-launch
 *
 * Creates /outputs/YYYY-MM-DD_project-name_storyboard.md
 * by reading outputs/_storyboard-output-template.md at runtime.
 * Uses atomic 'wx' open flag — will never overwrite an existing file.
 */

import { openSync, writeSync, closeSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Resolve paths ──────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const OUTPUTS   = resolve(ROOT, 'outputs');
const TEMPLATE  = resolve(OUTPUTS, '_storyboard-output-template.md');

// ── CLI argument ───────────────────────────────────────────────
const rawName = process.argv[2];

if (!rawName) {
  console.error('Error: project name required.');
  console.error('Usage: node scripts/save-storyboard.mjs <project-name>');
  console.error('Example: node scripts/save-storyboard.mjs soaviz-launch');
  process.exit(1);
}

// Sanitise: lowercase, spaces → hyphens, strip unsafe chars, trim edge hyphens
const projectName = rawName
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9_-]/g, '')
  .replace(/^[-_]+|[-_]+$/g, '');

if (!projectName) {
  console.error('Error: project name produced an empty string after sanitising.');
  console.error('Use English letters, numbers, or hyphens. (e.g. soaviz-launch)');
  process.exit(1);
}

// ── Date (UTC — consistent regardless of local timezone) ───────
const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── 1. Validate template exists FIRST (hard dependency) ────────
if (!existsSync(TEMPLATE)) {
  console.error(`Error: template not found — ${TEMPLATE}`);
  console.error('Make sure outputs/_storyboard-output-template.md exists.');
  process.exit(1);
}

// ── 2. Ensure /outputs exists ──────────────────────────────────
if (!existsSync(OUTPUTS)) {
  mkdirSync(OUTPUTS, { recursive: true });
}

// ── 3. Build output path ───────────────────────────────────────
const filename = `${dateStr}_${projectName}_storyboard.md`;
const outPath  = resolve(OUTPUTS, filename);

// ── 4. Load and inject template values ────────────────────────
const content = readFileSync(TEMPLATE, 'utf8')
  .replace(/^Project name:.*$/m, `Project name: ${projectName}`)
  .replace(/^Date:.*$/m,         `Date: ${dateStr}`);

// ── 5. Atomic write — 'wx' flag fails if file already exists ──
//    existsSync + writeFileSync 사이의 TOCTOU 경쟁 조건을 OS 레벨에서 제거.
//    openSync('wx') 는 파일 생성과 존재 확인이 단일 syscall로 처리됨.
try {
  const fd = openSync(outPath, 'wx');
  writeSync(fd, content);
  closeSync(fd);
} catch (err) {
  if (err.code === 'EEXIST') {
    console.error(`Error: file already exists — ${outPath}`);
    console.error('Rename the existing file or use a different project name.');
    process.exit(1);
  }
  // 그 외 예상치 못한 에러 (권한, 디스크 풀 등) 는 원문 그대로 출력
  console.error(`Error: could not write file — ${err.message}`);
  process.exit(1);
}

console.log(`Saved: ${outPath}`);
