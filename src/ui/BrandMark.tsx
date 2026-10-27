import { useId } from 'react';

export interface BrandMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Marca do SEI Flow: quadro branco com duas barras azuis e pétalas coloridas atrás.
 * Fonte visual equivalente a `public/logo.svg` (usada para gerar os ícones PNG).
 */
export function BrandMark({ size = 32, className, title }: BrandMarkProps) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const green = `sfGreen-${raw}`;
  const red = `sfRed-${raw}`;
  const orange = `sfOrange-${raw}`;
  const yellow = `sfYellow-${raw}`;
  const blue = `sfBlue-${raw}`;
  const bar = `sfBar-${raw}`;
  const shadow = `sfShadow-${raw}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={green} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#3ee06a" />
          <stop offset="1" stopColor="#009f4d" />
        </linearGradient>
        <linearGradient id={red} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ff5a4e" />
          <stop offset="1" stopColor="#e22222" />
        </linearGradient>
        <linearGradient id={orange} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffb01f" />
          <stop offset="1" stopColor="#ff7a00" />
        </linearGradient>
        <linearGradient id={yellow} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffe234" />
          <stop offset="1" stopColor="#ffc400" />
        </linearGradient>
        <linearGradient id={blue} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#2d8cff" />
          <stop offset="1" stopColor="#083fd6" />
        </linearGradient>
        <linearGradient id={bar} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#1ab8ff" />
          <stop offset="1" stopColor="#0b5cff" />
        </linearGradient>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.18" />
        </filter>
      </defs>

      <g>
        <path
          d="M72 19c9-14 29-17 40-4 7 9 6 20-2 27-10 9-23 10-31 3-9-7-12-17-7-26z"
          fill={`url(#${green})`}
        />
        <path
          d="M107 33c16-4 28 9 23 24-4 11-15 16-26 12-11-4-17-15-13-26 3-7 8-10 16-10z"
          fill={`url(#${red})`}
        />
        <path
          d="M102 65c17-7 30 3 27 19-2 11-13 19-24 16-12-4-18-17-12-28 2-4 5-6 9-7z"
          fill={`url(#${orange})`}
        />
        <path
          d="M77 69c12-8 27-4 31 9 4 12-5 24-18 24-12 0-21-10-20-21 1-5 3-9 7-12z"
          fill={`url(#${yellow})`}
        />
        <path
          d="M87 94c12 0 21 11 17 23-4 12-19 16-28 7-8-8-6-21 4-27 2-2 4-3 7-3z"
          fill={`url(#${blue})`}
        />
      </g>

      <rect
        x="13"
        y="34"
        width="74"
        height="74"
        rx="19"
        fill="#ffffff"
        stroke="#e8eef6"
        strokeWidth="1"
        filter={`url(#${shadow})`}
      />
      <rect x="29" y="50" width="22" height="47" rx="7" fill={`url(#${bar})`} />
      <rect x="59" y="50" width="22" height="30" rx="7" fill={`url(#${bar})`} />
    </svg>
  );
}
