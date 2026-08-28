import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

import './Input.css';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
  suffix?: string;
}

/**
 * Input dengan label yang benar-benar terhubung.
 *
 * useId dipakai supaya htmlFor dan id selalu cocok tanpa perlu diketik manual
 * di setiap pemakaian. Label yang tidak terhubung membuat mengetuk teksnya
 * tidak memfokuskan kolomnya, dan pembaca layar membacakan kolom tanpa nama.
 */
export const Input = ({ label, hint, error, icon, suffix, ...rest }: InputProps) => {
  const id = useId();
  const hintId = id + '-hint';

  return (
    <div className="field">
      {label ? (
        <label htmlFor={id} className="t-label field-label">
          {label}
        </label>
      ) : null}

      <div className={'field-box' + (error ? ' field-box-error' : '')}>
        {icon ? <span className="field-icon">{icon}</span> : null}

        <input
          id={id}
          className="field-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={(error ?? hint) ? hintId : undefined}
          {...rest}
        />

        {suffix ? <span className="field-suffix c-tertiary">{suffix}</span> : null}
      </div>

      {error ? (
        <span id={hintId} className="t-caption field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="t-caption c-tertiary">
          {hint}
        </span>
      ) : null}
    </div>
  );
};
