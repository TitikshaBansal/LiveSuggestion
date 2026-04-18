'use client';

import React from 'react';

// A single neutral container used by every panel — transcript lines,
// suggestion cards, chat bubbles, settings sections. Keeping this one
// primitive avoids a fleet of slightly-different div wrappers.

type Props = React.HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'button';
  interactive?: boolean;
};

export function Card({ as = 'div', interactive, className = '', ...rest }: Props) {
  const base =
    'rounded-xl border border-border bg-panel text-sm text-white/90 transition-colors';
  const hover = interactive
    ? 'cursor-pointer hover:border-accent/60 hover:bg-[#181a21] active:scale-[0.997]'
    : '';
  const cls = `${base} ${hover} ${className}`.trim();

  if (as === 'button') {
    return <button type="button" className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)} />;
  }
  return <div className={cls} {...rest} />;
}
