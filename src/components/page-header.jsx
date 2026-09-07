/**
 * Screen header, Organic form — a tracked uppercase kicker sitting above a
 * large display title, actions aligned to the baseline on the right.
 *
 * The `icon` prop is still accepted so callers need not change, but Organic
 * headers carry no icon: the kicker does that work.
 */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-11">
      <div>
        {subtitle && <p className="kicker mb-2.5">{subtitle}</p>}
        <h1 className="font-display text-[26px] leading-[1.12] tracking-tight sm:text-[32px]">
          {title}
        </h1>
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}
