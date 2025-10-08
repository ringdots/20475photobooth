'use client';
import { useEffect } from 'react';

export default function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 2200); // 2.2초 후 자동 닫힘
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <>
      <div className="toast">{message}</div>

      <style jsx>{`
        .toast {
          position: fixed;
          left: 50%;
          bottom: max(24px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          background: rgba(30, 30, 30, 0.9);
          color: #fff;
          padding: 10px 18px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.3px;
          z-index: 99999;
          animation: fadeInOut 2.4s ease both;
        }

        @keyframes fadeInOut {
          0% {
            opacity: 0;
            transform: translate(-50%, 16px);
          }
          10% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          90% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, 16px);
          }
        }
      `}</style>
    </>
  );
}
