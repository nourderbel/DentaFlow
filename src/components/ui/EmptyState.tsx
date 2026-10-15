// EmptyState.tsx
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-slate-400">
      <p className="font-semibold text-slate-500">{title}</p>
      {hint && <p className="mt-1">{hint}</p>}
    </div>
  );
}