import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

/**
 * Reusable empty state — icon + title + description + optional CTA.
 *
 * @example
 * <EmptyState icon={Eye} title="No monitors yet" description="..." action={{ label: 'Create', href: '/monitors/new' }} />
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card space-y-3 p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
        <Icon className="h-7 w-7 text-accent" />
      </div>
      <div className="space-y-2">
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      {action && (
        <Link href={action.href} className="btn inline-flex">
          {action.label}
        </Link>
      )}
    </div>
  );
}
