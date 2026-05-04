'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  createEpisode, updateEpisodeTitle,
  getScenes, createScene,
  getShots, createShot, updateShotField,
} from './actions'
import type { Tables, UpdateTables } from '@/types/database'

type Project = Tables<'projects'>
type Episode = Tables<'episodes'>
type Scene   = Tables<'scenes'>
type Shot    = Tables<'shots'>

// ─── Status 설정 ──────────────────────────────────────────────────────────────

const SCENE_STATUS_COLOR: Record<string, string> = {
  draft:   '#6b7280',
  outline: '#f97316',
  script:  '#3b82f6',
  locked:  '#8b5cf6',
  done:    '#22c55e',
}
const SCENE_STATUS_LABEL: Record<string, string> = {
  draft: '초안', outline: '아웃라인', script: '대본', locked: '확정', done: '완료',
}

const SHOT_STATUS_COLOR: Record<string, string> = {
  draft:     '#6b7280',
  generated: '#3b82f6',
  approved:  '#22c55e',
  rejected:  '#ef4444',
  archived:  '#4b5563',
}
const SHOT_STATUS_LABEL: Record<string, string> = {
  draft: '초안', generated: '생성됨', approved: '승인', rejected: '반려', archived: '보관',
}

const SHOT_TYPES = ['WS', 'MS', 'CU', 'ECU', 'OTS', 'POV', 'TWO', 'INSERT', 'AERIAL']
const CAMERA_MOVES = ['Static', 'Pan', 'Tilt', 'Dolly', 'Zoom', 'Handheld', 'Crane', 'Track']
const SHOT_STATUSES: Shot['status'][] = ['draft', 'generated', 'approved', 'rejected']

