export default function PipelinePage() {
  return (
    <main
      style={{
        padding: '40px 48px',
        maxWidth: '900px',
        fontFamily: 'var(--font-display)',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: 'var(--text-dim)',
          marginBottom: '12px',
          opacity: 0.5,
          textTransform: 'uppercase',
        }}
      >
        Soaviz Studio
      </div>
      <h1
        style={{
          fontSize: '28px',
          fontWeight: 800,
          color: 'var(--text)',
          letterSpacing: '-0.02em',
          margin: 0,
          marginBottom: '16px',
        }}
      >
        파이프라인
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.6 }}>
        이 페이지는 현재 개발 중입니다.
      </p>
    </main>
  )
}
