import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, ChevronRight, HelpCircle } from 'lucide-react';

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
}

interface QuizRendererProps {
  questions: QuizQuestion[];
  onLoadMore?: () => Promise<void>;
}

export function QuizRenderer({ questions, onLoadMore }: QuizRendererProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  if (!questions || questions.length === 0) {
    return <div className="text-muted-foreground p-8 text-center">暂无题目数据。</div>;
  }

  const handleSelect = (idx: number, option: string) => {
    if (answers[idx]) return; // locked
    setAnswers({ ...answers, [idx]: option });
  };

  const currentQ = questions[currentIdx];
  const isAnswered = !!answers[currentIdx];
  const selectedOption = answers[currentIdx];
  const isCorrect = selectedOption === currentQ.correct_answer;

  return (
    <div className="w-full h-full max-w-2xl mx-auto flex flex-col pt-8 pb-4">
      {/* Progress & Navigation Matrix */}
      <div className="flex flex-col mb-8 px-4 gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-white/90">智能题库测验</h3>
          <span className="text-sm font-medium text-[#8b7dff] px-3 py-1 bg-[#8b7dff]/10 rounded-full border border-[#8b7dff]/20">
            {currentIdx + 1} / {questions.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {questions.map((q, idx) => {
            const hasAnswered = !!answers[idx];
            const isCorrect = hasAnswered && answers[idx] === q.correct_answer;
            let dotClass = "bg-[#1e2241] border border-[rgba(140,150,220,0.2)] text-muted-foreground hover:bg-[#252a55]";
            if (hasAnswered) {
              dotClass = isCorrect ? "bg-green-500/20 border-green-500/50 text-green-400" : "bg-red-500/20 border-red-500/50 text-red-400";
            }
            const isActive = currentIdx === idx;
            if (isActive) {
              dotClass += " ring-2 ring-[#8b7dff] ring-offset-2 ring-offset-[#0a0c1a]";
            }
            return (
              <button
                key={idx}
                onClick={() => setCurrentIdx(idx)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-medium transition-all ${dotClass}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="flex-1 flex flex-col"
        >
          <div className="bg-[#0a0c1a]/60 backdrop-blur-md border border-[rgba(140,150,220,0.15)] rounded-2xl p-6 shadow-xl mb-6 flex-shrink-0">
            <h4 className="text-[16px] text-[#e8ecff] font-medium leading-relaxed mb-6 flex gap-3">
              <span className="mt-1 text-[#8b7dff] opacity-80"><HelpCircle size={18} /></span>
              {currentQ.question}
            </h4>

            <div className="flex flex-col gap-3">
              {currentQ.options.map((opt, i) => {
                const isSelected = selectedOption === opt;
                const isThisOptionCorrect = currentQ.correct_answer === opt;
                
                let optionStyle = "bg-[#1e2241] border-[rgba(140,150,220,0.2)] text-[#e8ecff] hover:bg-[#252a55] hover:border-[#8b7dff]/40";
                
                if (isAnswered) {
                  if (isThisOptionCorrect) {
                    optionStyle = "bg-green-500/10 border-green-500/50 text-green-400";
                  } else if (isSelected && !isThisOptionCorrect) {
                    optionStyle = "bg-red-500/10 border-red-500/50 text-red-400";
                  } else {
                    optionStyle = "bg-[#1e2241] border-[rgba(140,150,220,0.05)] text-muted-foreground/50 opacity-50";
                  }
                }

                return (
                  <button
                    key={i}
                    disabled={isAnswered}
                    onClick={() => handleSelect(currentIdx, opt)}
                    className={`text-left p-4 rounded-xl border transition-all duration-300 flex items-center justify-between ${optionStyle}`}
                  >
                    <span className="text-[14px] leading-relaxed pr-4">{opt}</span>
                    {isAnswered && isThisOptionCorrect && <CheckCircle2 className="h-5 w-5 flex-shrink-0" />}
                    {isAnswered && isSelected && !isThisOptionCorrect && <XCircle className="h-5 w-5 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Explanation */}
          <AnimatePresence>
            {isAnswered && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: '16px' }}
                className="overflow-hidden mb-6 flex-shrink-0"
              >
                <div className={`p-5 rounded-xl border ${isCorrect ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <h5 className={`font-medium mb-2 text-[14px] flex items-center gap-2 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                    {isCorrect ? '回答正确！' : '回答错误'}
                  </h5>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    {currentQ.explanation}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="mt-auto flex justify-end pb-8 gap-3">
            {currentIdx === questions.length - 1 && onLoadMore ? (
              <button
                onClick={async () => {
                  setIsLoadingMore(true);
                  await onLoadMore();
                  setIsLoadingMore(false);
                  setCurrentIdx(questions.length); // Jump to the first newly added question (which will be at index `questions.length`)
                }}
                disabled={isLoadingMore}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all duration-300
                  ${(isLoadingMore) 
                    ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' 
                    : 'bg-gradient-to-r from-[#8b7dff] to-[#6b5ce0] hover:from-[#7a6ce0] hover:to-[#5a4cd0] text-white shadow-[0_0_20px_rgba(139,125,255,0.4)] border border-[#8b7dff]/50'
                  }`}
              >
                {isLoadingMore ? '正在生成...' : '✨ 生成更多'}
              </button>
            ) : (
              <button
                onClick={() => setCurrentIdx(prev => Math.min(prev + 1, questions.length - 1))}
                disabled={!isAnswered || currentIdx === questions.length - 1}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all duration-300
                  ${(!isAnswered || currentIdx === questions.length - 1) 
                    ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' 
                    : 'bg-[#8b7dff] hover:bg-[#7a6ce0] text-white shadow-[0_0_20px_rgba(139,125,255,0.3)] border border-[#8b7dff]/50'
                  }`}
              >
                下一题 <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
