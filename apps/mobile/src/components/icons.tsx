import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { c } from '@/lib/theme';

const p = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: 2,
});

export const SearchIcon = ({ size = 16, color = c.text }: { size?: number; color?: string }) => (
  <Svg {...p(size, color)}>
    <Circle cx={11} cy={11} r={8} />
    <Path d="m21 21-4.3-4.3" />
  </Svg>
);
export const GridIcon = ({ size = 16, color = c.text }: { size?: number; color?: string }) => (
  <Svg {...p(size, color)}>
    <Rect x={3} y={3} width={7} height={7} />
    <Rect x={14} y={3} width={7} height={7} />
    <Rect x={3} y={14} width={7} height={7} />
    <Rect x={14} y={14} width={7} height={7} />
  </Svg>
);
export const ListIcon = ({ size = 16, color = c.text }: { size?: number; color?: string }) => (
  <Svg {...p(size, color)}>
    <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
);
export const ShelfIcon = ({ size = 16, color = c.text }: { size?: number; color?: string }) => (
  <Svg {...p(size, color)}>
    <Path d="M3 5h18M3 10h18M3 15h18M3 20h18" />
  </Svg>
);
export const FilterIcon = ({ size = 18, color = c.text }: { size?: number; color?: string }) => (
  <Svg {...p(size, color)}>
    <Path d="M3 6h18M7 12h10M10 18h4" />
  </Svg>
);
