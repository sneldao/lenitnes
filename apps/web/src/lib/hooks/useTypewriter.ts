'use client';

import { useState, useEffect, useRef } from 'react';

// Animates `text` character-by-character. Honors `prefers-reduced-motion`
// by skipping the animation entirely. Pass `animate: false` to force
// immediate render (useful for hot-reload scenarios where the laggy
// reveal hurts perceived performance).
export function useTypewriter(text: string, speed = 12, animate = true) {
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const enabled = animate && !reduceMotion;

  const [displayed, setDisplayed] = useState(enabled ? '' : text);
  const [done, setDone] = useState(!enabled);
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      setDone(true);
      return;
    }
    setDisplayed('');
    setDone(false);
    let i = 0;

    function tick() {
      i++;
      setDisplayed(text.slice(0, i));
      if (i < text.length) {
        frameRef.current = setTimeout(tick, speed);
      } else {
        setDone(true);
      }
    }
    frameRef.current = setTimeout(tick, 0);
    return () => {
      if (frameRef.current) clearTimeout(frameRef.current);
    };
  }, [text, speed, enabled]);

  const skip = () => {
    if (frameRef.current) clearTimeout(frameRef.current);
    setDisplayed(text);
    setDone(true);
  };

  return { displayed, done, skip };
}
