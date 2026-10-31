import { useEffect, useRef, useState } from "react";

// SSE-style typewriter — reveals `text` a few characters at a time to simulate
// streaming token output. Calls `onDone` once the full text has been revealed.
// Extracted from ResourceCards so the StarMap chat can reuse the same effect.
export function useTypewriter(text: string, on: boolean, speed = 16, step = 2, onDone?: () => void) {
  const [out, setOut] = useState(on ? "" : text);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!on) {
      setOut(text);
      return;
    }
    setOut("");
    let i = 0;
    const id = setInterval(() => {
      i += step;
      setOut(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        doneRef.current?.();
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, on, speed, step]);

  return out;
}
