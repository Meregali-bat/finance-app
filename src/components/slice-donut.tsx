/**
 * A rosca das fatias: um anel com um arco por fatia, na ordem e na cor delas,
 * com um vão entre os arcos. O centro recebe o que a tela quiser dizer.
 */
export function SliceDonut({
  segments,
  size = 200,
  children,
  label,
}: {
  segments: { key: string; value: number; color: string }[];
  size?: number;
  children?: React.ReactNode;
  /** O que a rosca mostra, para quem não a vê. */
  label: string;
}) {
  const stroke = size * 0.14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const visible = segments.filter((s) => s.value > 0);
  // O vão some quando há uma fatia só: ele cortaria o anel inteiro.
  const gap = visible.length > 1 ? Math.min(6, circumference * 0.012) : 0;

  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-full -rotate-90"
        role="img"
        aria-label={label}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          style={{ stroke: "var(--track)", strokeWidth: stroke }}
        />
        {total > 0 &&
          visible.map((segment) => {
            const length = (segment.value / total) * circumference;
            const dash = Math.max(0, length - gap);
            const circle = (
              <circle
                key={segment.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                style={{
                  stroke: segment.color,
                  strokeWidth: stroke,
                  transition:
                    "stroke-dasharray 300ms var(--ease-out-quint), stroke-dashoffset 300ms var(--ease-out-quint)",
                }}
              />
            );
            offset += length;
            return circle;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
