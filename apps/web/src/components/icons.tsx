/** Stroke icons from the mockups (24-unit viewBox, 2px stroke). */
type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  'aria-hidden': true,
});

export const SearchIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const GridIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

export const ListIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

/** Shelf of spines (collection "Estante" view). */
export const ShelfIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M3 5h18M3 10h18M3 15h18M3 20h18" />
  </svg>
);

export const FilterIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M3 6h18M7 12h10M10 18h4" />
  </svg>
);
