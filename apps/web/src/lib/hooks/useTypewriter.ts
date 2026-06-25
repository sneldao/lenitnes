'use client';

import { useState, useEffect, useRef } from 'react';

export function useTypewriter(text: string, speed = 12) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
    frameRef.current = setTimeout(tick, 200);
    return () => {
      if (frameRef.current) clearTimeout(frameRef.current);
    };
  }, [text, speed]);

  return { displayed, done };
}
