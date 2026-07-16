// Minimal line-icon set (stroke-based, currentColor) used to replace generic
// emoji across the landing page — always rendered inside <IconBadge> for the
// glowing blue treatment.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconBadge({ children, size = 'md', pulse = false, className = '' }) {
  const sizes = { sm: 'w-10 h-10', md: 'w-14 h-14', lg: 'w-16 h-16' }
  const iconSizes = { sm: 'w-5 h-5', md: 'w-7 h-7', lg: 'w-8 h-8' }
  return (
    <div className={`${sizes[size]} rounded-2xl bg-gradient-brand flex items-center justify-center shadow-glow-sm flex-shrink-0 ${pulse ? 'animate-glow-pulse' : ''} ${className}`}>
      <span className={`text-white ${iconSizes[size]}`}>{children}</span>
    </div>
  )
}

export function IconCommunity({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20c0-3.2 2.2-5.5 5-5.5s5 2.3 5 5.5" />
      <circle cx="16.2" cy="9" r="2.4" />
      <path d="M14.7 20c0-2.4 1.4-4.3 3.8-4.3" />
    </svg>
  )
}

export function IconCard({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <path d="M7 15h4" />
    </svg>
  )
}

export function IconSparkle({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.8 5.8l2.6 2.6M15.6 15.6l2.6 2.6M18.2 5.8l-2.6 2.6M8.4 15.6l-2.6 2.6" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function IconShield({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

export function IconPhone({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.3h2" />
    </svg>
  )
}

export function IconGlobe({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  )
}

export function IconClipboard({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3" rx="1" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  )
}

export function IconChat({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.4-3.5A8 8 0 0 1 4 12z" />
      <circle cx="9" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconLock({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="10" width="14" height="9" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
      <path d="M12 14v2" />
    </svg>
  )
}

export function IconBolt({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  )
}

export function IconChart({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M5 20V12M11 20V6M17 20v-5" />
      <path d="M3 20h18" />
    </svg>
  )
}

export function IconBank({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 10l8-5 8 5" />
      <path d="M5 10v9M9 10v9M15 10v9M19 10v9" />
      <path d="M3 21h18" />
    </svg>
  )
}

export function IconDownload({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}

export function IconWallet({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M16.5 12a1.5 1.5 0 0 0 0 3H20v-3h-3.5z" />
    </svg>
  )
}

export function IconShare({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="17" cy="6" r="2.2" />
      <circle cx="17" cy="18" r="2.2" />
      <path d="M8 11l7-4M8 13l7 4" />
    </svg>
  )
}
