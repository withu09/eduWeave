import { useEffect, useState } from "react";

type SpeechListener = (speaking: boolean, label: string) => void;

let currentSpeaking = false;
let currentLabel = "语音就绪";
let activeAudio: HTMLAudioElement | null = null;
const listeners = new Set<SpeechListener>();

function notify(speaking: boolean, label = speaking ? "朗读中" : "语音就绪") {
  currentSpeaking = speaking;
  currentLabel = label;
  listeners.forEach((fn) => fn(currentSpeaking, currentLabel));
}

export function setGlobalSpeechState(speaking: boolean, label?: string) {
  notify(speaking, label);
}

export function stopAllSpeech() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  notify(false, "语音就绪");
}

export function stripMarkdownForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]+/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " 公式 ")
    .replace(/\$[^$]+\$/g, " 公式 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speakWithBrowserTTS(
  text: string,
  options?: { onEnd?: () => void; onError?: () => void; label?: string }
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    options?.onError?.();
    return false;
  }
  stopAllSpeech();
  const clean = stripMarkdownForSpeech(text);
  if (!clean) {
    options?.onEnd?.();
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "zh-CN";
  utterance.rate = 1.02;
  const voices = window.speechSynthesis.getVoices();
  const zhVoice =
    voices.find((v) => v.lang.includes("zh") && (v.name.includes("Xiaoxiao") || v.name.includes("Yunxi") || v.name.includes("Natural"))) ||
    voices.find((v) => v.lang.includes("zh"));
  if (zhVoice) utterance.voice = zhVoice;

  utterance.onstart = () => notify(true, options?.label || "朗读中");
  utterance.onend = () => {
    notify(false, "语音就绪");
    options?.onEnd?.();
  };
  utterance.onerror = () => {
    notify(false, "语音就绪");
    options?.onError?.();
  };
  notify(true, options?.label || "朗读中");
  window.speechSynthesis.speak(utterance);
  return true;
}

export function useSpeechState() {
  const [state, setState] = useState({ speaking: currentSpeaking, label: currentLabel });
  useEffect(() => {
    const listener: SpeechListener = (speaking, label) => setState({ speaking, label });
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return state;
}
