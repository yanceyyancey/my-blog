import '../globals.css'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeProvider } from '@/components/ThemeProvider'

// Fallback to system fonts to bypass Turbopack font resolve bug
const inter = { className: 'font-inter-fallback' };

export const metadata = {
  metadataBase: new URL('https://www.yancey.blog'),
  title: {
    default: 'yancey | 专注保姆级教程，小白福利站',
    template: '%s | yancey.blog'
  },
  description: '专注保姆级教程，小白福利站。覆盖日常任务：总结、改写、代码解释、轻量 RAG、工具调用。',
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Navigation />

          <main>
            {children}
          </main>

          <footer className="footer">
            <div className="container">
              <p>© {new Date().getFullYear()} My Blog.</p>
            </div>
          </footer>

          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
