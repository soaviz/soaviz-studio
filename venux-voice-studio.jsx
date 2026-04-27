/**
 * VenuX Voice Studio
 * AI 아이돌 페르소나 5인 + MBTI 16종 캐릭터 보이스 시스템
 * ─────────────────────────────────────────────────────────────
 * - React 18+ 단일 파일 (default export)
 * - Tailwind CSS 유틸리티 클래스
 * - lucide-react 아이콘
 * - ElevenLabs TTS (직접 호출) → 키 미입력 시 Web Speech API 폴백
 * - localStorage 사용 금지 (React state만)
 * ─────────────────────────────────────────────────────────────
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Download, Copy, KeyRound, Eye, EyeOff,
  Sparkles, GitCompare, History, Trash2, Loader2,
  ChevronDown, Volume2, AudioWaveform, Settings2,
} from 'lucide-react';

/* ════════════════════════════════════════════════════════════
   1. VenuX 5인 페르소나
   ════════════════════════════════════════════════════════════ */
const VENUX_MEMBERS = [
  {
    id: 'rua',
    name: 'Rua Lane',
    nameKo: '이루나',
    initial: 'R',
    color: '#FF6B9D',
    domain: 'Beauty',
    personality: '따뜻하고 파워풀한 메인보컬. 자신감 있으면서 포근한 톤. 감성적이지만 절대 약하지 않음.',
    greeting: '안녕, 나는 루아. 오늘도 빛나는 하루 보내고 있어?',
    voice_id: 'EXAVITQu4vr4xnSDxMaL',  // ElevenLabs Bella
    settings: { stability: 0.40, similarity_boost: 0.80, style: 0.70, use_speaker_boost: true },
    fallback: { rate: 1.00, pitch: 1.10 },
    designHint: '여성 음성, 20대 초반, 한국어',
  },
  {
    id: 'lea',
    name: 'Léa Voss',
    nameKo: '박리라',
    initial: 'L',
    color: '#C0C0C0',
    domain: 'Fashion',
    personality: '차갑고 도도한 팔세토. 말 수 적고 간결. "…" 같은 침묵이 언어인 존재. 쿨톤 ASMR 느낌.',
    greeting: '…레아야. 말은 짧게 할게.',
    voice_id: 'XB0fDUnXU5powFXDhCwa',  // ElevenLabs Charlotte
    settings: { stability: 0.75, similarity_boost: 0.65, style: 0.30, use_speaker_boost: false },
    fallback: { rate: 0.85, pitch: 1.30 },
    designHint: '여성 음성, 20대 초반, 한국어',
  },
  {
    id: 'rui',
    name: 'Rui Nova',
    nameKo: '신지우',
    initial: 'R',
    color: '#7B68EE',
    domain: 'Tech',
    personality: '중성적이고 클린한 보이스. 감정 없이 정확하게 전달. 데이터 리포트 읽는 AI 같은 톤.',
    greeting: '데이터 분석 완료. 루이 노바, 리포트 시작합니다.',
    voice_id: 'Xb7hH8MSUJpSbSDYk0k2',  // ElevenLabs Alice
    settings: { stability: 0.85, similarity_boost: 0.90, style: 0.15, use_speaker_boost: true },
    fallback: { rate: 1.00, pitch: 0.95 },
    designHint: '중성 음성, 20대 중반, 한국어',
  },
  {
    id: 'noa',
    name: 'Noa Wilde',
    nameKo: '최노아',
    initial: 'N',
    color: '#FF8C42',
    domain: 'Travel',
    personality: '밝고 에너제틱한 래퍼 톤. 빠른 속도감. 자유분방하고 신나는 에너지. 여행 브이로그 MC 느낌.',
    greeting: '헤이! 노아야~ 오늘은 어디로 떠나볼까?',
    voice_id: 'cgSgspJ2msm6clMCkdW9',  // ElevenLabs Jessica
    settings: { stability: 0.30, similarity_boost: 0.70, style: 0.85, use_speaker_boost: true },
    fallback: { rate: 1.30, pitch: 1.20 },
    designHint: '여성 음성, 20대 초반, 한국어',
  },
  {
    id: 'aon',
    name: 'Aon Seo',
    nameKo: '정아온',
    initial: 'A',
    color: '#8B6F47',
    domain: 'Wellness',
    personality: '소프트하고 섬세한 속삭임. 가장 인간적인 AI. ASMR 수면 명상 가이드 같은 톤.',
    greeting: '천천히… 숨을 쉬어봐. 아온이가 함께할게.',
    voice_id: '21m00Tcm4TlvDq8ikWAM',  // ElevenLabs Rachel
    settings: { stability: 0.60, similarity_boost: 0.75, style: 0.50, use_speaker_boost: false },
    fallback: { rate: 0.80, pitch: 1.05 },
    designHint: '여성 음성, 20대 초반, 한국어',
  },
];

