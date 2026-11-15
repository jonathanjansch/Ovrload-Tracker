import { useState } from "react";

// Number field that accepts both "62.5" and "62,5" (Swedish keyboards) and lets you
// finish typing a decimal before the value is applied.
export function NumberField({
  value,
  onChange,
  decimals,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  decimals: boolean;
  className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      value={draft ?? String(value ?? 0)}
      onFocus={(e) => { setDraft(String(value ?? 0)); e.target.select(); }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        const pattern = decimals ? /^\d*\.?\d{0,2}$/ : /^\d*$/;
        if (!pattern.test(raw)) return;
        setDraft(e.target.value);
        const parsed = raw === "" || raw === "." ? 0 : Number(raw);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      className={className}
      placeholder="0"
    />
  );
}
