/**
 * soaviz studio — Video Render Server
 * Node.js + Express + FFmpeg
 * Port: 8787
 *
 * Run:  npm run dev
 * Deps: express, multer, cors, nanoid
 * Req:  ffmpeg installed (brew install ffmpeg)
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const { execFile } = require('child_process');
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const { nanoid } = require('nanoid');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { S3Client, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { analyzeVideo } = require('./services/videoAnalyzer');
const { generateEditVersions } = require('./services/editVersionGenerator');
const { renderSceneConcat, renderSimpleTrim } = require('./services/videoRenderer');

/* ── Directories ────────────────────────────────────────────── */
const ROOT_DIR    = __dirname;
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const OUTPUTS_DIR = path.join(ROOT_DIR, 'outputs');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');
const PORT = process.env.PORT || 8787;

dotenv.config({ path: ENV_LOCAL_PATH });
dotenv.config();

// 현재는 local upload/output storage를 사용합니다.
// 추후 Cloudflare R2 또는 Supabase Storage adapter로 교체 예정입니다.
[UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* ── App ────────────────────────────────────────────────────── */
const app = express();

const CORS_ORIGINS = new Set([
  'http://localhost:8787',
  'http://localhost:5500',
  'http://localhost:5501',
  'http://127.0.0.1:8787',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:5501',
  'https://soaviz.com',
  'https://www.soaviz.com',
  'https://soaviz.studio',
  'https://www.soaviz.studio',
  'https://soaviz-studio.vercel.app',
  // Extra origins from env (CORS_ORIGINS or ALLOWED_ORIGINS, comma-separated)
  ...String(process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
]);

// *.vercel.app 프리뷰 배포도 허용 (와일드카드)
const CORS_VERCEL_RE = /^https:\/\/[\w-]+\.vercel\.app$/;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || CORS_ORIGINS.has(origin) || CORS_VERCEL_RE.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error('CORS: origin not allowed — ' + origin));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Static: 렌더링된 결과물 다운로드
app.use('/outputs', express.static(OUTPUTS_DIR));

// Preview entrypoints: Codex/browser preview opens http://localhost:8787/
app.get(['/', '/soaviz-studio'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// Static: HTML 앱 직접 서빙 (http://localhost:8787/soaviz-studio.html)
app.use(express.static(ROOT_DIR, {
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

/* ── Multer ─────────────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `upload-${nanoid(10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter(_req, file, cb) {
    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.mp4', '.mov', '.avi'];
    if (allowed.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('MP4 또는 MOV 파일만 업로드할 수 있어요'));
    }
  },
});

/* ── Length → seconds map (analyze에서만 사용) ──────────────── */
const LENGTH_SECONDS = {
  '15초': 15,
  '30초': 30,
  '60초': 60,
};

function hasEnv(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function getSupabaseHealthConfig() {
  return {
    hasUrl: hasEnv('SUPABASE_URL'),
    hasAnonKey: hasEnv('SUPABASE_ANON_KEY'),
    hasServiceKey: hasEnv('SUPABASE_SERVICE_ROLE_KEY'),
    hasDatabaseUrl: hasEnv('DATABASE_URL'),
  };
}

function getR2Buckets() {
  const fallback = process.env.R2_BUCKET_NAME || '';
  return {
    uploads: process.env.R2_UPLOADS_BUCKET || fallback,
    outputs: process.env.R2_OUTPUTS_BUCKET || fallback,
    thumbnails: process.env.R2_THUMBNAILS_BUCKET || fallback,
    assets: process.env.R2_ASSETS_BUCKET || fallback,
  };
}

function getR2Endpoint() {
  if (hasEnv('R2_ENDPOINT')) return process.env.R2_ENDPOINT;
  if (hasEnv('R2_ACCOUNT_ID')) return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return '';
}

function getR2HealthConfig() {
  const buckets = getR2Buckets();
  return {
    hasAccessKeyId: hasEnv('R2_ACCESS_KEY_ID'),
    hasSecretAccessKey: hasEnv('R2_SECRET_ACCESS_KEY'),
    hasAccountId: hasEnv('R2_ACCOUNT_ID'),
    hasEndpoint: Boolean(getR2Endpoint()),
    buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, Boolean(value)])),
  };
}

function createR2Client() {
  const endpoint = getR2Endpoint();
  if (!endpoint || !hasEnv('R2_ACCESS_KEY_ID') || !hasEnv('R2_SECRET_ACCESS_KEY')) {
    return null;
  }
  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function checkR2Connection() {
  const env = getR2HealthConfig();
  const response = {
    ok: false,
    env,
    buckets: Object.fromEntries(Object.keys(env.buckets).map(key => [key, false])),
    reason: 'missing_required_r2_env',
  };

  const client = createR2Client();
  const bucketNames = getR2Buckets();
  if (!client || !env.hasAccountId || !env.hasEndpoint || !env.hasAccessKeyId || !env.hasSecretAccessKey) {
    return response;
  }

  const entries = await Promise.all(Object.entries(bucketNames).map(async ([purpose, bucket]) => {
    if (!bucket) return [purpose, false];
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return [purpose, true];
    } catch {
      return [purpose, false];
    }
  }));

  response.buckets = Object.fromEntries(entries);
  response.ok = Object.values(response.buckets).every(Boolean);
  response.reason = response.ok ? 'connected' : 'bucket_check_failed';
  return response;
}

function sanitizeObjectName(name) {
  return String(name || 'upload.bin')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 120) || 'upload.bin';
}

function getR2BucketForPurpose(purpose) {
  const buckets = getR2Buckets();
  return buckets[purpose] || '';
}

async function checkSupabaseConnection() {
  const config = getSupabaseHealthConfig();
  const response = {
    ok: false,
    env: config,
    connection: {
      rest: false,
      auth: false,
      storage: false,
    },
  };

  if (!config.hasUrl || !config.hasServiceKey) {
    response.reason = 'missing_required_supabase_env';
    return response;
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const [settingsResult, bucketsResult] = await Promise.allSettled([
      supabase.auth.getSession(),
      supabase.storage.listBuckets(),
    ]);

    response.connection.auth = settingsResult.status === 'fulfilled' && !settingsResult.value.error;
    response.connection.storage = bucketsResult.status === 'fulfilled' && !bucketsResult.value.error;
    response.connection.rest = response.connection.auth || response.connection.storage;
    response.ok = response.connection.rest;
    response.reason = response.ok ? 'connected' : 'supabase_request_failed';
  } catch (error) {
    response.reason = 'supabase_client_error';
  }

  return response;
}

/* ── POST /api/analyze-video ────────────────────────────────── */
app.post('/api/analyze-video', upload.single('video'), async (req, res) => {
  const inputPath = req.file?.path;

  const cleanup = () => {
    if (inputPath && fs.existsSync(inputPath)) {
      fs.unlink(inputPath, () => {});
    }
  };

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '영상 파일이 없어요. video 필드로 업로드해주세요.' });
    }

    // selectedStyle / selectedLength: 프론트 FormData로 전달
    const selectedStyle  = req.body?.selectedStyle  || '감성';
    const selectedLength = req.body?.selectedLength  || '30초';
    const targetSeconds  = LENGTH_SECONDS[selectedLength] ?? 30;

    const { duration, scenes, style } =
      await analyzeVideo(inputPath, selectedStyle, targetSeconds);

    cleanup();

    // editVersions 생성 — A/B/C 편집안 자동 구성
    const { versions: editVersions } = generateEditVersions(scenes, {
      selectedLength,
      selectedStyle,
    });

    // 직렬화 헬퍼 — scenes 배열(thumbnail 등 대용량) 제거
    const serializeVersion = (v) => ({
      id:               v.id,
      title:            v.title,
      label:            v.label,
      strategy:         v.strategy,
      sceneIndexes:     v.sceneIndexes,
      cutCount:         v.cutCount,
      estimatedDuration:v.estimatedDuration,
      avgScore:         v.avgScore,
      topScore:         v.topScore,
      reason:           v.reason,
      tags:             v.tags,
    });

    return res.json({
      success: true,
      duration,
      style,
      targetSeconds,
      scenes: scenes.map(s => ({
        index:     s.index,
        start:     s.start,
        end:       s.end,
        midpoint:  s.midpoint,
        label:     s.label,
        score:     s.score,
        breakdown: s.breakdown,
        priority:  s.priority,
        reason:    s.reason,
      })),
      editVersions: editVersions.map(serializeVersion),
    });

  } catch (err) {
    cleanup();
    console.error('[analyze error]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ── POST /api/render-video ─────────────────────────────────── */
app.post('/api/render-video', upload.single('video'), async (req, res) => {
  const inputPath = req.file?.path;

  // 처리 후 업로드 파일 삭제 (cleanup)
  const cleanup = () => {
    if (inputPath && fs.existsSync(inputPath)) {
      fs.unlink(inputPath, () => {});
    }
  };

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '영상 파일이 없어요. video 필드로 업로드해주세요.' });
    }

    const {
      selectedStyle      = '감성',
      selectedLength     = '30초',
      subtitleEnabled    = 'false',
      selectedVersionId  = 'A',
      scenesJson,
      selectedVersionJson,
    } = req.body;

    const subtitle = subtitleEnabled === 'true';

    /* ── renderMode 결정 ──────────────────────────────────────── */
    let renderMode      = 'simple_trim';
    let selectedScenes  = null;
    let usedScenes      = null;

    if (scenesJson && selectedVersionJson) {
      try {
        const allScenes      = JSON.parse(scenesJson);
        const selectedVersion = JSON.parse(selectedVersionJson);
        const { sceneIndexes } = selectedVersion;

        if (Array.isArray(sceneIndexes) && sceneIndexes.length && Array.isArray(allScenes) && allScenes.length) {
          selectedScenes = sceneIndexes
            .map(i => allScenes[i])
            .filter(s => s && typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start);

          if (selectedScenes.length > 0) {
            renderMode = 'scene_concat';
            usedScenes = selectedScenes;
          }
        }
      } catch (parseErr) {
        console.warn('[render] JSON parse 실패, simple_trim으로 fallback:', parseErr.message);
      }
    }

    /* ── 실제 렌더링 ───────────────────────────────────────────── */
    let result;

    if (renderMode === 'scene_concat') {
      result = await renderSceneConcat(inputPath, selectedScenes, {
        selectedStyle,
        subtitleEnabled: subtitle,
        selectedVersionId,
      });
    } else {
      result = await renderSimpleTrim(inputPath, {
        selectedStyle,
        selectedLength,
        subtitleEnabled: subtitle,
      });
    }

    cleanup();

    const outputUrl = `${req.protocol}://${req.get('host')}/outputs/${result.outputName}`;
    console.log(`[render:${result.renderMode}] 완료 → ${outputUrl}`);

    return res.json({
      success:          true,
      outputUrl,
      filename:         result.outputName,
      renderMode:       result.renderMode,
      selectedVersionId: renderMode === 'scene_concat' ? selectedVersionId : null,
      usedScenes:       usedScenes ? usedScenes.map(s => ({
        index:    s.index,
        start:    s.start,
        end:      s.end,
        label:    s.label,
        score:    s.score,
      })) : null,
      cutCount:         usedScenes?.length ?? null,
    });

  } catch (err) {
    cleanup();
    console.error('[render error]', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || '렌더링 중 오류가 발생했어요',
    });
  }
});

