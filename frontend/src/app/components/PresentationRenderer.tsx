import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, Loader2, Maximize2, Minimize2, Mic } from 'lucide-react';
import { API_BASE } from "../config";
import { speakWithBrowserTTS, stopAllSpeech, setGlobalSpeechState } from "../speech";

export interface Slide {
  title: string;
  points: string[];
  speaker_script: string;
}

export interface PresentationData {
  slides: Slide[];
}

interface PresentationRendererProps {
  data: PresentationData;
}

export function PresentationRenderer({ data }: PresentationRendererProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [useBrowserTts, setUseBrowserTts] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const slides = data.slides || [];
  const currentSlide = slides[currentSlideIndex];

  const apiBaseUrl = API_BASE;

  // Fetch TTS audio when slide changes, with automatic browser speechSynthesis fallback
  useEffect(() => {
    if (!currentSlide) return;
    
    let isMounted = true;
    const fetchAudio = async () => {
      setLoadingAudio(true);
      stopAllSpeech();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioUrl(null);
      setUseBrowserTts(false);
      setIsPlaying(false);
      
      try {
        const response = await fetch(`${apiBaseUrl}/api/tts/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: currentSlide.speaker_script })
        });
        
        if (!response.ok) throw new Error('Cloud TTS unavailable, using Web Speech API');
        
        const blob = await response.blob();
        if (isMounted) {
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          if (currentSlideIndex > 0) {
            setIsPlaying(true);
          }
        }
      } catch {
        if (isMounted) {
          setUseBrowserTts(true);
          if (currentSlideIndex > 0) {
            setIsPlaying(true);
          }
        }
      } finally {
        if (isMounted) setLoadingAudio(false);
      }
    };
    
    fetchAudio();
    
    return () => {
      isMounted = false;
      stopAllSpeech();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlideIndex]);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      if (isPlaying) {
        setGlobalSpeechState(true, "AI 讲解朗读中");
        audioRef.current.play().catch(e => {
          console.error("Playback failed:", e);
          setIsPlaying(false);
          setGlobalSpeechState(false);
        });
      } else {
        audioRef.current.pause();
        setGlobalSpeechState(false);
      }
    } else if (useBrowserTts && currentSlide) {
      if (isPlaying) {
        speakWithBrowserTTS(currentSlide.speaker_script, {
          label: "AI 讲解朗读中",
          onEnd: () => handleAudioEnded(),
          onError: () => setIsPlaying(false),
        });
      } else {
        stopAllSpeech();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, audioUrl, useBrowserTts]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const nextSlide = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setGlobalSpeechState(false);
    // Auto-advance to next slide if possible
    if (currentSlideIndex < slides.length - 1) {
      setTimeout(() => {
        setCurrentSlideIndex(prev => prev + 1);
        setIsPlaying(true);
      }, 1000);
    }
  };

  if (!currentSlide) return null;

  return (
    <>
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md animate-in fade-in" 
          onClick={() => setIsFullscreen(false)} 
        />
      )}
      
      <div className={isFullscreen
        ? "fixed inset-4 md:inset-8 z-[101] flex flex-col p-6 gap-6 bg-[#070815] rounded-2xl border border-[rgba(140,150,220,0.3)] shadow-2xl transition-all duration-300"
        : "w-full h-full flex flex-col pt-4 pb-2 px-2 gap-4 transition-all duration-300"
      }>
        
        {/* Header */}
        <div className="flex items-center justify-between px-2 flex-shrink-0">
          <h3 className="text-lg font-medium text-white/90 flex items-center gap-2">
            <Mic className="text-[#8b7dff] h-5 w-5" />
            AI 智能讲解
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted-foreground font-mono">
              {currentSlideIndex + 1} / {slides.length}
            </span>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-muted-foreground hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex gap-4 min-h-0 relative">
          
          {/* PPT Display (Left/Center) */}
          <div className="flex flex-col bg-[#0a0c1a] rounded-2xl border border-[rgba(140,150,220,0.15)] shadow-inner overflow-hidden w-2/3">
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentSlideIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex flex-col p-8 md:p-12 justify-center"
              >
                <h2 className="text-2xl md:text-3xl font-semibold text-[#e8ecff] mb-8 leading-tight">
                  {currentSlide.title}
                </h2>
                <ul className="space-y-6">
                  {currentSlide.points.map((point, idx) => (
                    <motion.li 
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + idx * 0.1 }}
                      className="flex items-start gap-4"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#8b7dff] mt-2.5 flex-shrink-0 shadow-[0_0_10px_rgba(139,125,255,0.5)]" />
                      <span className="text-[16px] md:text-[18px] text-muted-foreground leading-relaxed">
                        {point}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Script & Audio Controls (Right/Bottom) */}
          <div className={`flex flex-col gap-4 ${isFullscreen ? 'w-1/3' : 'w-1/3'}`}>
            <div className="flex-1 bg-[#0a0c1a]/60 backdrop-blur border border-[rgba(140,150,220,0.15)] rounded-2xl p-5 overflow-y-auto shadow-lg flex flex-col">
              <h4 className="text-[14px] text-[#e8ecff] font-medium mb-3 flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-[#8b7dff]" /> 讲稿
              </h4>
              <div className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-serif">
                {currentSlide.speaker_script}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="h-16 flex-shrink-0 bg-[#0a0c1a]/80 backdrop-blur border border-[rgba(140,150,220,0.2)] rounded-2xl flex items-center justify-between px-6 shadow-lg">
          <div className="flex items-center gap-4">
            <button 
              onClick={prevSlide} 
              disabled={currentSlideIndex === 0}
              className="p-2 text-muted-foreground hover:text-white disabled:opacity-30 transition-all rounded-full hover:bg-white/5"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button 
              onClick={togglePlay}
              disabled={loadingAudio || (!audioUrl && !useBrowserTts)}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all shadow-lg ${
                loadingAudio || (!audioUrl && !useBrowserTts)
                  ? 'bg-white/5 text-white/20' 
                  : 'bg-[#8b7dff] hover:bg-[#7a6ce0] text-white shadow-[0_0_15px_rgba(139,125,255,0.3)]'
              }`}
            >
              {loadingAudio ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5 ml-0.5" />
              ) : (
                <Play className="h-5 w-5 ml-1" />
              )}
            </button>
            <button 
              onClick={nextSlide} 
              disabled={currentSlideIndex === slides.length - 1}
              className="p-2 text-muted-foreground hover:text-white disabled:opacity-30 transition-all rounded-full hover:bg-white/5"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
          
          <div className="flex items-center gap-3">
             {loadingAudio && (
               <span className="text-[12px] text-muted-foreground animate-pulse">正在生成语音...</span>
             )}
             {(audioUrl || useBrowserTts) && !loadingAudio && (
               <span className="text-[12px] text-[#8b7dff]">
                 {isPlaying ? "正在朗读讲稿..." : "语音已准备就绪"}
               </span>
             )}
          </div>
        </div>
        
        {/* Hidden audio element */}
        {audioUrl && (
          <audio 
            ref={audioRef} 
            src={audioUrl} 
            onEnded={handleAudioEnded}
            className="hidden" 
          />
        )}
      </div>
    </>
  );
}
