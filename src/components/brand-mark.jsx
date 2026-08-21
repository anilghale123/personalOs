import { cn } from "@/lib/utils";

/** The shape of one ordinary week — the signature mark's default data. */
const MARK_VALUES = [0.45, 0.8, 0.3, 1, 0.55, 0.25, 0.65];

/**
 * The Lifeline — one tick per day; a taller tick means more of that day
 * was recorded (words written, habits kept, money logged). It is the
 * selfView mark because it is literally what the product draws.
 *
 * Server-safe SVG, no client JS. Bars rise once on mount; the animation
 * is disabled under prefers-reduced-motion (see globals.css).
 */
export function Lifeline({
  values = MARK_VALUES,
  className,
  barClassName,
  animated = true,
  stretch = false,
  label = "A week of days, taller where more was recorded",
}) {
  const BAR_W = 3;
  const GAP = 4;
  const H = 20;
  const width = values.length * (BAR_W + GAP) - GAP;

  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      className={className}
      role="img"
      aria-label={label}
      preserveAspectRatio={stretch ? "none" : "xMidYMax meet"}
    >
      {values.map((v, i) => {
        const height = Math.max(2.5, v * H);
        return (
          <rect
            key={i}
            x={i * (BAR_W + GAP)}
            y={H - height}
            width={BAR_W}
            height={height}
            rx={BAR_W / 2}
            fill="currentColor"
            className={cn(animated && "lifeline-bar", barClassName)}
            style={animated ? { animationDelay: `${i * 70}ms` } : undefined}
          />
        );
      })}
    </svg>
  );
}

/** Lifeline mark + selfView wordmark. */
export function BrandMark({ className, markClassName, wordClassName }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Lifeline
        className={cn("h-4 w-auto text-brand", markClassName)}
        animated={false}
        label="selfView"
      />
      <span
        className={cn(
          "font-display text-lg font-semibold tracking-tight",
          wordClassName
        )}
      >
        selfView
      </span>
    </span>
  );
}
