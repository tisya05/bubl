// Navy Sherbet design tokens. Pull colors and fonts from here, never hard-code them in screens.

import type { Category } from './types';

export const colors = {
  navy: '#243B64',
  navyHover: '#172946',
  sherbet: '#FF8A5B',       // accent, "you" dot, smile
  paleBlue: '#CFE0F0',
  paper: '#F4F1EA',         // page background
  card: '#FBF9F4',
  border: '#DDD6C8',
  ink: '#17171C',           // text
  muted: '#5E5A52',         // secondary text
} as const;

export const fonts = {
  body: "'Bricolage Grotesque', system-ui, sans-serif",   // display + body
  mono: "'DM Mono', ui-monospace, monospace",             // small uppercase labels, distances
} as const;

export interface CategoryMeta {
  label: string;
  color: string;
  tint: string;   // card background
  icon: string;   // lucide icon name; always show it with the color, never color alone
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  Food:   { label: 'Food',   color: '#FF8A5B', tint: '#FFE1D4', icon: 'utensils' },
  Cafe:   { label: 'Cafe',   color: '#C98B4A', tint: '#F1E1CD', icon: 'coffee' },
  Park:   { label: 'Park',   color: '#6BAF7A', tint: '#DCEBD9', icon: 'trees' },
  Street: { label: 'Street', color: '#5B8FD9', tint: '#D7E4F6', icon: 'signpost' },
  Misc:   { label: 'Misc',   color: '#B07CD8', tint: '#EADCF5', icon: 'sparkles' },
};
