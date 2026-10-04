import { macroColors } from '@/constants/colors';
import './MacroStack.css';

/**
 * Padanan MacroBar mobile: protein, karbo, dan lemak dalam satu batang, plus
 * gula.
 *
 * Gula adalah BAGIAN dari karbohidrat, jadi digambar di dalam batang karbo,
 * bukan batang keempat yang menghitung gram yang sama dua kali.
 */
export const MacroStack = ({
  protein,
  carbs,
  fat,
  sugar,
}: {
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
}) => {
  const total = protein + carbs + fat;
  // Gula tidak pernah melebihi karbo; ditahan untuk berjaga dari pembulatan.
  const gula = Math.min(Math.max(sugar, 0), carbs);

  const legenda = [
    { label: 'Protein', value: protein, color: macroColors.protein },
    { label: 'Karbo', value: carbs, color: macroColors.carbs },
    { label: 'Lemak', value: fat, color: macroColors.fat },
    { label: 'Gula', value: sugar, color: macroColors.sugar },
  ];

  return (
    <div className="macro-stack">
      <div className="macro-stack-bar">
        {total <= 0 ? (
          <span className="macro-stack-empty" />
        ) : (
          <>
            <span style={{ flex: protein, background: macroColors.protein }} />
            <span className="macro-stack-carbs" style={{ flex: carbs }}>
              <span style={{ flex: carbs - gula, background: macroColors.carbs }} />
              {gula > 0 ? <span style={{ flex: gula, background: macroColors.sugar }} /> : null}
            </span>
            <span style={{ flex: fat, background: macroColors.fat }} />
          </>
        )}
      </div>

      <div className="macro-stack-legend">
        {legenda.map((b) => (
          <span key={b.label} className="macro-stack-item">
            <span className="macro-stack-head">
              <span className="macro-stack-dot" style={{ background: b.color }} />
              <span className="t-caption c-secondary">{b.label}</span>
            </span>
            <span className="t-label">{Math.round(b.value)}g</span>
          </span>
        ))}
      </div>
    </div>
  );
};
