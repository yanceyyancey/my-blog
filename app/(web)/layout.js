import '../globals.css'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata = {
  title: 'My Premium Blog',
  description: 'A modern, luxurious personal blog built with Next.js',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
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
      </body>
    </html>
  )
}