/* ── Text Generation (Anthropic 우선 → OpenAI 폴백) ─────────── */
app.post('/api/text/generate', async (req, res) => {
  const { system, user, model: reqModel = 'claude-haiku-4-5', temperature = 0.85, max_tokens = 1500, json_mode = false } = req.body || {};
  if (!user) return res.status(400).json({ error: 'user prompt required' });

  const anthropicKey = (req.headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY || '').trim();
  const openaiKey    = (req.headers['x-openai-key']    || process.env.OPENAI_API_KEY    || '').trim();

  if (!anthropicKey && !openaiKey) {
    return res.status(401).json({ error: 'API key not configured (ANTHROPIC_API_KEY or OPENAI_API_KEY required)' });
  }

  // ── Anthropic 경로 ────────────────────────────────────────
  if (anthropicKey) {
    try {
      // Claude 모델명 정규화 (OpenAI 모델명이 넘어와도 안전하게 처리)
      const isOpenAIModel = /^gpt/i.test(reqModel);
      const claudeModel = isOpenAIModel ? 'claude-haiku-4-5' : (reqModel || 'claude-haiku-4-5');

      const messages = [{ role: 'user', content: user }];

      const body = {
        model: claudeModel,
        max_tokens: Math.min(max_tokens, 16000),
        temperature,
        messages,
      };
      if (system) body.system = system;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        // Anthropic 실패 시 OpenAI로 폴백
        if (openaiKey) {
          console.warn(`[text/generate] Anthropic error ${response.status}, falling back to OpenAI`);
        } else {
          return res.status(response.status).json({ error: `Anthropic error: ${errText.slice(0, 200)}` });
        }
      } else {
        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        return res.json({ text, usage: data.usage, provider: 'anthropic' });
      }
    } catch (err) {
      console.error('[text/generate] Anthropic error:', err.message);
      if (!openaiKey) return res.status(500).json({ error: err.message });
    }
  }

  // ── OpenAI 폴백 경로 ──────────────────────────────────────
  if (openaiKey) {
    try {
      const oaiModel = /^claude/i.test(reqModel) ? 'gpt-4o-mini' : (reqModel || 'gpt-4o-mini');
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });

      const body = { model: oaiModel, messages, temperature, max_tokens };
      if (json_mode) body.response_format = { type: 'json_object' };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return res.status(response.status).json({ error: `OpenAI error: ${errText.slice(0, 200)}` });
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      return res.json({ text, usage: data.usage, provider: 'openai' });
    } catch (err) {
      console.error('[text/generate] OpenAI error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(500).json({ error: 'No available API provider' });
});

