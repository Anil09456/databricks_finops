/**
 * SvgIcon — thin wrapper around Lucide icons for consistent sizing & colour.
 * Usage:  <SvgIcon icon={BarChart3} size={16} color="var(--cyan)" />
 */
export default function SvgIcon({ icon: Icon, size = 16, color = 'currentColor', strokeWidth = 1.75, className = '' }) {
  if (!Icon) return null
  return (
    <Icon
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  )
}
