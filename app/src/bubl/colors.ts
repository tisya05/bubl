// bubl colors that code needs directly (map layers, the "you" dot, category chips).
// The app-wide palette (backgrounds, text, buttons) is the `navy-sherbet` theme in src/themes.css.

import { Coffee, Signpost, Sparkles, Trees, Utensils, type LucideIcon } from 'lucide-react';
import type { Category } from './types';

export const BRAND = {
  navy: '#243B64',
  sherbet: '#FF8A5B',   // the "you" dot, the smile
  paleBlue: '#CFE0F0',
} as const;

export interface CategoryMeta {
  label: string;
  color: string;
  tint: string;       // card background
  icon: LucideIcon;   // always show it with the color, never color alone
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  Food:   { label: 'Food',   color: '#FF8A5B', tint: '#FFE1D4', icon: Utensils },
  Cafe:   { label: 'Cafe',   color: '#C98B4A', tint: '#F1E1CD', icon: Coffee },
  Park:   { label: 'Park',   color: '#6BAF7A', tint: '#DCEBD9', icon: Trees },
  Street: { label: 'Street', color: '#5B8FD9', tint: '#D7E4F6', icon: Signpost },
  Misc:   { label: 'Misc',   color: '#B07CD8', tint: '#EADCF5', icon: Sparkles },
};
