import { useEffect, useState } from 'react';

interface InterludeProps {
  active: boolean;
}

/**
 * Full-screen fetch interlude with a *deliberate* fake delay so the copy is
 * readable: "Fetching menu from seat pocket..." (≥2 s) → "Almost there..." (≥1 s).
 */
export default function Interlude({ active }: InterludeProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 2000);
    const t2 = setTimeout(() => setPhase(2), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="interlude" role="status" aria-live="polite">
      <div className="interlude-inner">
        <div className="ring" />
        <div className="interlude-copy" key={phase}>
          {phase === 0 ? 'Fetching menu from seat pocket…' : 'Almost there…'}
        </div>
        <div className="interlude-sub">SQ inflight menu service</div>
      </div>
    </div>
  );
}
