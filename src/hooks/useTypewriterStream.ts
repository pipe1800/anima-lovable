import { useState, useRef, useCallback, useEffect } from 'react';

interface UseTypewriterOptions {
  charsPerSecond?: number; // average flow rate
  burstVariance?: number;  // randomness factor 0..1
  maxQueue?: number;       // safety cap
}

/**
 * Streaming typewriter utility.
 * Feed raw chunks (any size). It enqueues and reveals characters at a regulated pace.
 */
export function useTypewriterStream(options: UseTypewriterOptions = {}) {
  const {
    charsPerSecond = 70,
    burstVariance = 0.25,
    maxQueue = 50000,
  } = options;

  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const queueRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const finishedRef = useRef(false);

  const feedChunk = useCallback((chunk: string) => {
    if (!chunk) return;
    if (queueRef.current.join('').length + chunk.length > maxQueue) {
      // Drop oldest overflow to keep memory bounded
      const existing = queueRef.current.join('');
      const keep = (existing + chunk).slice(-maxQueue);
      queueRef.current = [keep];
    } else {
      queueRef.current.push(chunk);
    }
    finishedRef.current = false;
    setIsTyping(true);
    if (rafRef.current == null) {
      lastFrameRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [maxQueue]);

  const markStreamFinished = useCallback(() => {
    finishedRef.current = true;
  }, []);

  const clear = useCallback(() => {
    queueRef.current = [];
    finishedRef.current = true;
    setText('');
    setIsTyping(false);
  }, []);

  const tick = useCallback((ts: number) => {
    const dt = ts - lastFrameRef.current;
    const cps = charsPerSecond * (1 + (Math.random() * 2 - 1) * burstVariance);
    const charsThisFrame = Math.max(1, Math.floor((dt / 1000) * cps));
    lastFrameRef.current = ts;

    if (queueRef.current.length) {
      let remaining = charsThisFrame;
      let acc = '';
      while (remaining > 0 && queueRef.current.length) {
        const head = queueRef.current[0];
        if (head.length <= remaining) {
          acc += head;
          remaining -= head.length;
          queueRef.current.shift();
        } else {
          acc += head.slice(0, remaining);
            queueRef.current[0] = head.slice(remaining);
          remaining = 0;
        }
      }
      if (acc) setText(prev => prev + acc);
    }

    if (!queueRef.current.length) {
      if (finishedRef.current) {
        setIsTyping(false);
        rafRef.current = null;
        return;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [charsPerSecond, burstVariance]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return { text, isTyping, feedChunk, markStreamFinished, clear };
}
