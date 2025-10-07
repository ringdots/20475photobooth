'use client';

import { useEffect, useState } from 'react';

export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <>
      <button
        type="button"
        aria-label="맨 위로"
        onClick={scrollToTop}
        className="topBtn"
        style={{
          opacity: show ? 1 : 0,
          pointerEvents: show ? 'auto' : 'none',
        }}
      >
        ↑ TOP
      </button>

      <style jsx>{`
        .topBtn {
          position: fixed;
          right: max(16px, env(safe-area-inset-right));
          bottom: calc(max(16px, env(safe-area-inset-bottom)) + 8px);
          z-index: 9999;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid #e7e7e7;
          background: #ffffffcc;
          backdrop-filter: saturate(180%) blur(6px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.08em;
          color: #191919;
          transition: opacity .2s ease, transform .2s ease, box-shadow .2s ease;
        }
        .topBtn:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(0,0,0,.14); }
        .topBtn:active { transform: translateY(0); }
        .topBtn:focus-visible { outline: 2px solid #191919; outline-offset: 2px; }
      `}</style>
    </>
  );
}