// One-click interior themes, in the spirit of Atticus/Vellum styles. A theme sets
// type and chapter styling; trim size, edition, and margins stay as chosen.
import type { FormatSettings } from '../types';

export interface Theme {
  id: string;
  name: string;
  bestFor: string;
  settings: Partial<FormatSettings>;
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    bestFor: 'Literary and general fiction',
    settings: { bodyFont: 'EB Garamond', headingFont: 'Cormorant Garamond', fontSize: 11.5, lineHeight: 1.4, headingStyle: 'classic', chapterNumbering: 'words', dropCaps: true, smallCapsLead: true, sceneBreak: '❧', justify: true, hyphenate: true, paragraphStyle: 'indent', indent: 1.5, largePrint: false },
  },
  {
    id: 'devotional',
    name: 'Devotional',
    bestFor: 'Christian living, devotionals, memoir',
    settings: { bodyFont: 'Lora', headingFont: 'Playfair Display', fontSize: 11, lineHeight: 1.5, headingStyle: 'elegant', chapterNumbering: 'words', dropCaps: true, smallCapsLead: false, sceneBreak: '❦', justify: true, hyphenate: true, paragraphStyle: 'indent', indent: 1.5, largePrint: false },
  },
  {
    id: 'elegant',
    name: 'Elegant',
    bestFor: 'Historical, romance, fantasy',
    settings: { bodyFont: 'Crimson Pro', headingFont: 'Cinzel', fontSize: 12, lineHeight: 1.4, headingStyle: 'elegant', chapterNumbering: 'words', dropCaps: true, smallCapsLead: true, sceneBreak: '❦', justify: true, hyphenate: true, paragraphStyle: 'indent', indent: 1.5, largePrint: false },
  },
  {
    id: 'modern',
    name: 'Modern',
    bestFor: 'Contemporary fiction, YA',
    settings: { bodyFont: 'Source Serif 4', headingFont: 'Montserrat', fontSize: 11, lineHeight: 1.45, headingStyle: 'modern', chapterNumbering: 'numerals', dropCaps: false, smallCapsLead: false, sceneBreak: '* * *', justify: true, hyphenate: true, paragraphStyle: 'indent', indent: 1.25, largePrint: false },
  },
  {
    id: 'thriller',
    name: 'Bold',
    bestFor: 'Thrillers, mystery, suspense',
    settings: { bodyFont: 'Spectral', headingFont: 'Oswald', fontSize: 11, lineHeight: 1.4, headingStyle: 'bold', chapterNumbering: 'numerals', dropCaps: false, smallCapsLead: false, sceneBreak: '◆', justify: true, hyphenate: true, paragraphStyle: 'indent', indent: 1.25, largePrint: false },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    bestFor: 'Poetry, essays, quiet literary work',
    settings: { bodyFont: 'Literata', headingFont: 'Literata', fontSize: 11, lineHeight: 1.5, headingStyle: 'minimal', chapterNumbering: 'none', dropCaps: false, smallCapsLead: false, sceneBreak: '~', justify: false, hyphenate: false, paragraphStyle: 'indent', indent: 1.25, largePrint: false },
  },
  {
    id: 'nonfiction',
    name: 'Nonfiction',
    bestFor: 'Teaching, self-help, business, study guides',
    settings: { bodyFont: 'Source Serif 4', headingFont: 'Lato', fontSize: 11, lineHeight: 1.5, headingStyle: 'modern', chapterNumbering: 'numerals', dropCaps: false, smallCapsLead: false, sceneBreak: '* * *', justify: true, hyphenate: true, paragraphStyle: 'block', indent: 0, largePrint: false },
  },
  {
    id: 'large-print',
    name: 'Large Print',
    bestFor: 'Readers with low vision; meets KDP’s 16pt rule',
    settings: { bodyFont: 'Literata', headingFont: 'Literata', fontSize: 16, lineHeight: 1.35, headingStyle: 'classic', chapterNumbering: 'words', dropCaps: false, smallCapsLead: false, sceneBreak: '* * *', justify: false, hyphenate: false, paragraphStyle: 'indent', indent: 1.25, largePrint: true },
  },
];

export const getTheme = (id?: string) => THEMES.find((t) => t.id === id);
