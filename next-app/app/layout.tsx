import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SOAVIZ',
  description: 'AI 페르소나 콘텐츠 스튜디오',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}
