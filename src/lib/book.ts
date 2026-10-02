// Shared book assembly: section ordering, chapter labels, front matter text.
import type { Chapter, Project } from '../types';
import { escapeHtml, numberToWords, toRoman } from './util';

export const BODY_FONTS = ['EB Garamond', 'Crimson Pro', 'Libre Baskerville', 'Lora', 'Literata', 'Source Serif 4', 'Spectral', 'Merriweather', 'Cormorant Garamond'];
export const DISPLAY_FONTS = ['Cormorant Garamond', 'Cinzel', 'Playfair Display', 'EB Garamond', 'Libre Baskerville', 'Abril Fatface', 'Bebas Neue', 'Oswald', 'Montserrat', 'Raleway', 'Lato', 'Josefin Sans'];

export function googleFontsHref(fonts: string[]): string {
  const families = [...new Set(fonts)]
    .map((f) => {
      const fam = f.replace(/ /g, '+');
      if (['Bebas Neue', 'Abril Fatface'].includes(f)) return `family=${fam}`;
      if (['Oswald', 'Josefin Sans', 'Montserrat', 'Raleway', 'Lato'].includes(f)) return `family=${fam}:wght@300;400;700`;
      if (f === 'Cinzel') return `family=${fam}:wght@400;700`;
      return `family=${fam}:ital,wght@0,400;0,700;1,400;1,700`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

const UNNUMBERED_RE = /^(prologue|epilogue|introduction|interlude|prelude|preface|foreword|afterword|part\s+\S+)\b/i;
const CHAPTER_PREFIX_RE = /^(chapter|ch\.)\s+([0-9]+|[ivxlcdm]+|[a-z-]+)\b[\s:.\-–—]*/i;

export interface BookSection {
  chapter: Chapter;
  anchor: string;
  /** Small label above the title, e.g. "Chapter Three". Empty for unnumbered sections. */
  label: string;
  /** Display title, e.g. "The Long Road" — may be empty for numbered chapters. */
  name: string;
  /** Text used in the table of contents. */
  tocText: string;
}

export function chapterLabel(n: number, style: Project['format']['chapterNumbering']): string {
  switch (style) {
    case 'words': return `Chapter ${numberToWords(n)}`;
    case 'numerals': return `Chapter ${n}`;
    case 'roman': return `Chapter ${toRoman(n)}`;
    default: return '';
  }
}

export function buildSections(project: Project, chapters: Chapter[]): {
  front: BookSection[];
  preToc: BookSection[];
  body: BookSection[];
  back: BookSection[];
} {
  let n = 0;
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const mk = (c: Chapter): BookSection => {
    const anchor = `s-${c.id.slice(0, 8)}`;
    if (c.kind !== 'chapter' || UNNUMBERED_RE.test(c.title)) {
      return { chapter: c, anchor, label: '', name: c.title, tocText: c.title };
    }
    n++;
    const name = c.title.replace(CHAPTER_PREFIX_RE, '').trim();
    const label = chapterLabel(n, project.format.chapterNumbering);
    const isOnlyNumber = CHAPTER_PREFIX_RE.test(c.title) && !name;
    return {
      chapter: c,
      anchor,
      label,
      name: isOnlyNumber && !label ? c.title : name,
      tocText: label && name ? `${label}: ${name}` : label || name || c.title,
    };
  };
  const all = sorted.map(mk);
  const front = all.filter((s) => s.chapter.kind === 'front');
  return {
    preToc: front.filter((s) => /^(dedication|epigraph)$/i.test(s.chapter.title.trim())),
    front: front.filter((s) => !/^(dedication|epigraph)$/i.test(s.chapter.title.trim())),
    body: all.filter((s) => s.chapter.kind === 'chapter'),
    back: all.filter((s) => s.chapter.kind === 'back'),
  };
}

export function isFiction(genre: string): boolean {
  return /fiction|novel|fantasy|thriller|romance|mystery|sci-?fi|horror|suspense|adventure|dystopian|western/i.test(genre) && !/non-?fiction/i.test(genre);
}

export function copyrightLines(project: Project): string[] {
  const m = project.meta;
  const year = m.pubYear || String(new Date().getFullYear());
  const lines = [
    `Copyright © ${year} ${project.author || '[Author Name]'}`,
    'All rights reserved.',
    'No part of this book may be reproduced, stored in a retrieval system, or transmitted in any form or by any means without the prior written permission of the author, except for brief quotations in reviews.',
  ];
  if (isFiction(project.genre)) {
    lines.push('This is a work of fiction. Names, characters, places, and incidents are products of the author’s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, or actual events is purely coincidental.');
  }
  if (m.isbnPrint) lines.push(`ISBN (paperback): ${m.isbnPrint}`);
  if (m.isbnEbook) lines.push(`ISBN (ebook): ${m.isbnEbook}`);
  if (m.publisher) lines.push(`Published by ${m.publisher}`);
  if (m.edition) lines.push(m.edition);
  return lines;
}

export const p = (text: string) => `<p>${escapeHtml(text)}</p>`;