/* ── Image Generation (OpenAI DALL·E / gpt-image-1) ────────── */
app.post('/api/image/generate', async (req, res) => {
  const {
    prompt,
    model: reqModel = 'dall-e-3',
    aspect_ratio = '1:1',
    reference_image,
    n = 1,
  } = req.body || {};

  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const apiKey = (req.headers['x-openai-key'] || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(401).json({ error: '이미지 생성을 위한 OPENAI_API_KEY가 설정되지 않았습니다. Fly.io 시크릿에 OPENAI_API_KEY를 등록해주세요.' });

  // 모델 ID 정규화 — 내부 별칭 → 실제 OpenAI 모델
  const MODEL_ALIAS = {
    'flash': 'dall-e-3',
    'pro':   'dall-e-3',
    'ultra': 'dall-e-3',
    'gpt-image': 'gpt-image-1',
    'gpt-image-1': 'gpt-image-1',
    'dall-e-3': 'dall-e-3',
    'dall-e-2': 'dall-e-2',
  };
  const model = MODEL_ALIAS[reqModel] || 'dall-e-3';

  // 비율 → 지원 size 매핑
  const SIZE_MAP = {
    '1:1':  '1024x1024',
    '2:3':  '1024x1792',
    '3:4':  '1024x1792',
    '4:3':  '1792x1024',
    '9:16': '1024x1792',
    '16:9': '1792x1024',
  };
  const size = SIZE_MAP[aspect_ratio] || '1024x1024';

  try {
    // gpt-image-1: image edit with reference
    if (model === 'gpt-image-1' && reference_image) {
      // base64 dataUrl → buffer
      const base64Data = reference_image.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer  = Buffer.from(base64Data, 'base64');

      const formData = new FormData();
      formData.append('model', 'gpt-image-1');
      formData.append('prompt', prompt);
      formData.append('n', String(n));
      formData.append('size', size);
      formData.append('image[]', new Blob([imgBuffer], { type: 'image/png' }), 'reference.png');

      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return res.status(response.status).json({ error: `OpenAI image error: ${errText.slice(0, 300)}` });
      }
      const data = await response.json();
      const b64  = data.data?.[0]?.b64_json;
      const url  = data.data?.[0]?.url;
      return res.json({ imageUrl: b64 ? `data:image/png;base64,${b64}` : url });
    }

    // dall-e-3 / gpt-image-1 generation
    const body = {
      model,
      prompt,
      n: model === 'dall-e-3' ? 1 : n,   // dall-e-3: n은 항상 1
      size,
      response_format: 'b64_json',
    };

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `OpenAI image error: ${errText.slice(0, 300)}` });
    }

    const data = await response.json();
    const b64  = data.data?.[0]?.b64_json;
    const url  = data.data?.[0]?.url;
    return res.json({ imageUrl: b64 ? `data:image/png;base64,${b64}` : url });
  } catch (err) {
    console.error('[image/generate]', err);
    return res.status(500).json({ error: err.message });
  }
});

