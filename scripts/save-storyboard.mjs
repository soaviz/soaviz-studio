#!/usr/bin/env node
/**
 * save-storyboard.mjs
 * Usage: node scripts/save-storyboard.mjs <project-name>
 * Example: node scripts/save-storyboard.mjs soaviz-launch
 *
 * Creates /outputs/YYYY-MM-DD_project-name_storyboard.md from a template.
 * Will not overwrite an existing file.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Resolve paths ──────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const OUTPUTS   = resolve(ROOT, 'outputs');

// ── CLI argument ───────────────────────────────────────────────
const rawName = process.argv[2];

if (!rawName) {
  console.error('Error: project name required.');
  console.error('Usage: node scripts/save-storyboard.mjs <project-name>');
  console.error('Example: node scripts/save-storyboard.mjs soaviz-launch');
  process.exit(1);
}

// Sanitise: lowercase, spaces → hyphens, strip unsafe chars
const projectName = rawName
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9\-_]/g, '');

if (!projectName) {
  console.error('Error: project name produced an empty string after sanitising.');
  process.exit(1);
}

// ── Date ───────────────────────────────────────────────────────
const today = new Date();
const yyyy  = today.getFullYear();
const mm    = String(today.getMonth() + 1).padStart(2, '0');
const dd    = String(today.getDate()).padStart(2, '0');
const dateStr = `${yyyy}-${mm}-${dd}`;

// ── Output path ────────────────────────────────────────────────
const filename = `${dateStr}_${projectName}_storyboard.md`;
const outPath  = resolve(OUTPUTS, filename);

// ── Guard: do not overwrite ────────────────────────────────────
if (existsSync(outPath)) {
  console.error(`Error: file already exists — ${outPath}`);
  console.error('Rename the existing file or use a different project name.');
  process.exit(1);
}

// ── Ensure /outputs exists ─────────────────────────────────────
if (!existsSync(OUTPUTS)) {
  mkdirSync(OUTPUTS, { recursive: true });
}

// ── Template ───────────────────────────────────────────────────
const template = `# Storyboard Output

## Project

Project name: ${projectName}
Brand URL / Source:
Date: ${dateStr}
Created by:

## Goal

## Target Audience

## Visual Direction

## Strategic Notes

## BLOCK A — GPT Image Storyboard Prompt

\`\`\`txt
Paste BLOCK A here.
\`\`\`

## BLOCK B — Seedance / Kling Vertical Video Prompt

\`\`\`txt
Paste BLOCK B here.
\`\`\`

## Notes

## Reuse Tags

## Production Status

<!-- planning | in-production | in-review | approved | delivered -->
Status: planning
`;

// ── Write ──────────────────────────────────────────────────────
writeFileSync(outPath, template, 'utf8');
console.log(`Saved: ${outPath}`);
