import { useEffect, useState } from 'react';

interface InterludeProps {
  active: boolean;
}

/**
 * Full-screen fetch interlude with a deliberate readable delay:
 * "Fetching menu from seat pocket..." (2 s) → "Almost there…" (stays — never recycles).
 */
export default function Interlude({ active }: InterludeProps) {
  const [almost, setAlmost] = useState(false);

  useEffect(() => {
    if (!active) {
      setAlmost(false);
      return;
    }
    const t = setTimeout(() => setAlmost(true), 2000);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div className="interlude" role="status" aria-live="polite">
      <div className="interlude-inner">
        <div className="ring" />
        <div className="interlude-copy">{almost ? 'Almost there…' : 'Fetching menu from seat pocket…'}</div>
      </div>
    </div>
  );
}