/* ── Character Key Image Studio ────────────────────────────── */
app.post('/api/character-key-image/generate', async (req, res) => {
  const {
    characterId,
    modelId      = 'gpt-image',
    pipeline     = 'standard',   // 'ip-adapter' | 'standard'
    prompt       = '',
    negativePrompt = '',
    referenceImage,              // base64 dataUrl (primary reference)
    referenceStrength = 0.7,
    aspectRatio   = '1:1',
    outputCount   = 4,
    seed,
    guidanceScale = 7.5,
    angle         = 'front',
  } = req.body || {};

  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  // ── Pipeline: ip-adapter via Replicate ──────────────────────
  if (pipeline === 'ip-adapter' && referenceImage) {
    const replicateToken = (
      req.headers['x-replicate-token'] ||
      process.env.REPLICATE_API_TOKEN ||
      ''
    ).trim();

    if (!replicateToken) {
      // fallback to standard if no replicate token
      console.warn('[character-key-image] No REPLICATE_API_TOKEN — falling back to standard pipeline');
    } else {
      try {
        // IP-Adapter FaceID Plus v2 (portrait consistency)
        const ipa_model = 'zsxkib/ip-adapter-faceid-plus:v2';
        const body = {
          version: 'latest',
          input: {
            prompt,
            negative_prompt: negativePrompt || 'blurry, low quality, extra limbs, distorted face',
            face_image: referenceImage,
            scale: referenceStrength,
            num_outputs: Math.min(Number(outputCount), 4),
            num_inference_steps: 30,
            guidance_scale: Number(guidanceScale),
            ...(seed ? { seed: Number(seed) } : {}),
          },
        };

        const predRes = await fetch(`https://api.replicate.com/v1/models/${ipa_model}/predictions`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${replicateToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!predRes.ok) {
          const errTxt = await predRes.text().catch(() => '');
          console.error('[ck-ip-adapter] prediction create failed:', errTxt.slice(0, 300));
          // fall through to standard
        } else {
          const pred = await predRes.json();
          const predId = pred.id;

          // poll for result (max 90s)
          let result = null;
          for (let i = 0; i < 45; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
              headers: { 'Authorization': `Token ${replicateToken}` },
            });
            if (!pollRes.ok) break;
            const pollData = await pollRes.json();
            if (pollData.status === 'succeeded') { result = pollData.output; break; }
            if (pollData.status === 'failed')    { console.error('[ck-ip-adapter] failed:', pollData.error); break; }
          }

          if (result && Array.isArray(result) && result.length > 0) {
            const images = result.map((url, i) => ({
              id: `ck_${Date.now()}_${i}`,
              url,
              dataUrl: null,
              pipeline: 'ip-adapter',
              model: ipa_model,
              prompt,
              angle,
              index: i,
            }));
            return res.json({ success: true, images, pipeline: 'ip-adapter' });
          }
        }
      } catch (err) {
        console.error('[ck-ip-adapter] error — falling back:', err.message);
      }
    }
  }

  // ── Pipeline: standard (gpt-image-1 / dall-e-3) ─────────────
  const openaiKey = (req.headers['x-openai-key'] || process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) {
    return res.status(401).json({ error: 'OPENAI_API_KEY가 없습니다. Settings → API Keys에서 등록해 주세요.' });
  }

  const MODEL_ALIAS = {
    'gpt-image': 'gpt-image-1',
    'gpt-image-1': 'gpt-image-1',
    'dall-e-3': 'dall-e-3',
    'dall-e-2': 'dall-e-2',
  };
  const openaiModel = MODEL_ALIAS[modelId] || 'gpt-image-1';

  const SIZE_MAP = {
    '1:1':  '1024x1024',
    '2:3':  '1024x1792',
    '3:4':  '1024x1792',
    '4:3':  '1792x1024',
    '9:16': '1024x1792',
    '16:9': '1792x1024',
  };
  const size = SIZE_MAP[aspectRatio] || '1024x1024';
  const count = Math.min(Number(outputCount) || 4, openaiModel === 'dall-e-3' ? 1 : 4);

  try {
    let rawImages = [];

    // gpt-image-1 with reference → images/edits
    if (openaiModel === 'gpt-image-1' && referenceImage) {
      const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer  = Buffer.from(base64Data, 'base64');

      // run `count` parallel edit requests (gpt-image-1 doesn't support n>1 in edits reliably)
      const requests = Array.from({ length: count }, () => {
        const fd = new FormData();
        fd.append('model', 'gpt-image-1');
        fd.append('prompt', prompt);
        fd.append('n', '1');
        fd.append('size', size);
        fd.append('image[]', new Blob([imgBuffer], { type: 'image/png' }), 'reference.png');
        return fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openaiKey}` },
          body: fd,
        });
      });

      const responses = await Promise.allSettled(requests);
      for (const r of responses) {
        if (r.status !== 'fulfilled') continue;
        if (!r.value.ok) continue;
        const d = await r.value.json();
        const item = d.data?.[0];
        if (item) rawImages.push(item);
      }
    } else {
      // standard generation
      const body = {
        model: openaiModel,
        prompt,
        n: openaiModel === 'dall-e-3' ? 1 : count,
        size,
        response_format: 'b64_json',
      };
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return res.status(response.status).json({ error: `OpenAI error: ${errText.slice(0, 300)}` });
      }
      const data = await response.json();
      rawImages = data.data || [];
    }

    if (!rawImages.length) {
      return res.status(500).json({ error: '이미지 생성 결과가 없습니다.' });
    }

    const images = rawImages.map((item, i) => {
      const b64  = item.b64_json;
      const url  = item.url;
      return {
        id: `ck_${Date.now()}_${i}`,
        dataUrl: b64 ? `data:image/png;base64,${b64}` : null,
        url: url || null,
        pipeline: 'standard',
        model: openaiModel,
        prompt,
        angle,
        index: i,
      };
    });

    return res.json({ success: true, images, pipeline: 'standard' });
  } catch (err) {
    console.error('[character-key-image/generate]', err);
    return res.status(500).json({ error: err.message });
  }
});

/* ── ElevenLabs Voices Proxy ────────────────────────────────── */
app.get('/api/voices', async (req, res) => {
  const elKey = (
    req.headers['x-user-key-elevenlabs'] ||
    process.env.ELEVENLABS_API_KEY ||
    ''
  ).trim();

  if (!elKey) {
    return res.json({
      voices: [],
      error: 'ElevenLabs API 키가 없습니다. Settings → API Keys에서 등록해 주세요.',
    });
  }

  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': elKey,
        'Accept': 'application/json',
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      const msg = upstream.status === 401
        ? 'ElevenLabs API 키가 올바르지 않습니다. 키를 확인해 주세요.'
        : `ElevenLabs API 오류 (${upstream.status}): ${text.slice(0, 200)}`;
      return res.json({ voices: [], error: msg });
    }

    const data = await upstream.json();
    const voices = (data.voices || []).map(v => ({
      voice_id:    v.voice_id,
      name:        v.name,
      category:    v.category,
      description: v.description,
      preview_url: v.preview_url,
      labels:      v.labels || {},
    }));

    return res.json({ voices });
  } catch (err) {
    console.error('[api/voices]', err.message);
    return res.status(500).json({ voices: [], error: `서버 오류: ${err.message}` });
  }
});

/* ── ElevenLabs TTS Proxy ───────────────────────────────────── */
app.post('/api/tts', async (req, res) => {
  const {
    text,
    voice_id        = '21m00Tcm4TlvDq8ikWAM', // Rachel (기본)
    model_id        = 'eleven_multilingual_v2',
    stability       = 0.5,
    similarity_boost = 0.75,
    style           = 0,
    speed           = 1.0,
  } = req.body || {};

  if (!text) return res.status(400).json({ error: 'text is required' });

  const elKey = (
    req.headers['x-user-key-elevenlabs'] ||
    process.env.ELEVENLABS_API_KEY ||
    ''
  ).trim();

  if (!elKey) {
    return res.status(401).json({ error: 'ElevenLabs API 키가 없습니다. Settings → API Keys에서 등록해 주세요.' });
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice_id)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key':   elKey,
          'Content-Type': 'application/json',
          'Accept':       'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id,
          voice_settings: {
            stability:        Math.min(1, Math.max(0, stability)),
            similarity_boost: Math.min(1, Math.max(0, similarity_boost)),
            style:            Math.min(1, Math.max(0, style)),
            speed:            Math.min(4, Math.max(0.1, speed)),
          },
        }),
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      let msg = `TTS 실패 (${upstream.status})`;
      if (upstream.status === 401) msg = 'ElevenLabs API 키가 올바르지 않습니다.';
      else if (upstream.status === 422) msg = `TTS 입력 오류: ${errText.slice(0, 150)}`;
      else if (upstream.status === 429) msg = 'ElevenLabs 크레딧이 부족합니다.';
      return res.status(upstream.status).json({ error: msg });
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');

    // stream the audio directly
    const reader = upstream.body?.getReader();
    if (!reader) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.end(buf);
    }
    const flush = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
      await flush();
    };
    await flush();
  } catch (err) {
    console.error('[api/tts]', err.message);
    if (!res.headersSent) return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
});

/* ── POST /api/music ────────────────────────────────────────── */
// ElevenLabs Sound Generation → ambient / music-style audio
app.post('/api/music', async (req, res) => {
  const { prompt = '', music_length_ms = 30000 } = req.body || {};
  const elKey = (
    req.headers['x-user-key-elevenlabs'] ||
    process.env.ELEVENLABS_API_KEY || ''
  ).trim();

  if (!elKey) {
    return res.status(400).json({ error: 'ElevenLabs API 키가 없습니다. Settings → API Keys에서 등록해 주세요.' });
  }
  if (!prompt.trim()) {
    return res.status(400).json({ error: '프롬프트를 입력해 주세요.' });
  }

  const duration_seconds = Math.min(22, Math.max(0.5, Math.round(music_length_ms / 1000)));

  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'xi-api-key':   elKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text:             prompt,
        duration_seconds,
        prompt_influence: 0.5,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      let msg = `Music 생성 실패 (${upstream.status})`;
      if (upstream.status === 401) msg = 'ElevenLabs API 키가 올바르지 않습니다.';
      else if (upstream.status === 422) msg = `입력 오류: ${errText.slice(0, 150)}`;
      else if (upstream.status === 429) msg = 'ElevenLabs 크레딧이 부족합니다.';
      return res.status(upstream.status).json({ error: msg });
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');

    const reader = upstream.body?.getReader();
    if (!reader) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.end(buf);
    }
    const flush = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
      await flush();
    };
    await flush();
  } catch (err) {
    console.error('[api/music]', err.message);
    if (!res.headersSent) return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
});

/* ── POST /api/sfx ──────────────────────────────────────────── */
// ElevenLabs Sound Generation → sound effects
app.post('/api/sfx', async (req, res) => {
  const { text = '', duration_seconds, prompt_influence = 0.85 } = req.body || {};
  const elKey = (
    req.headers['x-user-key-elevenlabs'] ||
    process.env.ELEVENLABS_API_KEY || ''
  ).trim();

  if (!elKey) {
    return res.status(400).json({ error: 'ElevenLabs API 키가 없습니다. Settings → API Keys에서 등록해 주세요.' });
  }
  if (!text.trim()) {
    return res.status(400).json({ error: 'SFX 텍스트를 입력해 주세요.' });
  }

  const payload = {
    text,
    prompt_influence: Math.min(1, Math.max(0, Number(prompt_influence) || 0.85)),
  };
  if (duration_seconds && duration_seconds >= 0.5 && duration_seconds <= 22) {
    payload.duration_seconds = duration_seconds;
  }

  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'xi-api-key':   elKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      let msg = `SFX 생성 실패 (${upstream.status})`;
      if (upstream.status === 401) msg = 'ElevenLabs API 키가 올바르지 않습니다.';
      else if (upstream.status === 422) msg = `입력 오류: ${errText.slice(0, 150)}`;
      else if (upstream.status === 429) msg = 'ElevenLabs 크레딧이 부족합니다.';
      return res.status(upstream.status).json({ error: msg });
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');

    const reader = upstream.body?.getReader();
    if (!reader) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.end(buf);
    }
    const flush = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
      await flush();
    };
    await flush();
  } catch (err) {
    console.error('[api/sfx]', err.message);
    if (!res.headersSent) return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
});

/* ── Replicate model ID mapping ─────────────────────────────── */
// soaviz model ID → Replicate owner/model string
const REPLICATE_MODEL_MAP = {
  'veo-3':              'google/veo-3',
  'veo-3-fast':         'google/veo-3-fast',
  'kling-2.5-turbo':    'kuaishou/kling-video-2.5-turbo',
  'kling-2':            'kuaishou/kling-video-2.0',
  'kling-1.6-i2v':      'kuaishou/kling-video-1.6',
  'minimax-hailuo-2.3': 'minimax/hailuo-ai-2.3',
  'seedance-2-pro':     'bytedance/seedance-2-pro',
  'pika-2':             'pika-labs/pika-2.0',
  'pika-2-i2v':         'pika-labs/pika-2.0',
  'hunyuan-video':      'hunyuanvideo-community/hunyuanvideo',
  'mochi-1':            'genmo/mochi-1-preview',
  'wan-2.2-i2v-fast':   'wavespeedai/wan-2.2-i2v-480p',
  'stable-video-diffusion': 'stability-ai/stable-video-diffusion',
  'cogvideox-i2v':      'thudm/cogvideox-5b',
  'sync-labs-1.9':      'sync-labs/sync-1.9.0-beta',
  'liveportrait':       'fofr/live-portrait',
  'sadtalker':          'cjwbw/sadtalker',
  'memo-talking':       'zsxkib/memo',
  'real-esrgan-video':  'nightmareai/real-esrgan',
  'video-upscaler-x4':  'lucataco/real-esrgan-video',
  'rife-frame-interp':  'pollinations/rife',
  'kling-extension':    'kuaishou/kling-video-1.6-pro',
};

/* ── GET /api/video/models ──────────────────────────────────── */
app.get('/api/video/models', (_req, res) => {
  const features = [
    { id: 'create',  label: 'Text to Video',       desc: '프롬프트로 장면 생성',           mode: 't2v',     ready: true },
    { id: 'i2v',     label: 'Image / Keyframes',    desc: '첫 프레임·키프레임으로 모션 제어', mode: 'i2v',     ready: true },
    { id: 'lipsync', label: 'Lipsync / Dialogue',   desc: '인물 컷에 음성·립싱크 연결',     mode: 'lipsync', ready: true },
    { id: 'upscale', label: 'Upscale / Extend',     desc: '해상도 보강·컷 길이 확장',       mode: 'upscale', ready: true },
  ];

  const models = [
    // T2V
    { id:'sora-2-pro',           label:'OpenAI Sora 2 Pro',           provider:'OpenAI',     tier:'exclusive', category:'T2V/I2V',              route:'provider',  duration_choices:[4,8,12,20], max_seconds:20, release:'2026-02', is_new:true,  audio:true,  resolution:'1080p' },
    { id:'sora-2',               label:'OpenAI Sora 2',               provider:'OpenAI',     tier:'premium',   category:'T2V/I2V/Extend',        route:'provider',  duration_choices:[4,8,12],    max_seconds:12, release:'2025-11', audio:true,  resolution:'1080p' },
    { id:'veo-3.1',              label:'Google Veo 3.1',              provider:'Google',     tier:'exclusive', category:'T2V/I2V/Vertical',       route:'provider',  duration_choices:[8],          max_seconds:8,  release:'2026-01', is_new:true,  audio:true,  resolution:'1080p/4K' },
    { id:'veo-3',                label:'Google Veo 3',                provider:'Google',     tier:'premium',   category:'T2V/Audio',             route:'replicate', duration_choices:[8],          max_seconds:8,  release:'2025-05', audio:true,  resolution:'1080p' },
    { id:'veo-3-fast',           label:'Google Veo 3 Fast',           provider:'Google',     tier:'fast',      category:'T2V',                   route:'replicate', duration_choices:[5,8],        max_seconds:8,  release:'2025-07', audio:false, resolution:'720p' },
    { id:'runway-gen-4.5',       label:'Runway Gen-4.5',              provider:'Runway',     tier:'exclusive', category:'T2V/I2V/V2V',           route:'provider',  duration_choices:[5,10],       max_seconds:10, release:'2025-12', is_new:true,  audio:false, resolution:'1080p' },
    { id:'runway-gen-4',         label:'Runway Gen-4',                provider:'Runway',     tier:'premium',   category:'T2V/I2V',               route:'provider',  duration_choices:[5,10],       max_seconds:10, release:'2025-03', audio:false, resolution:'1080p' },
    { id:'kling-2.5-turbo',      label:'Kling 2.5 Turbo',             provider:'Kuaishou',   tier:'premium',   category:'T2V/I2V',               route:'replicate', duration_choices:[5,10],       max_seconds:10, release:'2025-09', is_new:true,  audio:false, resolution:'1080p' },
    { id:'kling-2',              label:'Kling 2.0',                   provider:'Kuaishou',   tier:'premium',   category:'T2V/I2V',               route:'replicate', duration_choices:[5,10],       max_seconds:10, release:'2025-04', audio:false, resolution:'1080p' },
    { id:'minimax-hailuo-2.3',   label:'MiniMax Hailuo 2.3',          provider:'MiniMax',    tier:'premium',   category:'T2V/I2V',               route:'replicate', duration_choices:[6,10],       max_seconds:10, release:'2026-04', is_new:true,  audio:false, resolution:'1080p' },
    { id:'luma-ray-2',           label:'Luma Ray 2',                  provider:'Luma',       tier:'premium',   category:'T2V/I2V/Keyframes',      route:'provider',  duration_choices:[5,9],        max_seconds:9,  release:'2025-01', is_new:true,  audio:false, resolution:'720p/1080p' },
    { id:'seedance-2-pro',       label:'Seedance 2.0 Pro',            provider:'ByteDance',  tier:'premium',   category:'T2V/I2V',               route:'replicate', duration_choices:[5,6,8,10,12],max_seconds:12, release:'2026-02', is_new:true,  audio:false, resolution:'1080p' },
    { id:'pika-2',               label:'Pika 2.0',                    provider:'Pika',       tier:'premium',   category:'T2V/I2V',               route:'replicate', duration_choices:[3,5],        max_seconds:5,  release:'2024-12', audio:false, resolution:'1080p' },
    { id:'hunyuan-video',        label:'HunyuanVideo',                provider:'Tencent',    tier:'fast',      category:'T2V/Open',              route:'replicate', duration_choices:[5,10],       max_seconds:10, release:'2024-12', audio:false, resolution:'720p' },
    { id:'mochi-1',              label:'Mochi 1',                     provider:'Genmo',      tier:'fast',      category:'T2V/Open',              route:'replicate', duration_choices:[5],          max_seconds:5,  release:'2024-10', audio:false, resolution:'480p' },
    { id:'adobe-firefly-video',  label:'Adobe Firefly Video',         provider:'Adobe',      tier:'safe',      category:'T2V/I2V/Extend',        route:'provider',  duration_choices:[5],          max_seconds:5,  release:'2025-02', audio:false, resolution:'1080p' },
    // I2V
    { id:'wan-2.2-i2v-fast',     label:'Wan 2.2 I2V Fast',            provider:'Wan',        tier:'fast',      category:'I2V/Open',              route:'replicate', needs_image:true, duration_choices:[5],    max_seconds:5,  release:'2025-09', audio:false, resolution:'720p' },
    { id:'stable-video-diffusion',label:'Stable Video Diffusion',     provider:'Stability',  tier:'premium',   category:'I2V/Open',              route:'replicate', needs_image:true, duration_choices:[2,4],  max_seconds:4,  release:'2024-11', audio:false, resolution:'576p' },
    { id:'kling-1.6-i2v',        label:'Kling 1.6 I2V',               provider:'Kuaishou',   tier:'premium',   category:'I2V/Keyframes',         route:'replicate', needs_image:true, duration_choices:[5,10], max_seconds:10, release:'2025-01', audio:false, resolution:'1080p' },
    { id:'runway-gen-3-i2v',     label:'Runway Gen-3 Alpha I2V',      provider:'Runway',     tier:'premium',   category:'I2V/Keyframes',         route:'provider',  needs_image:true, duration_choices:[5,10], max_seconds:10, release:'2024-10', audio:false, resolution:'1080p' },
    { id:'luma-keyframes',       label:'Luma Keyframes',              provider:'Luma',       tier:'premium',   category:'I2V/Keyframes',         route:'provider',  needs_image:true, duration_choices:[5,9],  max_seconds:9,  release:'2024-09', audio:false, resolution:'720p/1080p' },
    { id:'hunyuan-i2v',          label:'HunyuanVideo I2V',            provider:'Tencent',    tier:'fast',      category:'I2V/Open',              route:'replicate', needs_image:true, duration_choices:[5],    max_seconds:5,  release:'2025-03', audio:false, resolution:'720p' },
    { id:'cogvideox-i2v',        label:'CogVideoX I2V',               provider:'Zhipu',      tier:'fast',      category:'I2V/Open',              route:'replicate', needs_image:true, duration_choices:[6],    max_seconds:6,  release:'2024-09', audio:false, resolution:'720p' },
    { id:'pika-2-i2v',           label:'Pika 2 I2V',                  provider:'Pika',       tier:'premium',   category:'I2V',                   route:'replicate', needs_image:true, duration_choices:[3,5],  max_seconds:5,  release:'2024-12', audio:false, resolution:'1080p' },
    // Lipsync
    { id:'sync-labs-1.9',        label:'Sync Labs Lipsync 1.9',       provider:'Sync',       tier:'exclusive', category:'Lipsync',               route:'replicate', needs_image:true, needs_audio:true, duration_choices:[null], max_seconds:60,  release:'2025-08', is_new:true, audio:false, resolution:'1080p' },
    { id:'hedra-character-3',    label:'Hedra Character-3',           provider:'Hedra',      tier:'premium',   category:'Lipsync/Talking',       route:'provider',  needs_image:true, needs_audio:true, duration_choices:[null], max_seconds:120, release:'2025-06', audio:true,  resolution:'1080p' },
    { id:'liveportrait',         label:'LivePortrait',                provider:'KwaiVGI',    tier:'fast',      category:'Lipsync/Open',          route:'replicate', needs_image:true, needs_audio:true, duration_choices:[null], max_seconds:30,  release:'2024-08', audio:false, resolution:'512p' },
    { id:'sadtalker',            label:'SadTalker',                   provider:'OpenAI Lab', tier:'fast',      category:'Lipsync/Open',          route:'replicate', needs_image:true, needs_audio:true, duration_choices:[null], max_seconds:60,  release:'2023-12', audio:false, resolution:'512p' },
    { id:'memo-talking',         label:'MEMO Avatar',                 provider:'Open Lab',   tier:'fast',      category:'Lipsync/Open',          route:'replicate', needs_image:true, needs_audio:true, duration_choices:[null], max_seconds:30,  release:'2024-12', audio:false, resolution:'720p' },
    { id:'did-talking',          label:'D-ID Talking Head',           provider:'D-ID',       tier:'safe',      category:'Lipsync/Talking',       route:'provider',  needs_image:true, needs_audio:true, duration_choices:[null], max_seconds:300, release:'2024-01', audio:true,  resolution:'720p/1080p' },
    // Upscale/Extend
    { id:'topaz-video-astra',    label:'Topaz Video AI (Astra)',      provider:'Topaz Labs', tier:'exclusive', category:'Upscale/Enhance',       route:'provider',  needs_video:true, duration_choices:[null], max_seconds:600, release:'2025-10', is_new:true, audio:false, resolution:'4K/8K' },
    { id:'real-esrgan-video',    label:'Real-ESRGAN Video',           provider:'XPixel',     tier:'premium',   category:'Upscale/Open',          route:'replicate', needs_video:true, duration_choices:[null], max_seconds:300, release:'2024-06', audio:false, resolution:'4K' },
    { id:'video-upscaler-x4',    label:'Video Upscaler 4×',           provider:'Open Lab',   tier:'fast',      category:'Upscale/Open',          route:'replicate', needs_video:true, duration_choices:[null], max_seconds:120, release:'2024-08', audio:false, resolution:'4K' },
    { id:'rife-frame-interp',    label:'RIFE Frame Interpolation',    provider:'Open Lab',   tier:'fast',      category:'Upscale/Interpolation', route:'replicate', needs_video:true, duration_choices:[null], max_seconds:600, release:'2024-04', audio:false, resolution:'as input' },
    { id:'sora-2-extend',        label:'Sora 2 Extend',               provider:'OpenAI',     tier:'exclusive', category:'Extend/T2V',            route:'provider',  needs_video:true, duration_choices:[4,8],  max_seconds:8,  release:'2025-12', is_new:true, audio:true,  resolution:'1080p' },
    { id:'kling-extension',      label:'Kling Extension',             provider:'Kuaishou',   tier:'premium',   category:'Extend',                route:'replicate', needs_video:true, duration_choices:[5],    max_seconds:10, release:'2025-03', audio:false, resolution:'1080p' },
    { id:'luma-extend',          label:'Luma Extend',                 provider:'Luma',       tier:'premium',   category:'Extend',                route:'provider',  needs_video:true, duration_choices:[5,9],  max_seconds:18, release:'2025-02', audio:false, resolution:'720p/1080p' },
    { id:'firefly-video-extend', label:'Adobe Firefly Extend',        provider:'Adobe',      tier:'safe',      category:'Extend',                route:'provider',  needs_video:true, duration_choices:[2,5],  max_seconds:5,  release:'2025-04', audio:false, resolution:'1080p' },
  ];

  res.json({ models, features });
});

/* ── Image upload multer (images + video) ───────────────────── */
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.bin';
      cb(null, `media-${nanoid(10)}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter(_req, file, cb) {
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                         'video/mp4', 'video/quicktime', 'video/x-msvideo'];
    const allowedExt  = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.avi'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('이미지(JPG/PNG/WebP) 또는 영상 파일만 업로드 가능해요'));
    }
  },
});

