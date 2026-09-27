import type { CSSProperties, ReactNode } from 'react';

interface CoverProps {
  url?: string | null;
  /** Fixed square size in px; omit to fill the width (1:1). */
  size?: number;
  /** Stripe period of the placeholder (the mockups use 4–9 px depending on size). */
  stripe?: number;
  /** Mono caption of the placeholder ("portada"). */
  label?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** Overlay content (condition badge, buttons…). */
  children?: ReactNode;
}

/** Album cover, or the striped placeholder from the mockups when there is no image. */
export function Cover({
  url,
  size,
  stripe,
  label,
  alt = '',
  className,
  style,
  children,
}: CoverProps) {
  const s = stripe ?? (size == null ? 7 : size <= 44 ? 4 : size <= 80 ? 5 : 7);
  const box: CSSProperties = {
    position: 'relative',
    flex: 'none',
    ...(size != null ? { width: size, height: size } : { width: '100%', aspectRatio: '1' }),
    background: `repeating-linear-gradient(135deg, var(--color-neutral-200) 0 ${s}px, var(--color-neutral-300) ${s}px ${s + 1}px)`,
    ...style,
  };
  return (
    <div className={className} style={box}>
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : label ? (
        <span
          style={{
            position: 'absolute',
            left: 6,
            bottom: 6,
            font: '10px var(--mono)',
            color: 'var(--color-neutral-700)',
          }}
        >
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

/** Condition badge on the bottom-right of a grid cover. */
export function CondBadge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        position: 'absolute',
        right: 6,
        bottom: 6,
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        padding: '1px 4px',
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.55,
      }}
    >
      {children}
    </span>
  );
}