/* ════════════════════════════════════════════════════════════
   2. MBTI 16종 (정확한 파라미터)
   ════════════════════════════════════════════════════════════ */
const MBTI_VOICES = [
  // ── 분석가 (NT) — 차분/논리/중성 ──
  { type: 'INTJ', alias: '전략가',     style_desc: '냉철하고 논리적. 군더더기 없음. 확신에 찬 단정적 어조.', stability: 0.85, similarity_boost: 0.85, style: 0.20, gender: '중성', voice_id: 'pqHfZKP75CvOlQylNhV4', color: '#7C3AED' },
  { type: 'INTP', alias: '논리술사',   style_desc: '혼잣말 같은 사색적 톤. "음… 근데 이건…" 같은 머뭇거림.',  stability: 0.70, similarity_boost: 0.75, style: 0.25, gender: '중성', voice_id: 'TxGEqnHWrfWFTfGW9XjX', color: '#6366F1' },
  { type: 'ENTJ', alias: '통솔자',     style_desc: '강하고 단호한 리더 톤. 명령문 자주 사용. 카리스마 있는 저음.', stability: 0.80, similarity_boost: 0.80, style: 0.40, gender: '중성', voice_id: 'pqHfZKP75CvOlQylNhV4', color: '#DC2626' },
  { type: 'ENTP', alias: '변론가',     style_desc: '장난스럽고 도발적. 빠른 속도. "자, 여기서 반전이지~" 스타일.', stability: 0.35, similarity_boost: 0.70, style: 0.80, gender: '중성', voice_id: 'TX3LPaxmHKxFdv7VOQHJ', color: '#F59E0B' },

  // ── 외교관 (NF) — 따뜻/감성/여성 ──
  { type: 'INFJ', alias: '옹호자',     style_desc: '따뜻하지만 깊은 톤. 조용한 확신. 시적 표현.',           stability: 0.65, similarity_boost: 0.80, style: 0.55, gender: '여성', voice_id: '21m00Tcm4TlvDq8ikWAM', color: '#A78BFA' },
  { type: 'INFP', alias: '중재자',     style_desc: '부드럽고 몽환적. 살짝 떨리는 듯한 감성. 독백 느낌.',     stability: 0.50, similarity_boost: 0.75, style: 0.60, gender: '여성', voice_id: 'XB0fDUnXU5powFXDhCwa', color: '#EC4899' },
  { type: 'ENFJ', alias: '선도자',     style_desc: '따뜻하고 설득력 있는 연설가 톤. 격려와 공감.',          stability: 0.55, similarity_boost: 0.80, style: 0.65, gender: '여성', voice_id: 'EXAVITQu4vr4xnSDxMaL', color: '#10B981' },
  { type: 'ENFP', alias: '활동가',     style_desc: '초에너지. 감탄사 많음. "와! 이거 대박이야!" 스타일.',   stability: 0.25, similarity_boost: 0.65, style: 0.90, gender: '여성', voice_id: 'cgSgspJ2msm6clMCkdW9', color: '#F97316' },

  // ── 관리자 (SJ) — 실용/안정 ──
  { type: 'ISTJ', alias: '현실주의자', style_desc: '정확하고 건조한 보고 톤. 매뉴얼 읽는 느낌.',           stability: 0.90, similarity_boost: 0.90, style: 0.10, gender: '중성', voice_id: 'pqHfZKP75CvOlQylNhV4', color: '#475569' },
  { type: 'ISFJ', alias: '수호자',     style_desc: '다정하고 안정적. 엄마 같은 포근함. 걱정하는 톤.',       stability: 0.70, similarity_boost: 0.80, style: 0.45, gender: '여성', voice_id: '21m00Tcm4TlvDq8ikWAM', color: '#0EA5E9' },
  { type: 'ESTJ', alias: '경영자',     style_desc: '실용적이고 지시적. 빠른 판단. "바로 하세요" 스타일.',   stability: 0.80, similarity_boost: 0.85, style: 0.35, gender: '중성', voice_id: 'pqHfZKP75CvOlQylNhV4', color: '#B45309' },
  { type: 'ESFJ', alias: '집정관',     style_desc: '친근하고 사교적. 수다스럽지만 배려 깊음.',              stability: 0.50, similarity_boost: 0.75, style: 0.60, gender: '여성', voice_id: 'EXAVITQu4vr4xnSDxMaL', color: '#EAB308' },

  // ── 탐험가 (SP) — 행동/즉흥 ──
  { type: 'ISTP', alias: '장인',       style_desc: '무뚝뚝하고 최소한의 말. 행동 > 말. "됐어. 해봐."',     stability: 0.85, similarity_boost: 0.80, style: 0.15, gender: '중성', voice_id: 'TxGEqnHWrfWFTfGW9XjX', color: '#64748B' },
  { type: 'ISFP', alias: '모험가',     style_desc: '감성적이고 조용한 예술가. 그림 그리듯 천천히 말함.',     stability: 0.55, similarity_boost: 0.70, style: 0.50, gender: '여성', voice_id: 'XB0fDUnXU5powFXDhCwa', color: '#06B6D4' },
  { type: 'ESTP', alias: '사업가',     style_desc: '자신감 넘치고 빠름. 액션 영화 주인공 톤. 쿨한 유머.',    stability: 0.35, similarity_boost: 0.75, style: 0.75, gender: '중성', voice_id: 'TX3LPaxmHKxFdv7VOQHJ', color: '#EF4444' },
  { type: 'ESFP', alias: '연예인',     style_desc: '무대 위 MC. 가장 밝고 텐션 높음. 관객과 대화하는 느낌.', stability: 0.20, similarity_boost: 0.65, style: 0.95, gender: '여성', voice_id: 'cgSgspJ2msm6clMCkdW9', color: '#FB7185' },
];

