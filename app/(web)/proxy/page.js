'use client';

export default function ProxyPage() {
    return (
        <div className="container layout-wrapper" style={{ marginTop: 'calc(var(--nav-height) + 2rem)' }}>
            <div className="main-content" style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ padding: '0 0 3rem 0', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', letterSpacing: '-0.04em' }}>福利资源</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
                        精选互联网优质资源。点击下方卡片即可跳转至源站查看。
                    </p>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: '2rem'
                }}>
                    {/* Proxy Card */}
                    <a
                        href="https://free.52it.de"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="proxy-card"
                        style={{
                            display: 'block',
                            textDecoration: 'none',
                            color: 'inherit',
                            padding: '2.5rem',
                            borderRadius: '35px',
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid var(--border)',
                            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                            cursor: 'pointer',
                            position: 'relative',
                            boxShadow: 'var(--shadow-md)',
                            textAlign: 'left'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-10px)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                            e.currentTarget.style.borderColor = 'var(--accent)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                            e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                    >
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{
                                display: 'inline-flex',
                                padding: '0.8rem',
                                borderRadius: '15px',
                                background: 'var(--accent-light)',
                                color: 'var(--accent)',
                                marginBottom: '1.5rem'
                            }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>免费代理</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                                实时更新的免费开放代理列表，包括精英和高度匿名的网络代理信息。
                            </p>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: '700',
                                color: 'var(--accent)'
                            }}>
                                立即访问
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                            </div>
                        </div>
                    </a>

                    {/* Educational Resources Card */}
                    <a
                        href="https://edu.52it.de"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="proxy-card"
                        style={{
                            display: 'block',
                            textDecoration: 'none',
                            color: 'inherit',
                            padding: '2.5rem',
                            borderRadius: '35px',
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid var(--border)',
                            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                            cursor: 'pointer',
                            position: 'relative',
                            boxShadow: 'var(--shadow-md)',
                            textAlign: 'left'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-10px)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                            e.currentTarget.style.borderColor = 'var(--accent)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                            e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                    >
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{
                                display: 'inline-flex',
                                padding: '0.8rem',
                                borderRadius: '15px',
                                background: 'rgba(139, 92, 246, 0.1)',
                                color: '#8b5cf6',
                                marginBottom: '1.5rem'
                            }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>教育资源库</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                                精选教育与技能提升资源，涵盖各类优质学习资料与公开课。
                            </p>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: '700',
                                color: '#8b5cf6'
                            }}>
                                立即访问
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                            </div>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    );
}
