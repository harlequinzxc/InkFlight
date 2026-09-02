import { useEffect, useRef, useState } from 'react';

interface EditableProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}

/** Inline contentEditable text field — commits on blur/Enter, Esc reverts. */
export default function Editable({ value, onChange, className, placeholder, multiline }: EditableProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused && ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value, focused]);

  return (
    <span
      ref={ref}
      className={`editable${className ? ' ' + className : ''}${focused ? ' editing' : ''}${value ? '' : ' empty'}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder ?? ''}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const text = ref.current?.textContent ?? '';
        const clean = multiline ? text.replace(/\n{3,}/g, '\n\n').trim() : text.replace(/\s+/g, ' ').trim();
        if (clean !== value) onChange(clean);
        else if (ref.current) ref.current.textContent = value;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          if (ref.current) ref.current.textContent = value;
          (e.target as HTMLElement).blur();
        }
      }}
    />
  );
}