/* MBTI Web Speech 폴백 매핑 — 계열별 baseline + E/I 보정 */
function mbtiFallbackParams(type) {
  // 1단계: 계열 매핑 (xNTx / xNFx / xSTx / xSFx)
  let rate, pitch;
  if (type[1] === 'N' && type[2] === 'T') { rate = 1.00; pitch = 0.90; }
  else if (type[1] === 'N' && type[2] === 'F') { rate = 0.90; pitch = 1.10; }
  else if (type[1] === 'S' && type[2] === 'T') { rate = 1.10; pitch = 0.85; }
  else { rate = 0.95; pitch = 1.15; } // xSFx
  // 2단계: E/I 보정
  if (type[0] === 'E') rate += 0.10;
  else rate -= 0.05;
  return { rate: Math.max(0.5, Math.min(2.0, rate)), pitch: Math.max(0.5, Math.min(2.0, pitch)) };
}

/* ════════════════════════════════════════════════════════════
   3. ElevenLabs 호출 + Web Speech 폴백
   ════════════════════════════════════════════════════════════ */
const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

async function elevenTTS({ apiKey, voice_id, text, settings }) {
  const r = await fetch(`${ELEVEN_BASE}/text-to-speech/${voice_id}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: settings.stability,
        similarity_boost: settings.similarity_boost,
        style: settings.style,
        use_speaker_boost: settings.use_speaker_boost ?? true,
      },
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`TTS 실패 (${r.status}) ${t.slice(0, 160)}`);
  }
  return await r.blob();
}

function speakWebSpeech({ text, rate, pitch, lang = 'ko-KR' }) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('이 브라우저는 Web Speech API를 지원하지 않아요'));
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate;
    utter.pitch = pitch;
    // 한국어 보이스 우선
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.startsWith('ko'));
    if (koVoice) utter.voice = koVoice;
    utter.onend = resolve;
    utter.onerror = (e) => reject(new Error(e.error || 'Web Speech 실패'));
    window.speechSynthesis.speak(utter);
  });
}

/* ════════════════════════════════════════════════════════════
   4. 메인 컴포넌트
   ════════════════════════════════════════════════════════════ */
export default function VenuXVoiceStudio({
  defaultTab = 'venux',
  defaultText = '',
} = {}) {
  /* ── state ── */
  const [tab, setTab] = useState(defaultTab);                    // 'venux' | 'mbti'
  const [selectedId, setSelectedId] = useState(VENUX_MEMBERS[0].id);
  const [compareMode, setCompareMode] = useState(false);
  const [compareId, setCompareId] = useState(null);

  // API 키 — React state만 (localStorage 금지)
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // 텍스트
  const [text, setText] = useState(defaultText);

  // 슬라이더 — 선택 캐릭터 프리셋에서 시작, 사용자 미세 조정
  const [stab, setStab] = useState(0.5);
  const [clar, setClar] = useState(0.75);  // similarity_boost
  const [styl, setStyl] = useState(0.5);

  // 재생 상태
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState(null);  // history item id 또는 'live'
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);        // 최근 5개
  const audioRefA = useRef(null);
  const audioRefB = useRef(null);

  /* ── 보이스 풀 ── */
  const allVoices = useMemo(() => {
    if (tab === 'venux') return VENUX_MEMBERS;
    return MBTI_VOICES.map(m => ({
      id: `mbti-${m.type}`,
      name: m.type,
      nameKo: m.alias,
      initial: m.type.slice(0, 2),
      color: m.color,
      domain: m.gender,
      personality: m.style_desc,
      greeting: `안녕. ${m.alias}야. ${m.style_desc.split('.')[0]}.`,
      voice_id: m.voice_id,
      settings: { stability: m.stability, similarity_boost: m.similarity_boost, style: m.style, use_speaker_boost: true },
      fallback: mbtiFallbackParams(m.type),
      mbti: m.type,
    }));
  }, [tab]);

  const current = allVoices.find(v => v.id === selectedId) || allVoices[0];
  const compareVoice = compareMode && compareId
    ? allVoices.find(v => v.id === compareId) || null
    : null;

  /* ── 탭 전환 시 첫 보이스 ── */
  useEffect(() => {
    if (!allVoices.find(v => v.id === selectedId)) {
      setSelectedId(allVoices[0].id);
    }
    if (compareId && !allVoices.find(v => v.id === compareId)) {
      setCompareId(null);
    }
  }, [tab]); // eslint-disable-line

  /* ── 캐릭터 선택 시 인사말 + 슬라이더 프리셋 ── */
  useEffect(() => {
    if (current) {
      setText(current.greeting || '');
      setStab(current.settings.stability);
      setClar(current.settings.similarity_boost);
      setStyl(current.settings.style);
      setError('');
    }
  }, [current?.id]); // eslint-disable-line

  /* ── 생성 ── */
  const generate = async (target = 'A') => {
    setError('');
    if (!text.trim()) { setError('읽을 텍스트를 입력해 주세요'); return; }
    if (text.length > 500) { setError('500자 이하로 입력해 주세요'); return; }
    setBusy(true);
    setPlayingId('live');

    const useVoice = target === 'B' && compareVoice ? compareVoice : current;
    const isCompare = target === 'B';
    const audioRef = isCompare ? audioRefB : audioRefA;

    try {
      if (apiKey) {
        // ElevenLabs 경로
        const settings = isCompare
          ? useVoice.settings
          : { stability: stab, similarity_boost: clar, style: styl, use_speaker_boost: useVoice.settings.use_speaker_boost };
        const blob = await elevenTTS({
          apiKey, voice_id: useVoice.voice_id, text: text.trim(), settings,
        });
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play().catch(() => {});
        }
        // history (A 트랙만 기록)
        if (!isCompare) {
          const item = {
            id: Date.now(),
            blobUrl: url,
            text: text.trim(),
            voice: useVoice,
            ts: new Date(),
            settings,
          };
          setHistory(h => [item, ...h].slice(0, 5));
        }
      } else {
        // Web Speech 폴백
        const fb = useVoice.fallback || { rate: 1, pitch: 1 };
        await speakWebSpeech({ text: text.trim(), rate: fb.rate, pitch: fb.pitch });
        if (!isCompare) {
          const item = {
            id: Date.now(),
            blobUrl: null,    // Web Speech는 blob 없음
            text: text.trim(),
            voice: useVoice,
            ts: new Date(),
            fallback: true,
          };
          setHistory(h => [item, ...h].slice(0, 5));
        }
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setTimeout(() => setPlayingId(null), 600);
    }
  };

  /* ── 다운로드 ── */
  const downloadCurrent = () => {
    const last = history[0];
    if (!last?.blobUrl) {
      setError('다운로드 가능한 mp3가 없어요. 먼저 ElevenLabs 키 입력 후 재생해 주세요.');
      return;
    }
    const a = document.createElement('a');
    a.href = last.blobUrl;
    a.download = `${last.voice.id}_${last.ts.getTime()}.mp3`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* ── JSON 복사 ── */
  const copyParams = async () => {
    const payload = {
      voice_id: current.voice_id,
      voice_settings: {
        stability: stab,
        similarity_boost: clar,
        style: styl,
        use_speaker_boost: current.settings.use_speaker_boost ?? true,
      },
      character: { id: current.id, name: current.name, nameKo: current.nameKo },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setError('');
    } catch {
      setError('복사 실패');
    }
  };

  const playFromHistory = (item) => {
    if (item.blobUrl) {
      if (audioRefA.current) {
        audioRefA.current.src = item.blobUrl;
        audioRefA.current.play().catch(() => {});
        setPlayingId(item.id);
      }
    } else {
      // 폴백 항목 — 다시 Web Speech
      speakWebSpeech({ text: item.text, rate: item.voice.fallback.rate, pitch: item.voice.fallback.pitch })
        .catch(e => setError(e.message));
    }
  };

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E8E8E8] font-['Noto_Sans_KR',sans-serif]"
         style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* Google Fonts injection */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }
        .glow-ring::before {
          content:''; position:absolute; inset:-3px; border-radius:9999px;
          background: var(--ring-color); filter: blur(12px); opacity:0.6; z-index:-1;
        }
        @keyframes wavePulse {
          0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .wave-bar {
          width:3px; background: var(--bar-color); border-radius:2px; transform-origin:center;
          animation: wavePulse 0.9s ease-in-out infinite;
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: var(--accent, #A78BFA); cursor: pointer; border: 2px solid #0A0A0A;
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: var(--accent, #A78BFA); cursor: pointer; border: 2px solid #0A0A0A;
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-8 sm:py-10">
        {/* ── HEADER ── */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 mb-8 border-b border-[#222]">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl text-white leading-none">
              VENUX VOICE STUDIO
            </h1>
            <p className="text-sm text-[#666] mt-2">
              AI 아이돌 페르소나 5인 + MBTI 캐릭터 16종 보이스 시스템
            </p>
          </div>
          {/* API 키 */}
          <div className="flex items-center gap-2 bg-[#141414] border border-[#222] rounded-lg p-1.5 pl-3">
            <KeyRound size={14} className="text-[#666]" />
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="ElevenLabs API Key (없으면 Web Speech)"
              className="bg-transparent border-0 outline-none text-xs font-mono w-56 sm:w-72"
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(s => !s)}
              className="p-1.5 rounded text-[#666] hover:text-white hover:bg-[#1f1f1f] transition"
              aria-label={showKey ? 'hide' : 'show'}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </header>

        {/* ── TABS ── */}
        <div className="inline-flex bg-[#141414] border border-[#222] rounded-full p-1 mb-8">
          <TabBtn active={tab === 'venux'} onClick={() => setTab('venux')}>
            <Sparkles size={14} className="mr-1.5" /> VenuX Idol 5
          </TabBtn>
          <TabBtn active={tab === 'mbti'} onClick={() => setTab('mbti')}>
            <AudioWaveform size={14} className="mr-1.5" /> MBTI Voice 16
          </TabBtn>
          <button
            onClick={() => { setCompareMode(c => !c); if (compareMode) setCompareId(null); }}
            className={`ml-2 px-4 py-2 rounded-full text-xs font-medium inline-flex items-center transition ${
              compareMode ? 'bg-white text-black' : 'text-[#888] hover:text-white'
            }`}
            title="A/B 비교 모드"
          >
            <GitCompare size={13} className="mr-1.5" />
            A/B 비교 {compareMode && '·ON'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* ── LEFT ── */}
          <div className="space-y-6 min-w-0">
            {/* Voice grid */}
            {tab === 'venux' ? (
              <VenuXGrid
                members={VENUX_MEMBERS}
                selectedId={selectedId}
                compareId={compareId}
                compareMode={compareMode}
                onSelect={(id) => {
                  if (compareMode && id !== selectedId) setCompareId(id);
                  else setSelectedId(id);
                }}
              />
            ) : (
              <MBTIGrid
                voices={allVoices}
                selectedId={selectedId}
                compareId={compareId}
                compareMode={compareMode}
                onSelect={(id) => {
                  if (compareMode && id !== selectedId) setCompareId(id);
                  else setSelectedId(id);
                }}
              />
            )}

            {/* SELECTED + EDITOR */}
            <section
              className="rounded-2xl bg-[#141414] border border-[#222] p-6"
              style={{ '--accent': current.color }}
            >
              <div className="flex items-start gap-4 pb-5 border-b border-[#222] mb-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center font-display text-xl text-white"
                  style={{ background: current.color, boxShadow: `0 8px 24px -6px ${current.color}66` }}
                >
                  {current.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="font-display text-2xl text-white">{current.name}</h2>
                    <span className="text-sm text-[#888]">{current.nameKo}</span>
                  </div>
                  <div className="text-xs text-[#666] mt-1">{current.domain} · {current.designHint || ''}</div>
                  <p className="text-sm text-[#aaa] mt-2 leading-relaxed">{current.personality}</p>
                </div>
              </div>

              {/* 텍스트 */}
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase tracking-wider text-[#666] font-semibold">대본</label>
                <span className="text-[11px] text-[#666] font-mono">
                  <span className={text.length > 500 ? 'text-rose-400' : ''}>{text.length}</span> / 500
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder={current.greeting}
                className="w-full min-h-[120px] p-4 bg-[#0A0A0A] border border-[#222] rounded-xl text-[#E8E8E8] text-sm leading-relaxed outline-none resize-y focus:border-[var(--accent)] transition"
              />

              {/* 슬라이더 3개 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                <Slider label="Stability" value={stab} onChange={setStab} accent={current.color} hint="높을수록 일관됨" />
                <Slider label="Clarity" value={clar} onChange={setClar} accent={current.color} hint="음색 유사도" />
                <Slider label="Style" value={styl} onChange={setStyl} accent={current.color} hint="개성 강도" />
              </div>

              {/* Wave 애니메이션 (재생 중) */}
              {playingId && (
                <div className="flex items-end justify-center gap-1 h-10 mt-4">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className="wave-bar"
                      style={{
                        '--bar-color': current.color,
                        animationDelay: `${i * 0.05}s`,
                        height: `${20 + (i % 3) * 8}px`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* 액션 버튼들 */}
              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  onClick={() => generate('A')}
                  disabled={busy}
                  className="flex-1 min-w-[160px] py-3 px-5 rounded-xl text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition disabled:opacity-60"
                  style={{
                    background: `linear-gradient(135deg, ${current.color}, ${current.color}cc)`,
                    boxShadow: `0 8px 24px -6px ${current.color}66`,
                  }}
                >
                  {busy ? <><Loader2 size={14} className="animate-spin" /> 생성 중…</>
                       : <><Play size={14} /> {current.nameKo}로 재생</>}
                </button>
                <button
                  onClick={downloadCurrent}
                  className="px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#222] text-[#aaa] hover:text-white hover:bg-[#222] inline-flex items-center gap-2 text-sm transition"
                >
                  <Download size={13} /> mp3
                </button>
                <button
                  onClick={copyParams}
                  className="px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#222] text-[#aaa] hover:text-white hover:bg-[#222] inline-flex items-center gap-2 text-sm transition"
                  title="현재 파라미터를 JSON으로 복사"
                >
                  <Copy size={13} /> 파라미터
                </button>
              </div>

              {error && <div className="mt-3 text-xs text-rose-400">{error}</div>}
              {!apiKey && (
                <div className="mt-3 text-[11px] text-amber-300/80 bg-amber-300/5 border border-amber-300/15 rounded-lg p-2">
                  ℹ︎ API 키 없음 — Web Speech API 폴백 모드 (캐릭터별 rate/pitch 적용)
                </div>
              )}

              <audio ref={audioRefA} controls className="w-full mt-4" style={{ filter: 'invert(0.85)' }} />
            </section>

            {/* A/B 비교 패널 */}
            {compareMode && compareVoice && (
              <section
                className="rounded-2xl bg-[#0F0F0F] border border-dashed border-[#333] p-6"
                style={{ '--accent': compareVoice.color }}
              >
                <div className="flex items-start gap-4 mb-5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-display text-lg text-white"
                    style={{ background: compareVoice.color }}
                  >
                    {compareVoice.initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] tracking-wider uppercase text-[#666]">B Track</span>
                    </div>
                    <h3 className="font-display text-xl text-white">{compareVoice.name}</h3>
                    <div className="text-xs text-[#666] mt-1">{compareVoice.nameKo} · {compareVoice.domain}</div>
                  </div>
                  <button
                    onClick={() => generate('B')}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg text-white text-sm font-semibold inline-flex items-center gap-2"
                    style={{ background: compareVoice.color }}
                  >
                    <Play size={12} /> 재생
                  </button>
                </div>
                <audio ref={audioRefB} controls className="w-full" style={{ filter: 'invert(0.85)' }} />
                <div className="mt-3 text-[11px] text-[#666]">
                  같은 텍스트로 두 보이스를 비교 재생할 수 있어요.
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT (history) ── */}
          <aside className="space-y-2 lg:sticky lg:top-4 self-start">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#666] font-semibold">
                <History size={12} /> 최근 생성 ({history.length})
              </div>
              {history.length > 0 && (
                <button
                  onClick={() => {
                    history.forEach(h => h.blobUrl && URL.revokeObjectURL(h.blobUrl));
                    setHistory([]);
                  }}
                  className="text-[#666] hover:text-rose-400 p-1"
                  title="히스토리 비우기"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="rounded-xl bg-[#141414] border border-[#222] p-6 text-center text-xs text-[#666]">
                아직 생성한 음성이 없어요
              </div>
            ) : (
              history.map(item => (
                <div
                  key={item.id}
                  onClick={() => playFromHistory(item)}
                  className="flex items-center gap-3 p-3 bg-[#141414] border border-[#222] rounded-xl cursor-pointer hover:bg-[#1a1a1a] transition group"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center font-display text-xs text-white flex-shrink-0"
                    style={{ background: item.voice.color }}
                  >
                    {item.voice.initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate font-medium">{item.voice.nameKo}</div>
                    <div className="text-[11px] text-[#666] truncate">{item.text}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-[#555] font-mono">
                      {item.ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {item.fallback && <span className="text-[9px] text-amber-300/70">SPEECH</span>}
                    {!item.fallback && item.blobUrl && <Volume2 size={10} className="text-[#666] group-hover:text-white" />}
                  </div>
                </div>
              ))
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   서브 컴포넌트
   ════════════════════════════════════════════════════════════ */

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-semibold inline-flex items-center transition ${
        active ? 'bg-white text-black' : 'text-[#888] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function VenuXGrid({ members, selectedId, compareId, compareMode, onSelect }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {members.map(m => {
        const isA = m.id === selectedId;
        const isB = compareMode && m.id === compareId;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`group flex flex-col items-center gap-3 p-4 rounded-2xl border transition relative ${
              isA ? 'bg-[#1a1a1a]' : 'bg-[#141414] hover:bg-[#1a1a1a]'
            }`}
            style={{
              borderColor: isA ? m.color : isB ? `${m.color}77` : '#222',
              boxShadow: isA ? `0 0 0 1px ${m.color}, 0 8px 24px -6px ${m.color}55` : 'none',
            }}
          >
            {/* 원형 아바타 + 글로우 */}
            <div className="relative">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center font-display text-3xl text-white relative z-10"
                style={{
                  background: m.color,
                  boxShadow: isA ? `0 0 0 4px #0A0A0A, 0 0 0 6px ${m.color}` : `0 0 0 2px #0A0A0A, 0 0 0 3px ${m.color}88`,
                }}
              >
                {m.initial}
              </div>
              {isA && (
                <div
                  className="absolute inset-0 rounded-full blur-xl opacity-60 -z-0"
                  style={{ background: m.color }}
                />
              )}
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-white font-display">{m.name}</div>
              <div className="text-[11px] text-[#888] mt-0.5">{m.nameKo}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#555] mt-1.5 font-mono">{m.domain}</div>
            </div>
            {isB && (
              <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider text-black"
                    style={{ background: m.color }}>
                B
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function MBTIGrid({ voices, selectedId, compareId, compareMode, onSelect }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {voices.map(v => {
        const isA = v.id === selectedId;
        const isB = compareMode && v.id === compareId;
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            title={v.personality}
            className={`group relative flex flex-col items-start p-4 rounded-xl border transition ${
              isA ? 'bg-[#1a1a1a]' : 'bg-[#141414] hover:bg-[#1a1a1a]'
            }`}
            style={{
              borderColor: isA ? v.color : isB ? `${v.color}77` : '#222',
              boxShadow: isA ? `0 0 0 1px ${v.color}, 0 4px 16px -4px ${v.color}55` : 'none',
            }}
          >
            <div
              className="font-display text-2xl text-white tracking-wider"
              style={{ color: isA ? v.color : '#fff' }}
            >
              {v.mbti}
            </div>
            <div className="text-xs text-[#888] mt-0.5">{v.nameKo}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#555] mt-2 font-mono">{v.domain}</div>
            {isB && (
              <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider text-black"
                    style={{ background: v.color }}>
                B
              </span>
            )}
            {/* hover tooltip */}
            <div
              className="absolute left-0 right-0 -bottom-2 translate-y-full opacity-0 group-hover:opacity-100 pointer-events-none transition z-20"
              style={{ transform: 'translateY(calc(100% + 4px))' }}
            >
              <div className="mx-2 p-2 rounded-lg bg-[#0A0A0A] border border-[#333] text-[10px] text-[#aaa] leading-relaxed shadow-xl">
                {v.personality}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Slider({ label, value, onChange, accent, hint }) {
  return (
    <div style={{ '--accent': accent }}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[#666] font-semibold">{label}</span>
        <span className="text-xs font-mono text-[#aaa]">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0} max={1} step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-[#222] rounded-full appearance-none cursor-pointer outline-none"
        style={{
          accentColor: accent,
          background: `linear-gradient(to right, ${accent} 0%, ${accent} ${value * 100}%, #222 ${value * 100}%, #222 100%)`,
        }}
      />
      <div className="text-[10px] text-[#555] mt-1">{hint}</div>
    </div>
  );
}
