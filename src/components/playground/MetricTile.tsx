export function MetricTile({
  label,
  value,
  unit,
  unavailable,
  note
}: {
  label: string;
  value?: string | number;
  unit?: string;
  unavailable?: boolean;
  note?: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-2">
      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      {unavailable ? (
        <p className="text-[10px] font-semibold text-slate-400 mt-0.5">No dataset available</p>
      ) : (
        <p className="text-sm font-extrabold text-slate-800 mt-0.5">
          {value}
          {unit ? <span className="text-[9px] font-semibold text-slate-400 ml-0.5">{unit}</span> : null}
        </p>
      )}
      {note && <p className="text-[8px] text-slate-400 mt-1 leading-tight">{note}</p>}
    </div>
  );
}
