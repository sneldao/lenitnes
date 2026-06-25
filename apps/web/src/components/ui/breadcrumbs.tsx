import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  return (
    <nav className={cn('flex items-center gap-1.5 text-xs text-slate-500', className)}>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.label} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="hover:text-accent transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-slate-300' : ''}>{crumb.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
