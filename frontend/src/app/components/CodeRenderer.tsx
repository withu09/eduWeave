import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { motion } from 'motion/react';
import { Play, RotateCcw, CheckCircle2, Code2, Terminal, Loader2, Sparkles, Maximize2, Minimize2 } from 'lucide-react';

export interface CodeTask {
  title: string;
  description: string;
  language: string;
  boilerplate: string;
  solution: string;
}

interface CodeRendererProps {
  task: CodeTask;
}

export function CodeRenderer({ task }: CodeRendererProps) {
  const [code, setCode] = useState(task.boilerplate);
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [isPyodideReady, setIsPyodideReady] = useState(false);
  const [pyodideError, setPyodideError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const pyodideRef = useRef<any>(null);

  useEffect(() => {
    setCode(task.boilerplate);
    setOutput('');
  }, [task]);

  useEffect(() => {
    // Only load if not already loaded
    if (document.getElementById('pyodide-script')) {
       if ((window as any).pyodideInstance) {
          pyodideRef.current = (window as any).pyodideInstance;
          setIsPyodideReady(true);
       }
       return;
    }

    const script = document.createElement('script');
    script.id = 'pyodide-script';
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
    script.async = true;
    script.onload = async () => {
      try {
        const pyodide = await (window as any).loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/',
        });
        
        pyodideRef.current = pyodide;
        (window as any).pyodideInstance = pyodide;
        setIsPyodideReady(true);
      } catch (e: any) {
        setPyodideError(e.message || 'Failed to initialize Python environment');
      }
    };
    script.onerror = () => setPyodideError('Failed to load Pyodide script');
    document.body.appendChild(script);

    return () => {
      // Do not remove script to avoid reloading when unmounting/mounting
    };
  }, []);

  const handleRun = async () => {
    if (!pyodideRef.current) return;
    setIsRunning(true);
    setOutput('执行中...\n');
    try {
      // Redirect stdout
      pyodideRef.current.runPython(`
import sys
import io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
`);
      await pyodideRef.current.runPythonAsync(code);
      
      const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
      const stderr = pyodideRef.current.runPython("sys.stderr.getvalue()");
      
      let finalOutput = stdout;
      if (stderr) finalOutput += '\n[Errors]\n' + stderr;
      
      setOutput(finalOutput || '运行成功 (无输出)');
    } catch (err: any) {
      setOutput(err.toString());
    } finally {
      setIsRunning(false);
    }
  };

  const handleShowSolution = () => {
    setCode(task.solution);
  };

  const handleReset = () => {
    setCode(task.boilerplate);
    setOutput('');
  };

  return (
    <>
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md animate-in fade-in" 
          onClick={() => setIsFullscreen(false)} 
        />
      )}
      <div className={isFullscreen
        ? "fixed inset-4 md:inset-8 z-[101] flex flex-col p-6 gap-4 bg-[#070815] rounded-2xl border border-[rgba(140,150,220,0.3)] shadow-2xl transition-all duration-300"
        : "w-full h-full flex flex-col pt-4 pb-2 px-2 gap-4 transition-all duration-300"
      }>
        <div className="flex items-center justify-between px-2 flex-shrink-0">
          <h3 className="text-lg font-medium text-white/90 flex items-center gap-2">
            <Code2 className="text-[#8b7dff] h-5 w-5" />
            {task.title}
          </h3>
          {!isPyodideReady && !pyodideError && (
            <span className="flex items-center gap-2 text-[12px] text-muted-foreground bg-white/5 px-3 py-1 rounded-full border border-white/5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8b7dff]" /> <span>初始化 Python 沙盒引擎...</span>
            </span>
          )}
        </div>

      <div className="flex-1 flex gap-4 min-h-0 relative">
        {/* Left Panel: Description & Terminal */}
        <div className="w-1/3 flex flex-col gap-4">
          {/* Description */}
          <div className="flex-1 bg-[#0a0c1a]/60 backdrop-blur border border-[rgba(140,150,220,0.15)] rounded-2xl p-5 overflow-y-auto shadow-lg">
            <h4 className="text-[14px] text-[#e8ecff] font-medium mb-3">任务说明</h4>
            <div className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {task.description}
            </div>
            
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={handleShowSolution}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#8b7dff]/10 hover:bg-[#8b7dff]/20 border border-[#8b7dff]/30 text-[#8b7dff] rounded-xl text-[13px] transition-all"
              >
                <Sparkles className="h-4 w-4" /> 查看参考解答
              </button>
            </div>
          </div>

          {/* Terminal */}
          <div className="h-48 bg-[#070815] rounded-2xl border border-[rgba(140,150,220,0.2)] p-4 flex flex-col shadow-inner">
            <h4 className="text-[12px] text-muted-foreground font-mono mb-2 flex items-center gap-2">
              <Terminal className="h-3 w-3" /> 控制台输出
            </h4>
            <div className="flex-1 font-mono text-[13px] text-[#a5d6ff] overflow-y-auto whitespace-pre-wrap break-all custom-scrollbar">
              {output ? (
                <span key={`out-${output.length}`}>{output}</span>
              ) : (
                <span key="empty" className="text-muted-foreground/30 select-none">点击运行查看结果...</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Editor */}
        <div className="flex-1 flex flex-col bg-[#070815] rounded-2xl border border-[rgba(140,150,220,0.2)] overflow-hidden shadow-xl">
          <div className="h-12 border-b border-[rgba(140,150,220,0.1)] flex items-center justify-between px-4 bg-[#0a0c1a]/40">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
              </div>
              <span className="text-[12px] text-muted-foreground font-mono ml-2">main.py</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                title="重置代码"
                className="p-1.5 text-muted-foreground hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? "退出放大" : "放大编辑器"}
                className="p-1.5 text-muted-foreground hover:text-white hover:bg-white/10 rounded-lg transition-all mr-1"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={handleRun}
                disabled={!isPyodideReady || isRunning}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                  !isPyodideReady || isRunning
                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                    : 'bg-[#8b7dff] hover:bg-[#7a6ce0] text-white shadow-[0_0_15px_rgba(139,125,255,0.3)]'
                }`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span key="running">执行中</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span key="idle">运行代码</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="flex-1 relative">
            <Editor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineHeight: 24,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                renderLineHighlight: "all",
              }}
              loading={<div className="h-full w-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            />
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
