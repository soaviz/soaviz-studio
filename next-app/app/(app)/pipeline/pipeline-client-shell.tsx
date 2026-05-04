'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NewProjectDialog } from './new-project-dialog'
import type { ProjectWithProgress } from './actions'

const STATUS_LABEL: Record<string, string> = {
  draft:       '초안',
  in_progress: '진행 중',
  published:   '완성',
  archived:    '보관',
}

const STATUS_COLOR: Record<string, string> = {
  draft:       '#6b7280',
  in_progress: '#8b5cf6',
  published:   '#22c55e',
  archived:    '#374151',
}

function getProjectColor(project: ProjectWithProgress): string {
  const meta = project.metadata as Record<string, unknown> | null
  return (meta?.color as string) || '#9e7bff'
}

function getProjectFormat(project: ProjectWithProgress): string {
  const meta = project.metadata as Record<string, unknown> | null
  return (meta?.format as string) || ''
}

function getProjectLogline(project: ProjectWithProgress): string {
  const meta = project.metadata as Record<string, unknown> | null
  return (meta?.logline as string) || ''
}

function getProjectGenre(project: ProjectWithProgress): string {
  const meta = project.metadata as Record<string, unknown> | null
  return (meta?.genre as string) || ''
}

const FORMAT_ICON: Record<string, string> = {
  film: '🎬', short: '🎞', series: '📺', mv: '🎵', ad: '✦',
}

interface PipelineClientShellProps {
  initialProjects: ProjectWithProgress[]
}

export function PipelineClientShell({ initialProjects }: PipelineClientShellProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projects] = useState<ProjectWithProgress[]>(initialProjects)

  return (
    <div style={{ padding: '40px 48px', maxWidth: '1100px', fontFamily: 'var(--font-display)' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '36px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '6px' }}>
            SOAVIZ STUDIO
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
            파이프라인
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '6px', marginBottom: 0 }}>
            {projects.length}개 프로젝트
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
          새 프로젝트
        </button>
      </div>

      {/* 프로젝트 없을 때 빈 상태 */}
      {projects.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '80px 40px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: '16px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎬</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
            첫 번째 프로젝트를 만들어보세요
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.6, maxWidth: '340px', marginBottom: '28px' }}>
            영화, 뮤직비디오, 광고 등 다양한 포맷의 영상 프로젝트를 관리하세요
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            style={{
              padding: '12px 28px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + 새 프로젝트 시작
          </button>
        </div>
      )}

      {/* 프로젝트 카드 그리드 */}
      {projects.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {projects.map(project => {
            const color    = getProjectColor(project)
            const format   = getProjectFormat(project)
            const logline  = getProjectLogline(project)
            const genre    = getProjectGenre(project)
            const status   = project.status
            const { total, done, locked } = project.sceneStat
            const completed = done + locked
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0

            return (
              <Link
                key={project.id}
                href={`/pipeline/${project.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'transform 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = color
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
                  }}
                >
                  {/* 컬러 배너 */}
                  <div style={{ height: '4px', background: color }} />

                  <div style={{ padding: '20px' }}>
                    {/* 포맷 + 상태 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '20px' }}>{FORMAT_ICON[format] || '🎬'}</span>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                        color: STATUS_COLOR[status] || '#6b7280',
                        background: `${STATUS_COLOR[status] || '#6b7280'}22`,
                        padding: '3px 8px', borderRadius: '6px',
                        textTransform: 'uppercase',
                      }}>
                        {STATUS_LABEL[status] || status}
                      </span>
                    </div>

                    {/* 제목 */}
                    <h3 style={{
                      fontSize: '16px', fontWeight: 800, color: 'var(--text)',
                      margin: '0 0 6px 0', letterSpacing: '-0.01em',
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {project.title}
                    </h3>

                    {/* 장르 */}
                    {genre && (
                      <p style={{ fontSize: '11px', color: color, fontWeight: 600, margin: '0 0 8px 0' }}>
                        {genre}
                      </p>
                    )}

                    {/* 로그라인 */}
                    {logline && (
                      <p style={{
                        fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5,
                        margin: '0 0 16px 0',
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {logline}
                      </p>
                    )}

                    {/* 진행률 바 */}
                    {total > 0 ? (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600 }}>진행률</span>
                          <span style={{ fontSize: '10px', color: pct === 100 ? '#22c55e' : color, fontWeight: 700 }}>
                            {pct}% <span style={{ fontWeight: 400, opacity: 0.7 }}>({completed}/{total} 씬)</span>
                          </span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: pct === 100 ? '#22c55e' : color,
                            borderRadius: '2px',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }} />
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', opacity: 0.5 }}>
                          씬 없음
                        </div>
                      </div>
                    )}

                    {/* 날짜 */}
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', opacity: 0.6 }}>
                      {new Date(project.updated_at).toLocaleDateString('ko-KR', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* 새 프로젝트 다이얼로그 */}
      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}
