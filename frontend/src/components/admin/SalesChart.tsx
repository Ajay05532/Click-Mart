const values = [32, 40, 36, 48, 44, 58, 63, 55, 72, 80, 76, 96]
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function SalesChart() {
  const width = 640
  const height = 220
  const step = width / (values.length - 1)
  const points = values.map((value, index) => {
    const x = index * step
    const y = height - 16 - (value / 100) * (height - 36)
    return [x, y] as const
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0]},${point[1]}`).join(' ')
  const last = points[points.length - 1]

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        <defs>
          <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#123a86" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#123a86" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#sales-fill)" />
        <path d={line} fill="none" stroke="#123a86" strokeWidth="3" />
        <circle cx={last[0]} cy={last[1]} r="5" fill="#f47b20" />
        <text x={last[0] - 70} y={last[1] - 12} fontSize="12" fill="#152033" fontWeight="700">
          ₹48,500
        </text>
      </svg>
      <div className="mt-2 grid grid-cols-12 text-center text-[10px] text-muted sm:text-xs">
        {months.map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
    </div>
  )
}
