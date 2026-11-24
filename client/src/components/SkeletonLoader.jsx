export function SkeletonLoader({
  count = 3,
  height = 'h-10',
  className = '',
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${height} bg-slate-200/60 rounded-xl animate-pulse`}
        />
      ))}
    </div>
  )
}