/* ── POST /api/video/upload ─────────────────────────────────── */
app.post('/api/video/upload', uploadMedia.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 없어요. file 필드로 업로드해 주세요.' });
    }

    // R2 사용 가능하면 R2에 업로드, 아니면 로컬 URL 반환
    const r2Client = createR2Client();
    const r2Bucket = getR2BucketForPurpose('uploads');

    if (r2Client && r2Bucket) {
      try {
        const key = `uploads/${Date.now()}-${nanoid(10)}-${sanitizeObjectName(req.file.originalname)}`;
        const fileBuffer = fs.readFileSync(req.file.path);
        await r2Client.send(new PutObjectCommand({
          Bucket: r2Bucket,
          Key:    key,
          Body:   fileBuffer,
          ContentType: req.file.mimetype,
        }));
        fs.unlink(req.file.path, () => {});
        // R2 public URL 패턴: R2_PUBLIC_URL 환경변수 사용
        const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
        const url = publicBase
          ? `${publicBase}/${key}`
          : `https://${r2Bucket}.r2.dev/${key}`;
        return res.json({ url, key, storage: 'r2' });
      } catch (r2err) {
        console.warn('[api/video/upload] R2 failed, falling back to local:', r2err.message);
      }
    }

    // 로컬 폴백 — 개발 환경 또는 R2 미설정
    const localUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    // 로컬 파일은 uploads/ static에서 직접 서빙
    res.json({ url: localUrl, filename: req.file.filename, storage: 'local' });
  } catch (err) {
    console.error('[api/video/upload]', err.message);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: `업로드 실패: ${err.message}` });
  }
});

