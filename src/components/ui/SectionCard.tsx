import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function SectionCard({
  icon: Icon,
  title,
  action,
  children,
  className = ''
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded border border-slate-200 p-3.5 shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-indigo-600" />
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-700">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