// ─── 프로젝트 헤더 컬러 ───────────────────────────────────────────────────────
function projectColor(project: Project) {
  const meta = project.metadata as Record<string, unknown> | null
  return (meta?.color as string) || '#9e7bff'
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface ProjectDetailShellProps {
  project: Project
  initialEpisodes: Episode[]
}

export function ProjectDetailShell({ project, initialEpisodes }: ProjectDetailShellProps) {
  const color = projectColor(project)
  const [episodes, setEpisodes]                   = useState<Episode[]>(initialEpisodes)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(
    initialEpisodes[0]?.id ?? null
  )
  const [scenes, setScenes]                       = useState<Scene[]>([])
  const [selectedSceneId, setSelectedSceneId]     = useState<string | null>(null)
  const [shots, setShots]                         = useState<Shot[]>([])
  const [selectedShotId, setSelectedShotId]       = useState<string | null>(null)
  const [editingEpId, setEditingEpId]             = useState<string | null>(null)
  const [editingTitle, setEditingTitle]           = useState('')
  const [isPending, startTransition]              = useTransition()

  // 에피소드 선택 시 씬 로드
  function selectEpisode(epId: string) {
    setSelectedEpisodeId(epId)
    setSelectedSceneId(null)
    setShots([])
    setSelectedShotId(null)
    startTransition(async () => {
      const data = await getScenes(epId)
      setScenes(data)
    })
  }

  // 첫 렌더 시 첫 에피소드 씬 로드
  useState(() => {
    if (initialEpisodes[0]) selectEpisode(initialEpisodes[0].id)
  })

  // 씬 선택 시 샷 로드
  function selectScene(sceneId: string) {
    setSelectedSceneId(sceneId)
    setSelectedShotId(null)
    setShots([])
    startTransition(async () => {
      const data = await getShots(sceneId)
      setShots(data)
    })
  }

  // 에피소드 추가
  function handleAddEpisode() {
    startTransition(async () => {
      const res = await createEpisode(project.id)
      if ('episode' in res && res.episode) {
        setEpisodes(prev => [...prev, res.episode!])
        selectEpisode(res.episode!.id)
      }
    })
  }

  // 에피소드 제목 수정 완료
  function handleEpTitleBlur(epId: string) {
    if (!editingTitle.trim()) { setEditingEpId(null); return }
    startTransition(async () => {
      await updateEpisodeTitle(epId, editingTitle.trim(), project.id)
      setEpisodes(prev => prev.map(e => e.id === epId ? { ...e, title: editingTitle.trim() } : e))
      setEditingEpId(null)
    })
  }

  // 씬 추가
  function handleAddScene() {
    if (!selectedEpisodeId) return
    startTransition(async () => {
      const res = await createScene(project.id, selectedEpisodeId)
      if ('scene' in res && res.scene) {
        setScenes(prev => [...prev, res.scene!])
        selectScene(res.scene!.id)
      }
    })
  }

  // 샷 추가
  function handleAddShot() {
    if (!selectedSceneId) return
    startTransition(async () => {
      const res = await createShot(project.id, selectedSceneId)
      if ('shot' in res && res.shot) {
        setShots(prev => [...prev, res.shot!])
        setSelectedShotId(res.shot!.id)
      }
    })
  }

  // 샷 필드 업데이트 (낙관적 업데이트)
  function handleShotUpdate(shotId: string, fields: UpdateTables<'shots'>) {
    setShots(prev => prev.map(s => s.id === shotId ? { ...s, ...(fields as Partial<Shot>) } : s))
    startTransition(async () => {
      await updateShotField(shotId, fields, project.id)
    })
  }

  const selectedShot = shots.find(s => s.id === selectedShotId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100dvh - 48px)' }}>

      {/* 프로젝트 헤더 */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '14px',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <div style={{ width: '4px', height: '32px', borderRadius: '2px', background: color, flexShrink: 0 }} />

        {/* 제목 영역 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>
            <Link href="/pipeline" style={{ color: 'inherit', textDecoration: 'none' }}>파이프라인</Link>
            {' / '}
          </div>
          <h1 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.title}
          </h1>
        </div>

        {/* 진행률 요약 배지 */}
        <EpisodeProgressBar episodes={episodes} color={color} />
      </div>

      {/* 4패널 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 패널 A: 에피소드 목록 ────────────────────────────────────── */}
        <aside style={{
          width: '200px', flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)',
        }}>
          <div style={{ padding: '13px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>에피소드</span>
            <button onClick={handleAddEpisode} disabled={isPending} style={{ ...iconBtnStyle, color }} title="에피소드 추가">+</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>
            {episodes.length === 0 && (
              <div style={emptyStyle}>
                에피소드가 없습니다<br />
                <button onClick={handleAddEpisode} style={{ ...ghostBtnStyle, marginTop: '10px' }}>+ 추가</button>
              </div>
            )}
            {episodes.map((ep, i) => {
              const isSelected = ep.id === selectedEpisodeId
              const isEditing  = ep.id === editingEpId
              return (
                <div
                  key={ep.id}
                  onClick={() => !isEditing && selectEpisode(ep.id)}
                  style={{
                    padding: '9px 10px', borderRadius: '7px', marginBottom: '3px',
                    cursor: 'pointer',
                    background: isSelected ? `${color}1a` : 'transparent',
                    border: isSelected ? `1px solid ${color}44` : '1px solid transparent',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ fontSize: '9px', fontWeight: 700, color, letterSpacing: '0.06em', marginBottom: '2px' }}>
                    E{String(i + 1).padStart(2, '0')}
                  </div>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={() => handleEpTitleBlur(ep.id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEpTitleBlur(ep.id); if (e.key === 'Escape') setEditingEpId(null) }}
                      onClick={e => e.stopPropagation()}
                      style={{ width: '100%', background: 'var(--surface-2)', border: `1px solid ${color}`, borderRadius: '4px', padding: '2px 5px', color: 'var(--text)', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <div
                      style={{ fontSize: '11px', fontWeight: 600, color: isSelected ? 'var(--text)' : 'var(--text-dim)' }}
                      onDoubleClick={e => { e.stopPropagation(); setEditingEpId(ep.id); setEditingTitle(ep.title ?? '') }}
                    >
                      {ep.title || `에피소드 ${i + 1}`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── 패널 B: 씬 목록 ─────────────────────────────────────────── */}
        <aside style={{
          width: '250px', flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg)',
        }}>
          <div style={{ padding: '13px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>
              씬{selectedEpisodeId && scenes.length > 0 && <span style={{ marginLeft: '5px', opacity: 0.4 }}>{scenes.length}</span>}
            </span>
            {selectedEpisodeId && (
              <button onClick={handleAddScene} disabled={isPending} style={{ ...iconBtnStyle, color }} title="씬 추가">+</button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>
            {!selectedEpisodeId && <div style={emptyStyle}>에피소드를 선택하세요</div>}
            {selectedEpisodeId && scenes.length === 0 && (
              <div style={emptyStyle}>
                씬이 없습니다<br />
                <button onClick={handleAddScene} style={{ ...ghostBtnStyle, marginTop: '10px' }}>+ 추가</button>
              </div>
            )}
            {scenes.map((scene, i) => {
              const isSelected  = scene.id === selectedSceneId
              const statusColor = SCENE_STATUS_COLOR[scene.status] || '#6b7280'
              return (
                <div
                  key={scene.id}
                  onClick={() => selectScene(scene.id)}
                  style={{
                    padding: '10px 11px', borderRadius: '7px', marginBottom: '4px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--surface)' : 'transparent',
                    border: isSelected ? '1px solid var(--border)' : '1px solid transparent',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                      S{String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '8px', fontWeight: 700, color: statusColor, background: `${statusColor}22`, padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {SCENE_STATUS_LABEL[scene.status] || scene.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: isSelected ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'var(--font-mono, monospace)', marginBottom: scene.beat ? '3px' : 0 }}>
                    {scene.heading || `씬 ${i + 1}`}
                  </div>
                  {scene.beat && (
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {scene.beat}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── 패널 C: 샷 목록 ─────────────────────────────────────────── */}
        <aside style={{
          width: '230px', flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)',
        }}>
          <div style={{ padding: '13px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>
              샷{selectedSceneId && shots.length > 0 && <span style={{ marginLeft: '5px', opacity: 0.4 }}>{shots.length}</span>}
            </span>
            {selectedSceneId && (
              <button onClick={handleAddShot} disabled={isPending} style={{ ...iconBtnStyle, color }} title="샷 추가">+</button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>
            {!selectedSceneId && <div style={emptyStyle}>씬을 선택하세요</div>}
            {selectedSceneId && shots.length === 0 && (
              <div style={emptyStyle}>
                샷이 없습니다<br />
                <button onClick={handleAddShot} style={{ ...ghostBtnStyle, marginTop: '10px' }}>+ 추가</button>
              </div>
            )}
            {shots.map((shot, i) => {
              const isSelected  = shot.id === selectedShotId
              const statusColor = SHOT_STATUS_COLOR[shot.status] || '#6b7280'
              return (
                <div
                  key={shot.id}
                  onClick={() => setSelectedShotId(shot.id)}
                  style={{
                    padding: '10px 11px', borderRadius: '7px', marginBottom: '4px',
                    cursor: 'pointer',
                    background: isSelected ? `${color}12` : 'transparent',
                    border: isSelected ? `1px solid ${color}44` : '1px solid transparent',
                    transition: 'all 0.12s',
                  }}
                >
                  {/* 샷 번호 + 상태 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                      #{String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '8px', fontWeight: 700, color: statusColor, background: `${statusColor}22`, padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {SHOT_STATUS_LABEL[shot.status] || shot.status}
                    </span>
                  </div>
                  {/* 샷 타입 + 카메라 무브 */}
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginBottom: shot.prompt ? '5px' : 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: isSelected ? color : 'var(--text)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {shot.shot_type || '—'}
                    </span>
                    {shot.camera_move && (
                      <span style={{ fontSize: '9px', color: 'var(--text-dim)', background: 'var(--bg)', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)' }}>
                        {shot.camera_move}
                      </span>
                    )}
                    {shot.duration_ms && (
                      <span style={{ fontSize: '9px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                        {(shot.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {/* 프롬프트 미리보기 */}
                  {shot.prompt && (
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {shot.prompt}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── 패널 D: 샷 상세/편집 ─────────────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
          {!selectedShotId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.2 }}>🎥</div>
                <p style={{ fontSize: '12px' }}>
                  {!selectedSceneId ? '씬을 선택하면 샷을 추가할 수 있습니다' : '샷을 선택하세요'}
                </p>
              </div>
            </div>
          ) : selectedShot ? (
            <ShotEditor
              shot={selectedShot}
              shotIndex={shots.findIndex(s => s.id === selectedShotId)}
              color={color}
              onUpdate={(fields) => handleShotUpdate(selectedShot.id, fields)}
            />
          ) : null}
        </main>

      </div>
    </div>
  )
}

// ─── Shot 에디터 컴포넌트 ─────────────────────────────────────────────────────

interface ShotEditorProps {
  shot: Shot
  shotIndex: number
  color: string
  onUpdate: (fields: UpdateTables<'shots'>) => void
}

function ShotEditor({ shot, shotIndex, color, onUpdate }: ShotEditorProps) {
  const statusColor = SHOT_STATUS_COLOR[shot.status] || '#6b7280'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{
        padding: '13px 20px 11px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '10px',
        flexShrink: 0,
        background: 'var(--surface)',
      }}>
        <span style={{ fontSize: '10px', fontWeight: 800, color, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em' }}>
          SHOT #{String(shotIndex + 1).padStart(2, '0')}
        </span>
        <span style={{ fontSize: '9px', fontWeight: 700, color: statusColor, background: `${statusColor}22`, padding: '2px 7px', borderRadius: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {SHOT_STATUS_LABEL[shot.status] || shot.status}
        </span>
      </div>

      {/* 폼 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Row 1: Shot Type + Camera Move */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>샷 타입</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '10px' }}>
              {SHOT_TYPES.map(t => (
                <button key={t} onClick={() => onUpdate({ shot_type: t })} style={{
                  padding: '4px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 700,
                  fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer',
                  background: shot.shot_type === t ? color : 'var(--surface-2)',
                  color: shot.shot_type === t ? '#fff' : 'var(--text-dim)',
                  border: shot.shot_type === t ? `1px solid ${color}` : '1px solid var(--border)',
                  transition: 'all 0.1s',
                }}>
                  {t}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>카메라 무브</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '10px' }}>
              {CAMERA_MOVES.map(m => (
                <button key={m} onClick={() => onUpdate({ camera_move: m })} style={{
                  padding: '4px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 600,
                  cursor: 'pointer',
                  background: shot.camera_move === m ? `${color}20` : 'var(--surface-2)',
                  color: shot.camera_move === m ? color : 'var(--text-dim)',
                  border: shot.camera_move === m ? `1px solid ${color}66` : '1px solid var(--border)',
                  transition: 'all 0.1s',
                }}>
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Row 2: Duration + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '14px' }}>
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>재생 시간 (초)</legend>
            <div style={{ padding: '10px' }}>
              <input
                type="number"
                min="0.5" max="30" step="0.5"
                key={shot.id + '_dur'}
                defaultValue={shot.duration_ms ? shot.duration_ms / 1000 : ''}
                placeholder="예: 3.5"
                onBlur={e => {
                  const val = parseFloat(e.target.value)
                  if (!isNaN(val) && val > 0) onUpdate({ duration_ms: Math.round(val * 1000) })
                }}
                style={inputStyle}
              />
            </div>
          </fieldset>

          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>상태</legend>
            <div style={{ display: 'flex', gap: '6px', padding: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {SHOT_STATUSES.map(s => {
                const sc = SHOT_STATUS_COLOR[s]
                return (
                  <button key={s} onClick={() => onUpdate({ status: s })} style={{
                    padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 700,
                    cursor: 'pointer',
                    background: shot.status === s ? `${sc}22` : 'var(--surface-2)',
                    color: shot.status === s ? sc : 'var(--text-dim)',
                    border: shot.status === s ? `1px solid ${sc}66` : '1px solid var(--border)',
                    transition: 'all 0.1s',
                  }}>
                    {SHOT_STATUS_LABEL[s]}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>

        {/* Row 3: Prompt */}
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>이미지 프롬프트</legend>
          <div style={{ padding: '10px' }}>
            <textarea
              key={shot.id + '_prompt'}
              defaultValue={shot.prompt ?? ''}
              placeholder={'AI 이미지 생성용 프롬프트를 입력하세요\n예: cinematic wide shot, golden hour, shallow depth of field...'}
              rows={5}
              onBlur={e => onUpdate({ prompt: e.target.value || null })}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px', lineHeight: 1.6 }}
            />
          </div>
        </fieldset>

      </div>
    </div>
  )
}

// ─── 공용 스타일 ──────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em',
  color: 'var(--text-dim)', textTransform: 'uppercase',
}

const emptyStyle: React.CSSProperties = {
  padding: '28px 10px', textAlign: 'center',
  color: 'var(--text-dim)', fontSize: '11px',
}

const iconBtnStyle: React.CSSProperties = {
  width: '22px', height: '22px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none',
  fontSize: '17px', fontWeight: 700,
  cursor: 'pointer', borderRadius: '5px',
  transition: 'background 0.12s',
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px dashed var(--border)',
  color: 'var(--text-dim)', fontSize: '10px', fontWeight: 600,
  padding: '5px 10px', borderRadius: '5px', cursor: 'pointer',
}

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: 0, margin: 0,
}

const legendStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
  color: 'var(--text-dim)', textTransform: 'uppercase',
  padding: '0 8px', marginLeft: '8px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '8px 10px',
  color: 'var(--text)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

// ─── 에피소드 진행률 배지 컴포넌트 ───────────────────────────────────────────

interface EpisodeProgressBarProps {
  episodes: Episode[]
  color: string
}

function EpisodeProgressBar({ episodes, color }: EpisodeProgressBarProps) {
  if (episodes.length === 0) return null

  const counts = { draft: 0, outline: 0, script: 0, locked: 0, done: 0 }
  for (const ep of episodes) {
    if (ep.status in counts) counts[ep.status as keyof typeof counts]++
  }

  const total    = episodes.length
  const completed = counts.locked + counts.done
  const pct      = Math.round((completed / total) * 100)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
      {/* 에피소드 상태 배지 묶음 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {(Object.entries(counts) as [keyof typeof counts, number][])
          .filter(([, n]) => n > 0)
          .map(([status, n]) => (
            <span key={status} style={{
              fontSize: '9px', fontWeight: 700,
              color: SCENE_STATUS_COLOR[status],
              background: `${SCENE_STATUS_COLOR[status]}22`,
              padding: '2px 6px', borderRadius: '4px',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              {SCENE_STATUS_LABEL[status]} {n}
            </span>
          ))}
      </div>

      {/* 진행률 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '80px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: pct === 100 ? '#22c55e' : color,
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, color: pct === 100 ? '#22c55e' : 'var(--text-dim)', minWidth: '28px' }}>
          {pct}%
        </span>
      </div>
    </div>
  )
}
