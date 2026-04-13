'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinkClass =
    'text-sm font-medium text-text-secondary hover:text-text-primary transition-colors';

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Sticky Nav */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-bg-primary/80 backdrop-blur-xl border-b border-border-primary'
            : 'bg-transparent'
        }`}
      >
        <nav className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.3)] group-hover:shadow-[0_0_20px_rgba(139,92,246,0.5)] transition-shadow">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
                <path d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
                <path d="M8 5.5L11.5 7.5v3L8 12.5 4.5 10.5v-3L8 5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.25)" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">
              Evaluate<span className="text-purple-500">AI</span>
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className={navLinkClass}>Features</a>
            <a href="#pricing" className={navLinkClass}>Pricing</a>
            <Link href="/auth/login" className={navLinkClass}>Login</Link>
            <Link
              href="/auth/signup"
              className="bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors shadow-[0_0_20px_rgba(139,92,246,0.25)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg text-text-secondary hover:bg-bg-elevated"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              {mobileMenuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" />
              )}
            </svg>
          </button>
        </nav>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-bg-card border-b border-border-primary px-6 py-4 space-y-3">
            <a href="#features" className="block text-sm text-text-secondary" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#pricing" className="block text-sm text-text-secondary" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <Link href="/auth/login" className="block text-sm text-text-secondary">Login</Link>
            <Link href="/auth/signup" className="block bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium text-center">
              Get Started
            </Link>
          </div>
        )}
      </header>

      {/* Page Content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t border-border-primary bg-bg-secondary">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-md bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white">
                    <path d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
                  </svg>
                </div>
                <span className="text-sm font-semibold">Evaluate<span className="text-purple-500">AI</span></span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Built by developers, for engineering managers.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">Product</h4>
              <div className="space-y-2">
                <a href="#features" className="block text-sm text-text-muted hover:text-text-primary transition-colors">Features</a>
                <a href="#pricing" className="block text-sm text-text-muted hover:text-text-primary transition-colors">Pricing</a>
                <a href="#" className="block text-sm text-text-muted hover:text-text-primary transition-colors">Docs</a>
              </div>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">Resources</h4>
              <div className="space-y-2">
                <a href="#" className="block text-sm text-text-muted hover:text-text-primary transition-colors">GitHub</a>
                <a href="#" className="block text-sm text-text-muted hover:text-text-primary transition-colors">npm</a>
                <a href="#" className="block text-sm text-text-muted hover:text-text-primary transition-colors">Changelog</a>
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">Legal</h4>
              <div className="space-y-2">
                <a href="#" className="block text-sm text-text-muted hover:text-text-primary transition-colors">Privacy</a>
                <a href="#" className="block text-sm text-text-muted hover:text-text-primary transition-colors">Terms</a>
              </div>
            </div>
          </div>

          <div className="border-t border-border-primary pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs text-text-muted">&copy; 2026 EvaluateAI. All rights reserved.</p>
            <p className="text-xs text-text-muted">Built by developers, for engineering managers.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
