'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  icon: string
  label: string
}

type NavSection = {
  group: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    group: 'MAIN',
    items: [
      { href: '/home',      icon: '⌂',  label: '홈' },
      { href: '/pipeline',  icon: '▦',  label: '파이프라인' },
      { href: '/library',   icon: '◫',  label: '라이브러리' },
    ],
  },
  {
    group: 'CREATE',
    items: [
      { href: '/shot',      icon: '✦',  label: '샷 스튜디오' },
      { href: '/voice',     icon: '♪',  label: '보이스' },
      { href: '/music',     icon: '♫',  label: '뮤직' },
      { href: '/sfx',       icon: '◈',  label: 'SFX' },
      { href: '/compare',   icon: '⊞',  label: '비교 모드' },
    ],
  },
  {
    group: 'REFERENCE',
    items: [
      { href: '/characters', icon: '◎', label: '캐릭터' },
      { href: '/style',      icon: '◉', label: '스타일' },
      { href: '/cinema',     icon: '▣', label: '시네마' },
    ],
  },
  {
    group: 'SYSTEM',
    items: [
      { href: '/settings',  icon: '⚙',  label: '설정' },
      { href: '/credits',   icon: '◆',  label: '크레딧' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      style={{
        width: '220px',
        minHeight: '100dvh',
        background: 'var(--bg-elev)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-display)',
        flexShrink: 0,
      }}
    >
      {/* 로고 */}
      <div
        style={{
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: '10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="brand-mark" />
        <span
          style={{
            fontWeight: 800,
            fontSize: '15px',
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}
        >
          SOAVIZ
        </span>
      </div>

      {/* 네비게이션 */}
      <nav
        style={{
          flex: 1,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          overflowY: 'auto',
        }}
      >
        {NAV_SECTIONS.map(({ group, items }) => (
          <div key={group}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--text-dim)',
                padding: '0 12px',
                marginBottom: '4px',
                opacity: 0.5,
              }}
            >
              {group}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {items.map(({ href, icon, label }) => {
                const active =
                  pathname === href ||
                  (href !== '/home' && pathname.startsWith(href))
                return (
                  <Link
                    key={href}
                    href={href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: 'calc(var(--radius) - 2px)',
                      fontSize: '13.5px',
                      fontWeight: active ? 600 : 400,
                      color: active ? 'var(--text)' : 'var(--text-dim)',
                      background: active ? 'var(--bg-card)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span
                      style={{
                        width: '18px',
                        textAlign: 'center',
                        fontSize: '12px',
                        color: active ? 'var(--accent)' : 'var(--text-dim)',
                        flexShrink: 0,
                      }}
                    >
                      {icon}
                    </span>
                    {label}
                    {active && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          width: '4px',
                          height: '4px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 하단 — 버전 */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          fontSize: '11px',
          color: 'var(--text-dim)',
        }}
      >
        v0.3 · beta
      </div>
    </aside>
  )
}
