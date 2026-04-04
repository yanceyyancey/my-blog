import '../globals.css'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeProvider } from '@/components/ThemeProvider'
import { absoluteUrl, siteConfig } from '@/lib/site-config'

// Fallback to system fonts to bypass Turbopack font resolve bug
const inter = { className: 'font-inter-fallback' };

export const metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`
  },
  description: siteConfig.description,
  authors: [{ name: siteConfig.author.name, url: siteConfig.url }],
  creator: siteConfig.author.name,
  publisher: siteConfig.author.name,
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': siteConfig.links.rss,
    },
  },
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    images: [
      {
        url: absoluteUrl('/opengraph-image'),
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    images: [absoluteUrl('/opengraph-image')],
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
              <p>© {new Date().getFullYear()} {siteConfig.name}.</p>
            </div>
          </footer>

          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
