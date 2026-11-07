import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, Network, ListChecks, Video, Code2, X, Download, FileType2, MessageSquareText, Loader2, Sparkles, BrainCircuit, Maximize, Minimize, Mic } from "lucide-react";
import { useStudyStore } from "../store";
import { MermaidRenderer } from "./MermaidRenderer";
import { QuizRenderer } from "./QuizRenderer";
import { PracticeRenderer } from "./PracticeRenderer";
import { PresentationRenderer, PresentationData } from "./PresentationRenderer";
import { API_BASE } from "../config";

type TabKey = 'doc' | 'map' | 'quiz' | 'code' | 'explain';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'doc', label: '讲义', icon: FileText },
  { key: 'map', label: '导图', icon: Network },
  { key: 'quiz', label: '题库', icon: ListChecks },
  { key: 'code', label: '实践练习', icon: BrainCircuit },
  { key: 'explain', label: '讲解', icon: Mic },
];

export function ResourceCards({ nodeId, onClose, initialTab = 'doc' }: { nodeId: string; onClose: () => void; initialTab?: TabKey }) {
  const { constellation } = useStudyStore();
  const node = constellation.find((n) => n.id === nodeId) || { id: nodeId, title: '未知星球', chapter: '' };
  
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [mapChart, setMapChart] = useState<string>('');
  const [loadingMap, setLoadingMap] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [presData, setPresData] = useState<PresentationData | null>(null);
  const [loadingPres, setLoadingPres] = useState(false);
  const [presError, setPresError] = useState<string | null>(null);

  const apiBaseUrl = API_BASE;

  // Fetch docs when node changes
  useEffect(() => {
    const fetchDocs = async () => {
      setLoadingDocs(true);
      try {
        const res = await fetch(`${apiBaseUrl}/api/kb/resources/${nodeId}`);
        const data = await res.json();
        if (data && data.resources) {
          setDocs(data.resources);
          if (data.resources.length > 0) setSelectedDoc(data.resources[0]);
        }
      } catch (e) {
        console.error("Failed to fetch node resources:", e);
      } finally {
        setLoadingDocs(false);
      }
    };
    fetchDocs();
  }, [nodeId]);

  useEffect(() => {
    if (activeTab !== 'map') return;
    const fetchMap = async () => {
      setLoadingMap(true);
      setMapError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/api/kb/mermaid/${nodeId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Dify 资料生成未完成");
        if (data && data.error === "no_resources") {
          setMapError("no_resources");
        } else if (data && data.error) {
          setMapError(data.error);
        } else if (data && data.mermaid_schema) {
          setMapChart(data.mermaid_schema);
        }
      } catch (e) {
        console.error("Failed to fetch node mermaid chart:", e);
        setMapError(e instanceof Error ? e.message : "Dify 资料生成未完成");
      } finally {
        setLoadingMap(false);
      }
    };
    fetchMap();
  }, [nodeId, apiBaseUrl, activeTab]);

  useEffect(() => {
    setPresData(null);
    setPresError(null);
  }, [nodeId]);

  useEffect(() => {
    if (activeTab !== 'explain') return;
    if (presData) return;
    if (presError) return;

    const fetchPres = async () => {
      setLoadingPres(true);
      setPresError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/api/kb/presentation/${nodeId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Dify 资料生成未完成");
        if (data && data.error === "no_resources") {
          setPresError("no_resources");
        } else if (data && data.error) {
          setPresError(data.error);
        } else if (data && data.presentation) {
          setPresData(data.presentation);
        }
      } catch (e) {
        console.error("Failed to fetch presentation:", e);
        setPresError(e instanceof Error ? e.message : "Dify 资料生成未完成");
      } finally {
        setLoadingPres(false);
      }
    };
    fetchPres();
  }, [nodeId, activeTab, apiBaseUrl, presData, presError]);

  return (
    <motion.div
      className="pointer-events-auto absolute bottom-4 left-1/2 z-30 w-[min(1000px,95vw)] h-[75vh] -translate-x-1/2 flex flex-col"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
    >
      <div className="relative flex-1 flex flex-col rounded-2xl border border-[rgba(139,125,255,0.3)] bg-[#070815]/90 shadow-2xl backdrop-blur-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(140,150,220,0.18)] bg-[#0a0c1a]/80 px-5 py-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{node.chapter || 'Knowledge Node'}</div>
            <h3 className="text-[18px] font-medium text-[#e8ecff] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#b084f5]" />
              {node.title} · 融合资源卡
            </h3>
          </div>
          <button aria-label="关闭学习资料" onClick={onClose} className="rounded-lg p-1.5 text-[#9aa0c8] transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-4 pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const on = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 transition"
                style={{
                  borderColor: on ? "var(--star-glow)" : "rgba(140,150,220,0.18)",
                  background: on ? "rgba(139,125,255,0.14)" : "rgba(10,12,26,0.5)",
                }}
              >
                <Icon className="h-4 w-4" style={{ color: on ? "var(--star-glow)" : "#9aa0c8" }} />
                <span className="text-[12px] font-medium tracking-wide" style={{ color: on ? "#e8ecff" : "#9aa0c8" }}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'doc' && (
              <motion.div key="doc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex p-5 gap-5">
                {/* Doc List & Viewer */}
                <div className="w-full flex flex-col gap-3 rounded-xl border border-[rgba(140,150,220,0.18)] bg-[#0a0c1a]/50 p-4">
                  <h4 className="text-[14px] font-medium flex items-center gap-2 text-[#e8ecff]">
                    <FileType2 className="h-4 w-4 text-[#8b7dff]" /> 节点讲义资料
                  </h4>
                  {loadingDocs ? (
                    <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#8b7dff]" /></div>
                  ) : docs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-[13px] text-muted-foreground">暂无资料，请前往后台“知识库管理”上传。</p>
                    </div>
                  ) : (
                    <div className="flex gap-3 h-full overflow-hidden">
                      <div className="w-1/4 flex flex-col gap-2 overflow-y-auto pr-2">
                        {docs.map(doc => (
                          <button
                            key={doc.id}
                            onClick={() => setSelectedDoc(doc)}
                            className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition ${selectedDoc?.id === doc.id ? 'bg-[#8b7dff]/20 border-[#8b7dff]/50' : 'bg-transparent border-[rgba(140,150,220,0.18)] hover:bg-white/5'}`}
                          >
                            <span className="text-[12px] font-medium text-[#e8ecff] truncate w-full">{doc.name}</span>
                            <span className="text-[10px] text-muted-foreground flex justify-between w-full"><span>{doc.size}</span><span>{doc.date}</span></span>
                          </button>
                        ))}
                      </div>
                      <div className={isFullscreen ? "fixed inset-0 z-[100] bg-[#070815] flex flex-col items-center justify-center text-center overflow-hidden" : "w-3/4 rounded-lg bg-[#070815] border border-[rgba(140,150,220,0.18)] flex flex-col items-center justify-center text-center relative overflow-hidden"}>
                        {selectedDoc ? (
                          <iframe 
                            src={`${apiBaseUrl}/api/kb/download/${selectedDoc.id}`} 
                            className="w-full h-full bg-white"
                            title={selectedDoc.name}
                          />
                        ) : (
                          <>
                            <FileType2 className="h-12 w-12 text-[#8b7dff]/50 mb-3" />
                            <p className="text-[13px] text-muted-foreground">请在左侧选择一份讲义</p>
                          </>
                        )}
                        <div className="absolute bottom-4 right-4 flex items-center gap-3 z-10">
                          {selectedDoc && (
                            <button
                              onClick={() => setIsFullscreen(!isFullscreen)}
                              className="flex items-center justify-center w-8 h-8 bg-[#0a0c1a]/80 backdrop-blur border border-[#8b7dff]/30 text-[#8b7dff] rounded-lg transition hover:bg-[#8b7dff]/20 shadow-lg"
                              title={isFullscreen ? "退出全屏" : "全屏观看"}
                            >
                              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                            </button>
                          )}
                          <a 
                            href={selectedDoc ? `${apiBaseUrl}/api/kb/download/${selectedDoc.id}` : '#'} 
                            download
                            className="flex items-center gap-2 px-3 h-8 bg-[#0a0c1a]/80 backdrop-blur border border-[#8b7dff]/30 text-[#8b7dff] rounded-lg text-[11px] transition hover:bg-[#8b7dff]/20 shadow-lg"
                          >
                            <Download className="h-3 w-3" /> 下载源文件
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'map' && (
              <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex p-5">
                <div className={isMapFullscreen ? "fixed inset-0 z-[100] bg-[#070815] flex flex-col items-center justify-center text-center overflow-hidden" : "w-full h-full rounded-xl border border-[rgba(140,150,220,0.18)] bg-[#0a0c1a]/50 p-6 flex flex-col items-center justify-center relative overflow-hidden"}>
                  {loadingMap ? (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8b7dff]" /> AI 正在研读您的讲义并提炼核心微观结构，请耐心等待 10~20 秒...
                    </div>
                  ) : mapError === "no_resources" ? (
                    <div className="flex flex-col items-center justify-center text-center max-w-md px-6">
                      <Network className="h-10 w-10 text-muted-foreground/30 mb-3 mx-auto" />
                      <p className="text-[13px] text-muted-foreground">暂无导图数据。请先在左侧「讲义」页面上传相关的节点学习资料，AI 才可提炼。</p>
                    </div>
                  ) : mapError ? (
                    <div className="flex flex-col items-center justify-center text-center max-w-md px-6">
                      <Network className="h-10 w-10 text-red-500/50 mb-3 mx-auto" />
                      <p className="text-[13px] text-red-400">{mapError}</p>
                    </div>
                  ) : mapChart ? (
                    <MermaidRenderer chart={mapChart} />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center">
                      <Network className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-[13px] text-muted-foreground">暂无导图数据。</p>
                    </div>
                  )}

                  <div className="absolute bottom-4 right-4 flex items-center gap-3 z-10">
                    <button
                      onClick={() => setIsMapFullscreen(!isMapFullscreen)}
                      className="flex items-center justify-center w-8 h-8 bg-[#0a0c1a]/80 backdrop-blur border border-[#8b7dff]/30 text-[#8b7dff] rounded-lg transition hover:bg-[#8b7dff]/20 shadow-lg"
                      title={isMapFullscreen ? "退出全屏" : "全屏观看"}
                    >
                      {isMapFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'quiz' && (
              <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex p-5">
                <div className="w-full h-full rounded-xl border border-[rgba(140,150,220,0.18)] bg-[#0a0c1a]/50 p-6 flex flex-col relative overflow-hidden overflow-y-auto">
                  <QuizRenderer nodeId={nodeId} />
                </div>
              </motion.div>
            )}

            {activeTab === 'code' && (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex p-5">
                <div className="w-full h-full rounded-xl border border-[rgba(140,150,220,0.18)] bg-[#0a0c1a]/50 p-4 overflow-hidden">
                  <PracticeRenderer nodeId={nodeId} />
                </div>
              </motion.div>
            )}

            {activeTab === 'explain' && (
              <motion.div key="explain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex p-5">
                <div className="w-full h-full rounded-xl border border-[rgba(140,150,220,0.18)] bg-[#0a0c1a]/50 p-4 flex flex-col relative overflow-hidden">
                  {loadingPres ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 text-[13px] text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-[#8b7dff]" />
                      AI 讲师正在为您备课，生成 PPT 和演讲稿，请耐心等待 10~20 秒...
                    </div>
                  ) : presError === "no_resources" ? (
                    <div className="flex h-full flex-col items-center justify-center text-center max-w-md mx-auto px-6">
                      <Mic className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-[13px] text-muted-foreground">暂无讲解数据。请先在左侧「讲义」页面上传相关资料，AI 才可为您讲解。</p>
                    </div>
                  ) : presError ? (
                    <div className="flex h-full flex-col items-center justify-center text-center max-w-md mx-auto px-6">
                      <Mic className="h-10 w-10 text-red-500/50 mb-3" />
                      <p className="text-[13px] text-red-400">讲解数据生成失败或服务不可用，请稍后重试。</p>
                    </div>
                  ) : presData ? (
                    <PresentationRenderer data={presData} />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <Mic className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-[13px] text-muted-foreground">暂无讲解任务。</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
