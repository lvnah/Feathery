import { useState } from 'react';
import { LOGO_URL } from '../lib/brand';

// Logo Hevenly ; repli vectoriel si l'image ne charge pas.
export default function Logo({ className = 'h-7 w-7', animated = false }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
        <path d="M6 24C6 12 14 6 27 5c0 13-6 21-18 21-1 0-2 0-3-2z" fill="#e4e4e7" />
        <path d="M6 26 17 14" stroke="#71717a" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return <img src={LOGO_URL} alt="Feathery" onError={() => setBroken(true)} className={`${className} object-contain ${animated ? 'splash-logo' : ''}`} />;
}
