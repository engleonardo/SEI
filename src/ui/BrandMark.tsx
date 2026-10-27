import { browser } from 'wxt/browser';

export interface BrandMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

function logoUrl(): string {
  try {
    return browser.runtime.getURL('/icon-128.png');
  } catch {
    return '/icon-128.png';
  }
}

/**
 * Marca oficial do SEI Flow. O arquivo fonte fica em `docs/brand/sei-flow.svg`
 * e os PNGs são gerados por `scripts/generate-icons.mjs`.
 */
export function BrandMark({ size = 32, className, title }: BrandMarkProps) {
  return (
    <img
      src={logoUrl()}
      width={size}
      height={size}
      className={className}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      style={{ display: 'block', objectFit: 'contain', flex: '0 0 auto' }}
    />
  );
}
