'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

/**
 * Single-responsibility copy-to-clipboard button.
 * Manages its own ephemeral "copied" state (1.5s).
 */
export function CopyButton({ value, label = 'Copy', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors',
        'bg-accent/10 text-accent hover:bg-accent/20',
        className,
      )}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
