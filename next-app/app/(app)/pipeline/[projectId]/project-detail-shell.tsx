'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  createEpisode, updateEpisodeTitle,
  getScenes, createScene,
} from './actions'
import type { Tables } from '@/types/database'

type Project = Tables<'projects'>
type Episode = Tables<'episodes'>
type Scene   = Tables<'scenes'>

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
  const [episodes, setEpisodes]         = useState<Episode[]>(initialEpisodes)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(
    initialEpisodes[0]?.id ?? null
  )
  const [scenes, setScenes]             = useState<Scene[]>([])
  const [selectedSceneId, setSelectedSceneId]     = useState<string | null>(null)
  const [editingEpId, setEditingEpId]   = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [isPending, startTransition]    = useTransition()

  // 에피소드 선택 시 씬 로드
  function selectEpisode(epId: string) {
    setSelectedEpisodeId(epId)
    setSelectedSceneId(null)
    startTransition(async () => {
      const data = await getScenes(epId)
      setScenes(data)
    })
  }

  // 첫 렌더 시 첫 에피소드 씬 로드 (초기값이 있을 때)
  useState(() => {
    if (initialEpisodes[0]) selectEpisode(initialEpisodes[0].id)
  })

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
        setSelectedSceneId(res.scene!.id)
      }
    })
  }

  const selectedScene = scenes.find(s => s.id === selectedSceneId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100dvh - 48px)' }}>

      {/* 프로젝트 헤더 */}
      <div style={{
        padding: '16px 28px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '16px',
        background: 'var(--surface)',
      }}>
        <div style={{ width: '4px', height: '36px', borderRadius: '2px', background: color, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>
            <Link href="/pipeline" style={{ color: 'inherit', textDecoration: 'none' }}>파이프라인</Link>
            {' / '}
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>
            {project.title}
          </h1>
        </div>
      </div>

      {/* 3패널 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 패널 A: 에피소드 목록 ──────────────────────────────────────── */}
        <aside style={{
          width: '220px', flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)',
        }}>
          <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              에피소드
            </span>
            <button
              onClick={handleAddEpisode}
              disabled={isPending}
              style={{ ...iconBtnStyle, color: color }}
              title="에피소드 추가"
            >+</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
            {episodes.length === 0 && (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
                에피소드가 없습니다
                <br />
                <button onClick={handleAddEpisode} style={{ ...ghostBtnStyle, marginTop: '12px' }}>
                  + 첫 에피소드 추가
                </button>
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
                    padding: '10px 12px',
                    borderRadius: '8px',
                    marginBottom: '4px',
                    cursor: 'pointer',
                    background: isSelected ? `${color}1a` : 'transparent',
                    border: isSelected ? `1px solid ${color}44` : '1px solid transparent',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 700, color, letterSpacing: '0.06em', marginBottom: '3px' }}>
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
                      style={{ width: '100%', background: 'var(--surface-2)', border: `1px solid ${color}`, borderRadius: '4px', padding: '2px 6px', color: 'var(--text)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <div
                      style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? 'var(--text)' : 'var(--text-dim)' }}
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

        {/* ── 패널 B: 씬 목록 ──────────────────────────────────────────────── */}
        <aside style={{
          width: '300px', flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg)',
        }}>
          <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              씬
              {selectedEpisodeId && scenes.length > 0 && (
                <span style={{ marginLeft: '6px', opacity: 0.5 }}>{scenes.length}</span>
              )}
            </span>
            {selectedEpisodeId && (
              <button
                onClick={handleAddScene}
                disabled={isPending}
                style={{ ...iconBtnStyle, color: color }}
                title="씬 추가"
              >+</button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
            {!selectedEpisodeId && (
              <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
                에피소드를 선택하세요
              </div>
            )}
            {selectedEpisodeId && scenes.length === 0 && (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
                씬이 없습니다
                <br />
                <button onClick={handleAddScene} style={{ ...ghostBtnStyle, marginTop: '12px' }}>
                  + 첫 씬 추가
                </button>
              </div>
            )}
            {scenes.map((scene, i) => {
              const isSelected = scene.id === selectedSceneId
              const statusColor = SCENE_STATUS_COLOR[scene.status] || '#6b7280'

              return (
                <div
                  key={scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    marginBottom: '6px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--surface)' : 'transparent',
                    border: isSelected ? '1px solid var(--border)' : '1px solid transparent',
                    transition: 'all 0.12s',
                  }}
                >
                  {/* 씬 번호 + 상태 배지 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                      S{String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: 700,
                      color: statusColor,
                      background: `${statusColor}22`,
                      padding: '2px 6px', borderRadius: '4px',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                      {SCENE_STATUS_LABEL[scene.status] || scene.status}
                    </span>
                  </div>

                  {/* heading */}
                  <div style={{
                    fontSize: '12px', fontWeight: 700,
                    color: isSelected ? 'var(--text)' : 'var(--text-dim)',
                    marginBottom: scene.beat ? '4px' : 0,
                    fontFamily: 'var(--font-mono, monospace)',
                    letterSpacing: '0.02em',
                  }}>
                    {scene.heading || `씬 ${i + 1}`}
                  </div>

                  {/* beat */}
                  {scene.beat && (
                    <div style={{
                      fontSize: '11px', color: 'var(--text-dim)',
                      lineHeight: 1.4,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {scene.beat}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── 패널 C: Shot 목록 (Day 4-C stub) ────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              샷
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            {!selectedSceneId ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>🎥</div>
                <p style={{ fontSize: '13px' }}>씬을 선택하면 샷 목록이 표시됩니다</p>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>✦</div>
                <p style={{ fontSize: '13px' }}>
                  <strong style={{ color: 'var(--text)' }}>{selectedScene?.heading}</strong>
                </p>
                <p style={{ fontSize: '12px', marginTop: '6px', opacity: 0.6 }}>
                  Shot 목록은 Day 4-C에서 구현됩니다
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── 공용 스타일 ──────────────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  width: '24px', height: '24px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none',
  fontSize: '18px', fontWeight: 700,
  cursor: 'pointer',
  borderRadius: '6px',
  transition: 'background 0.12s',
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px dashed var(--border)',
  color: 'var(--text-dim)', fontSize: '11px', fontWeight: 600,
  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
}
