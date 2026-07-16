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

export function IconBulb({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.7.5 1 1.3 1 2.1h5c0-.8.3-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  )
}

export function IconPalette({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.5-1.5H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8z" />
      <circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconChainLink({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M9 15l6-6" />
      <path d="M10 6.5l1.3-1.3a3 3 0 0 1 4.2 4.2L14.2 10.7" />
      <path d="M13.8 17.3l-1.3 1.3a3 3 0 0 1-4.2-4.2l1.3-1.3" />
    </svg>
  )
}

export function IconGear({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  )
}

export function IconRocket({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3c2.5 1.5 4 4.5 4 8 0 2-1 4-2 5l-2 2-2-2c-1-1-2-3-2-5 0-3.5 1.5-6.5 4-8z" />
      <circle cx="12" cy="10" r="1.4" />
      <path d="M9.5 16.5 7 19M14.5 16.5 17 19" />
    </svg>
  )
}

export function IconTrendUp({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 16l5-5 3 3 6-7" />
      <path d="M14 7h4v4" />
    </svg>
  )
}

export function IconCheck({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

// The XRP ledger's own crossing-wave glyph — distinct from Ripple (the
// company)'s separate circular logo, which this replaces on the chains card.
export function IconXrp({ className = 'w-full h-full' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 5.5c3 0 5 2 8 4.5 3-2.5 5-4.5 8-4.5" />
      <path d="M4 18.5c3 0 5-2 8-4.5 3 2.5 5 4.5 8 4.5" />
    </svg>
  )
}

export function IconPlus({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconSearch({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M19.5 19.5l-4.3-4.3" />
    </svg>
  )
}

export function IconWarning({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 21.5 20h-19L12 3.5z" />
      <path d="M12 9.5v5" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBell({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconCalendar({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  )
}

export function IconClock({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function IconRefresh({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  )
}

export function IconKey({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="7.5" cy="14.5" r="3.5" />
      <path d="M10 12l8.5-8.5M15 5l2 2M18 2l2 2" />
    </svg>
  )
}

export function IconHourglass({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 4 3 5.5 5 6.5C9.5 10.5 7 12 7 21M17 3c0 4-3 5.5-5 6.5 2.5 1 5 2.5 5 11.5" />
    </svg>
  )
}

export function IconFlag({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3v18" />
      <path d="M6 4.5h11l-2.5 4L17 12.5H6" />
    </svg>
  )
}

export function IconQuestion({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.5 2.5 0 1 1 3.8 2.1c-.9.6-1.3 1.1-1.3 2.1" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBan({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  )
}

export function IconX({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function IconTarget({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconMegaphone({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 10v4h3l6 4V6l-6 4H3z" />
      <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
    </svg>
  )
}

export function IconBuilding({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <path d="M9 7h.01M9 11h.01M9 15h.01M15 7h.01M15 11h.01M15 15h.01" />
      <path d="M10 21v-3h4v3" />
    </svg>
  )
}

export function IconLaptop({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4.5" width="16" height="11" rx="1.5" />
      <path d="M2 19.5h20" />
    </svg>
  )
}

export function IconBook({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4.5A2 2 0 0 1 6 3h10.5v16H6a2 2 0 0 0-2 1.5z" />
      <path d="M4 19V4.5" />
      <path d="M8 8h6" />
    </svg>
  )
}

export function IconCoin({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2 0 0 1 2.5-1.3c1.4 0 2.5.9 2.5 2s-1.1 1.6-2.5 2-2.5.9-2.5 2 1.1 2 2.5 2S15 15 15 15" />
      <path d="M12 6.5v11" />
    </svg>
  )
}

export function IconMedal({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="15" r="5" />
      <path d="M9.5 12 7 3h3l2 6M14.5 12 17 3h-3l-2 6" />
      <path d="M10.3 13.5 12 15l1.7-1.5" />
    </svg>
  )
}

export function IconScale({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3v17M8 20h8" />
      <path d="M5 7h6M13 7h6" />
      <path d="M5 7 2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z" />
    </svg>
  )
}

export function IconHouses({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 11.5 8 7l5 4.5V19H3v-7.5z" />
      <path d="M13 19v-5.5l4-3.5 4 3.5V19h-8z" />
    </svg>
  )
}

export function IconStar({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l2.6 5.8 6.2.6-4.7 4.2 1.4 6.2L12 16.8 6.5 19.8l1.4-6.2-4.7-4.2 6.2-.6L12 3z" />
    </svg>
  )
}

export function IconArrowUpRight({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}

export function IconArrowDownLeft({ className = 'w-full h-full' }) {
  return (
    <svg {...base} className={className}>
      <path d="M17 7 7 17M15 17H7V9" />
    </svg>
  )
}