/* ── POST /api/video/generate ───────────────────────────────── */
app.post('/api/video/generate', async (req, res) => {
  const {
    model: modelId = '',
    prompt = '',
    image_url,
    duration = 5,
    aspect_ratio = '16:9',
    audio = false,
  } = req.body || {};

  const replicateKey = (
    req.headers['x-user-key-replicate'] ||
    process.env.REPLICATE_API_KEY || ''
  ).trim();

  if (!replicateKey) {
    return res.status(400).json({ error: 'Replicate API 키가 없습니다. Settings → API Keys에서 등록해 주세요.' });
  }

  const replicateModel = REPLICATE_MODEL_MAP[modelId];
  if (!replicateModel) {
    return res.status(400).json({ error: `지원하지 않는 모델입니다: ${modelId}. Replicate 연동 모델이 아닌가요?` });
  }

  // Replicate predictions API — POST /v1/models/{owner}/{name}/predictions
  const [owner, name] = replicateModel.split('/');
  const predictUrl = `https://api.replicate.com/v1/models/${owner}/${name}/predictions`;

  const input = { prompt };
  if (image_url)    input.image = image_url;
  if (duration)     input.duration = Number(duration);
  if (aspect_ratio) input.aspect_ratio = aspect_ratio;
  if (audio)        input.generate_audio = true;

  try {
    const r = await fetch(predictUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${replicateKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'respond-async',
      },
      body: JSON.stringify({ input }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      let msg = `Replicate 실패 (${r.status})`;
      if (r.status === 401) msg = 'Replicate API 키가 올바르지 않습니다.';
      else if (r.status === 402) msg = 'Replicate 크레딧이 부족합니다.';
      else if (r.status === 422) msg = `입력 오류: ${t.slice(0, 200)}`;
      return res.status(r.status).json({ error: msg });
    }

    const data = await r.json();
    res.json({ id: data.id, status: data.status || 'starting' });
  } catch (err) {
    console.error('[api/video/generate]', err.message);
    res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
});

/* ── GET /api/video/status/:id ──────────────────────────────── */
app.get('/api/video/status/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });

  const replicateKey = (
    req.headers['x-user-key-replicate'] ||
    process.env.REPLICATE_API_KEY || ''
  ).trim();

  if (!replicateKey) {
    return res.status(400).json({ error: 'Replicate API 키가 없습니다.' });
  }

  try {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${replicateKey}` },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `상태 조회 실패 (${r.status})` });
    }

    const data = await r.json();
    // Normalize: output can be string or array
    let video_url = null;
    if (data.output) {
      video_url = Array.isArray(data.output) ? data.output[0] : data.output;
    }

    res.json({
      id:        data.id,
      status:    data.status,   // starting | processing | succeeded | failed | canceled
      video_url: video_url || null,
      error:     data.error || null,
    });
  } catch (err) {
    console.error('[api/video/status]', err.message);
    res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
});

/* ── GET /api/keys/test ─────────────────────────────────────── */
app.get('/api/keys/test', async (req, res) => {
  const keys = {
    elevenlabs: (req.headers['x-user-key-elevenlabs'] || process.env.ELEVENLABS_API_KEY || '').trim(),
    openai:     (req.headers['x-user-key-openai']     || process.env.OPENAI_API_KEY     || '').trim(),
    anthropic:  (req.headers['x-user-key-anthropic']  || process.env.ANTHROPIC_API_KEY  || '').trim(),
    replicate:  (req.headers['x-user-key-replicate']  || process.env.REPLICATE_API_KEY  || '').trim(),
  };

  const results = {};

  await Promise.allSettled([
    // ElevenLabs — GET /v1/user (light check)
    (async () => {
      const k = keys.elevenlabs;
      if (!k) { results.elevenlabs = { ok: false, msg: '키 없음' }; return; }
      try {
        const r = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': k },
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          const chars = d.subscription?.character_count;
          const limit = d.subscription?.character_limit;
          const msg = (chars != null && limit != null)
            ? `✓ 연결됨 · 잔여 ${(limit - chars).toLocaleString()} chars`
            : '✓ 연결됨';
          results.elevenlabs = { ok: true, msg };
        } else if (r.status === 401) {
          results.elevenlabs = { ok: false, msg: '인증 실패 (잘못된 키)' };
        } else {
          results.elevenlabs = { ok: false, msg: `HTTP ${r.status}` };
        }
      } catch (e) {
        results.elevenlabs = { ok: false, msg: `오류: ${e.message.slice(0, 60)}` };
      }
    })(),

    // OpenAI — GET /v1/models (light check)
    (async () => {
      const k = keys.openai;
      if (!k) { results.openai = { ok: false, msg: '키 없음' }; return; }
      try {
        const r = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${k}` },
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok)              results.openai = { ok: true,  msg: '✓ 연결됨' };
        else if (r.status === 401) results.openai = { ok: false, msg: '인증 실패 (잘못된 키)' };
        else                   results.openai = { ok: false, msg: `HTTP ${r.status}` };
      } catch (e) {
        results.openai = { ok: false, msg: `오류: ${e.message.slice(0, 60)}` };
      }
    })(),

    // Anthropic — POST /v1/messages minimal test
    (async () => {
      const k = keys.anthropic;
      if (!k) { results.anthropic = { ok: false, msg: '키 없음' }; return; }
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key':         k,
            'anthropic-version': '2023-06-01',
            'Content-Type':      'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (r.ok || r.status === 200) results.anthropic = { ok: true,  msg: '✓ 연결됨' };
        else if (r.status === 401)    results.anthropic = { ok: false, msg: '인증 실패 (잘못된 키)' };
        else if (r.status === 529)    results.anthropic = { ok: true,  msg: '✓ 유효 (서버 과부하)' };
        else                          results.anthropic = { ok: false, msg: `HTTP ${r.status}` };
      } catch (e) {
        results.anthropic = { ok: false, msg: `오류: ${e.message.slice(0, 60)}` };
      }
    })(),

    // Replicate — GET /v1/account
    (async () => {
      const k = keys.replicate;
      if (!k) { results.replicate = { ok: false, msg: '키 없음' }; return; }
      try {
        const r = await fetch('https://api.replicate.com/v1/account', {
          headers: { 'Authorization': `Bearer ${k}` },
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          results.replicate = { ok: true, msg: `✓ 연결됨${d.username ? ' · @' + d.username : ''}` };
        } else if (r.status === 401) {
          results.replicate = { ok: false, msg: '인증 실패 (잘못된 키)' };
        } else {
          results.replicate = { ok: false, msg: `HTTP ${r.status}` };
        }
      } catch (e) {
        results.replicate = { ok: false, msg: `오류: ${e.message.slice(0, 60)}` };
      }
    })(),
  ]);

  res.json(results);
});

