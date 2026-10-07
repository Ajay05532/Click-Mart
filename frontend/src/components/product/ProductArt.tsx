import type { ArtTone } from '../../types.ts'

const palettes: Record<
  ArtTone,
  { bg: string; pouch: string; shade: string; label: string; bits: string[] }
> = {
  amber: { bg: '#f8f1e7', pouch: '#e7b56a', shade: '#c4843a', label: '#5c3b16', bits: ['#c6864a', '#e8c49a', '#a86b32'] },
  cream: { bg: '#fbf7f0', pouch: '#f0e2c8', shade: '#d4b483', label: '#6a5030', bits: ['#f4e7cf', '#e7d3ae', '#c8a56a'] },
  wine: { bg: '#f8eef2', pouch: '#8d3d55', shade: '#5e2436', label: '#fff8f8', bits: ['#6e2e24', '#8a4034', '#a15a3a'] },
  cocoa: { bg: '#f6f1eb', pouch: '#7a5340', shade: '#4a2e22', label: '#fff8f3', bits: ['#a9784e', '#c9a27a', '#6b442c'] },
  leaf: { bg: '#eef6ef', pouch: '#3f8f55', shade: '#1f5a32', label: '#f4fff6', bits: ['#d7e38a', '#8fbf55', '#e7d7a4'] },
  olive: { bg: '#f7f6e8', pouch: '#9aa34a', shade: '#5c6424', label: '#24300f', bits: ['#e6d48a', '#cbb65a', '#f3e7b8'] },
  ink: { bg: '#f2f4f6', pouch: '#2f3840', shade: '#171c21', label: '#f7f7f7', bits: ['#f4f1ea', '#ded8ce', '#c9c2b6'] },
  plum: { bg: '#f7f0f6', pouch: '#7a457c', shade: '#4a2750', label: '#fff7ff', bits: ['#c48b6a', '#a86b4a', '#e3b89a'] },
  apricot: { bg: '#fdf4ec', pouch: '#ef8a45', shade: '#c45e1e', label: '#fff8f3', bits: ['#f3b27a', '#e8894a', '#ffd2a8'] },
  sand: { bg: '#fbf8f2', pouch: '#e4d5b4', shade: '#b89a6a', label: '#5c4630', bits: ['#f7f1e4', '#e7dcc4', '#d9c7a4'] },
  mix: { bg: '#eef2fb', pouch: '#1d4e9f', shade: '#102e68', label: '#f5f8ff', bits: ['#e0b15a', '#8fbf55', '#c47a4a', '#f4e7cf'] },
}

export function ProductArt({
  name,
  art,
  className = '',
}: {
  name: string
  art: ArtTone
  className?: string
}) {
  const palette = palettes[art]
  const bits = [
    [78, 118],
    [108, 108],
    [136, 124],
    [92, 142],
    [124, 146],
    [150, 138],
    [110, 168],
  ]

  return (
    <svg viewBox="0 0 240 240" className={className} role="img" aria-label={name}>
      <rect width="240" height="240" fill={palette.bg} />
      <path
        d="M68 48h104c8 28 14 70 14 92 0 36-10 62-22 72H76c-12-10-22-36-22-72 0-22 6-64 14-92Z"
        fill={palette.pouch}
      />
      <path d="M78 58h84c6 24 12 58 12 78 0 8-1 16-2 22H68c-1-6-2-14-2-22 0-20 6-54 12-78Z" fill={palette.shade} opacity="0.28" />
      <rect x="86" y="62" width="68" height="36" rx="6" fill="#fff" opacity="0.92" />
      <text x="120" y="76" textAnchor="middle" fontSize="8" fontWeight="700" fill="#f47b20" fontFamily="ui-sans-serif, system-ui">
        NOURIVA
      </text>
      <text x="120" y="90" textAnchor="middle" fontSize="8" fontWeight="700" fill="#152033" fontFamily="ui-sans-serif, system-ui">
        {name.length > 16 ? `${name.slice(0, 15)}…` : name}
      </text>
      {bits.map(([x, y], index) => (
        <ellipse
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          rx={index % 2 === 0 ? 14 : 11}
          ry={index % 2 === 0 ? 10 : 8}
          fill={palette.bits[index % palette.bits.length]}
          transform={`rotate(${index * 18} ${x} ${y})`}
        />
      ))}
    </svg>
  )
}
