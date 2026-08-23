import './Chip.css';

interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export const Chip = ({ label, active = false, onClick }: ChipProps) => (
  <button
    type="button"
    onClick={onClick}
    // aria-pressed memberi tahu pembaca layar bahwa ini sakelar yang sedang
    // menyala, bukan sekadar tombol biasa — warnanya saja tidak menyampaikan itu.
    aria-pressed={active}
    className={'chip' + (active ? ' chip-active' : '')}
  >
    {label}
  </button>
);

export const ChipGroup = <T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Record<T, string>;
}) => (
  <div className="chip-group">
    {options.map((option) => (
      <Chip
        key={option}
        label={labels?.[option] ?? option}
        active={option === value}
        onClick={() => onChange(option)}
      />
    ))}
  </div>
);