/* ── Health check ───────────────────────────────────────────── */
app.get(['/api/health', '/api/healthz'], (_req, res) => {
  res.json({
    ok: true,
    server: 'soaviz-render',
    port: Number(PORT),
    endpoints: [
      'GET  /api/voices',
      'POST /api/tts',
      'POST /api/music',
      'POST /api/sfx',
      'GET  /api/video/models',
      'POST /api/video/generate',
      'GET  /api/video/status/:id',
      'POST /api/video/upload',
      'GET  /api/keys/test',
      'POST /api/text/generate',
      'POST /api/image/generate',
      'POST /api/analyze-video',
      'POST /api/render-video',
    ],
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'soaviz backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/supabase-health', async (_req, res) => {
  const health = await checkSupabaseConnection();
  res.json(health);
});

app.get('/api/r2-health', async (_req, res) => {
  const health = await checkR2Connection();
  res.json(health);
});

app.post('/api/r2-presigned-upload', async (req, res) => {
  const purpose = String(req.body?.purpose || 'uploads');
  const allowedPurposes = new Set(['uploads', 'outputs', 'thumbnails', 'assets']);
  if (!allowedPurposes.has(purpose)) {
    return res.status(400).json({ success: false, error: 'unsupported_r2_purpose' });
  }

  const client = createR2Client();
  const bucket = getR2BucketForPurpose(purpose);
  if (!client || !bucket) {
    return res.status(503).json({
      success: false,
      error: 'r2_not_configured',
      env: getR2HealthConfig(),
    });
  }

  try {
    const fileName = sanitizeObjectName(req.body?.fileName);
    const contentType = String(req.body?.contentType || 'application/octet-stream').slice(0, 120);
    const key = `${purpose}/${Date.now()}-${nanoid(10)}-${fileName}`;
    const expiresIn = Math.min(Math.max(Number(req.body?.expiresIn || 600), 60), 900);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    return res.json({
      success: true,
      method: 'PUT',
      uploadUrl,
      key,
      purpose,
      expiresIn,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('[r2 presign error]', error.message);
    return res.status(500).json({ success: false, error: 'r2_presign_failed' });
  }
});

/* ── Mobile Review Share ────────────────────────────────────── */
// 인메모리 저장소 (서버 재시작 시 초기화됨)
// Supabase가 연결되어 있으면 mobile_reviews 테이블에 병행 저장합니다.
const _reviewStore = new Map(); // shareId → { reviewPackage, expiresAt }
const REVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
  } catch (_) { return null; }
}

async function tryInsertReviewToSupabase(shareId, reviewPackage) {
  const sb = getSupabaseClient();
  if (!sb) return false;
  try {
    const { error } = await sb.from('mobile_reviews').upsert({
      share_id:       shareId,
      review_id:      reviewPackage.reviewId,
      share_token:    reviewPackage.shareToken,
      project_id:     reviewPackage.projectId,
      project_title:  reviewPackage.projectTitle,
      title:          reviewPackage.title,
      status:         reviewPackage.status || 'draft',
      payload:        reviewPackage,
      expires_at:     new Date(Date.now() + REVIEW_TTL_MS).toISOString(),
      created_at:     new Date(reviewPackage.createdAt || Date.now()).toISOString(),
      updated_at:     new Date().toISOString()
    }, { onConflict: 'share_id' });
    if (error) { console.warn('[review] supabase upsert error:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[review] supabase insert failed:', e.message);
    return false;
  }
}

async function tryGetReviewFromSupabase(shareId, token) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('mobile_reviews')
      .select('payload, share_token, expires_at')
      .eq('share_id', shareId)
      .single();
    if (error || !data) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
    if (data.share_token !== token) return null;
    return data.payload;
  } catch (e) {
    console.warn('[review] supabase get failed:', e.message);
    return null;
  }
}

// POST /api/mobile-review/share
// body: { reviewPackage: {...} }
// → { success, shareId, shareUrl }
app.post('/api/mobile-review/share', async (req, res) => {
  try {
    const { reviewPackage } = req.body || {};
    if (!reviewPackage || typeof reviewPackage !== 'object') {
      return res.status(400).json({ success: false, error: 'reviewPackage_required' });
    }
    // 토큰 검증 — 프론트에서 생성한 shareToken을 그대로 사용
    const shareToken = String(reviewPackage.shareToken || nanoid(12));
    const shareId    = String(reviewPackage.reviewId   || nanoid(16));

    // 크기 제한 (500KB)
    const payloadSize = Buffer.byteLength(JSON.stringify(reviewPackage), 'utf8');
    if (payloadSize > 500 * 1024) {
      return res.status(413).json({ success: false, error: 'payload_too_large' });
    }

    // 메모리 저장
    _reviewStore.set(shareId, {
      reviewPackage: { ...reviewPackage, shareToken },
      expiresAt: Date.now() + REVIEW_TTL_MS
    });

    // Supabase 병행 저장 (실패해도 메모리 응답 우선)
    tryInsertReviewToSupabase(shareId, { ...reviewPackage, shareToken }).catch(() => {});

    const origin   = req.headers.origin || `https://${req.headers.host}` || 'https://soaviz-studio.vercel.app';
    const shareUrl = `${origin}?mobileReview=${encodeURIComponent(shareId)}&token=${encodeURIComponent(shareToken)}`;

    console.log(`[review] shared: ${shareId} (${(payloadSize / 1024).toFixed(1)}KB)`);
    return res.json({ success: true, shareId, shareToken, shareUrl });
  } catch (e) {
    console.error('[review] share error:', e.message);
    return res.status(500).json({ success: false, error: 'share_failed' });
  }
});

// GET /api/mobile-review/:shareId?token=xxx
// → { success, reviewPackage }
app.get('/api/mobile-review/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const token = String(req.query.token || '');
    if (!shareId || !token) {
      return res.status(400).json({ success: false, error: 'shareId_and_token_required' });
    }

    // 1. 메모리에서 조회
    const entry = _reviewStore.get(shareId);
    if (entry) {
      if (entry.expiresAt < Date.now()) {
        _reviewStore.delete(shareId);
      } else if (entry.reviewPackage.shareToken === token) {
        return res.json({ success: true, reviewPackage: entry.reviewPackage });
      } else {
        return res.status(403).json({ success: false, error: 'invalid_token' });
      }
    }

    // 2. Supabase fallback
    const pkg = await tryGetReviewFromSupabase(shareId, token);
    if (pkg) {
      // 다시 메모리에 캐시
      _reviewStore.set(shareId, { reviewPackage: pkg, expiresAt: Date.now() + REVIEW_TTL_MS });
      return res.json({ success: true, reviewPackage: pkg });
    }

    return res.status(404).json({ success: false, error: 'review_not_found' });
  } catch (e) {
    console.error('[review] get error:', e.message);
    return res.status(500).json({ success: false, error: 'get_failed' });
  }
});

/* ── 에러 핸들러 ─────────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('[express error]', err.message);
  res.status(500).json({ success: false, error: err.message });
});

/* ── Start ──────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n✅ soaviz render server`);
  console.log(`   http://localhost:${PORT}/soaviz-studio.html`);
  console.log(`   POST http://localhost:${PORT}/api/analyze-video`);
  console.log(`   POST http://localhost:${PORT}/api/render-video\n`);
});
