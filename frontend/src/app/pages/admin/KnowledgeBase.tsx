import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, Database, Plus, ChevronRight, ChevronDown, 
  FileText, UploadCloud, X, Loader2, CheckCircle2,
  FolderOpen, Trash2, FolderPlus, FilePlus, RefreshCw, Edit2
} from "lucide-react";
import { API_BASE } from "../../config";
import CourseMaterials from "../../components/CourseMaterials";

// --- Types ---
type KbNode = {
  id: string;
  title: string;
  type: "course" | "module" | "node";
  children?: KbNode[];
  dify_dataset_id?: string | null;
};

type ResourceFile = {
  id: string;
  name: string;
  size: string;
  date: string;
  status: "completed" | "processing" | "waiting" | "local" | "error" | "paused";
};

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<KbNode[]>([]);
  const [resources, setResources] = useState<ResourceFile[]>([]);
  
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodeTitle, setSelectedNodeTitle] = useState<string>("请选择节点");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"course" | "node">("course");
  
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal States for Creating Nodes
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<"course" | "module" | "node">("course");
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  
  const [isEditing, setIsEditing] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [editNodeType, setEditNodeType] = useState<"course" | "module" | "node">("course");
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [difyConfigured, setDifyConfigured] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  const [busyResource, setBusyResource] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!difyConfigured) return;
    fetch(`${API_BASE}/api/kb/datasets`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Dify 知识库列表读取失败");
      setDatasets(data.datasets || []);
    }).catch(error => setNotice(error.message));
  }, [difyConfigured]);

  const bindDataset = async (datasetId: string) => {
    if (!selectedCourseId || !datasetId) return;
    try {
      const response = await fetch(`${API_BASE}/api/kb/courses/${selectedCourseId}/bind-dify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset_id: datasetId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "关联失败");
      setNotice("课程已关联 Dify 知识库，可以提交本地资料。"); fetchTree();
    } catch (error) { setNotice(error instanceof Error ? error.message : "关联失败"); }
  };

  const testDify = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE}/api/kb/test-connection`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "连接失败");
      setDifyConfigured(true); setNotice("Dify 连接正常，可以上传资料。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "连接失败"); }
    finally { setIsSyncing(false); }
  };

  const pushDify = async (resourceId: string) => {
    if (!selectedNode) return;
    setBusyResource(resourceId);
    try {
      const response = await fetch(`${API_BASE}/api/kb/resources/${selectedNode}/${resourceId}/push-dify`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "上传未完成");
      setNotice("资料已提交 Dify，解析完成后可以生成学习内容。"); fetchResources(); fetchTree();
    } catch (error) { setNotice(error instanceof Error ? error.message : "上传失败"); }
    finally { setBusyResource(null); }
  };

  const fetchTree = () => {
    fetch(`${API_BASE}/api/kb/tree`)
      .then(res => res.json())
      .then(data => {
        setTree(data.tree || []);
      })
      .catch(err => console.error("Failed to load tree", err));
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/api/kb/sync`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setTree(data.tree || []);
        if (data.status === "not_configured") setNotice("请先配置 Dify 知识库 API 密钥，再同步资料。");
      } else {
        const data = await res.json();
        setNotice(data.detail || "Dify 同步失败");
      }
    } catch (e) {
      console.error(e);
      alert("同步出错");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchTree();
    fetch(`${API_BASE}/api/kb/status`).then(response => response.json()).then(data => setDifyConfigured(data.configured)).catch(() => setNotice("知识库配置状态加载失败"));
  }, []);

  useEffect(() => {
    if (!selectedNode && tree.length) {
      setSelectedNode(tree[0].id); setSelectedNodeTitle(tree[0].title);
      setSelectedCourseId(tree[0].id); setSelectedType("course");
    }
  }, [tree, selectedNode]);

  useEffect(() => {
    if (!selectedNode || selectedType !== "node") return;
    fetchResources();
    const interval = setInterval(() => {
      setResources(prev => {
        const needsPolling = prev.some(r => r.status === "processing" || r.status === "waiting");
        if (needsPolling) fetchResources();
        return prev;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedNode, selectedType]);

  const fetchResources = () => {
    if (!selectedNode) return;
    fetch(`${API_BASE}/api/kb/resources/${selectedNode}`)
      .then(res => res.json())
      .then(data => { setResources(data.resources || []); if (data.warning) setNotice(data.warning); })
      .catch(err => console.error("Failed to load resources", err));
  };

  const handleCreateSubmit = async () => {
    if (!createTitle.trim()) return;
    
    if (isEditing && editNodeId) {
      // Handle Edit (PATCH)
      try {
        const res = await fetch(`${API_BASE}/api/kb/tree/${editNodeType}/${editNodeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: createTitle }),
        });
        if (res.ok) {
          fetchTree();
          setCreateModalOpen(false);
          setCreateTitle("");
          setIsEditing(false);
          setEditNodeId(null);
        } else {
          alert("修改失败");
        }
      } catch (e) {
        console.error(e);
        alert("修改出错");
      }
      return;
    }
    
    // Handle Create (POST)
    let endpoint = "";
    let body = {};
    if (createType === "course") {
      endpoint = "/api/kb/courses";
      body = { title: createTitle };
    } else if (createType === "module") {
      endpoint = "/api/kb/modules";
      body = { course_id: createParentId, title: createTitle };
    } else if (createType === "node") {
      endpoint = "/api/kb/nodes";
      body = { module_id: createParentId, title: createTitle };
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        fetchTree();
        if (createParentId) {
          setExpanded(prev => new Set(prev).add(createParentId));
        }
        setCreateModalOpen(false);
        setCreateTitle("");
      } else {
        alert("创建失败");
      }
    } catch (e) {
      console.error(e);
      alert("创建出错");
    }
  };

  const handleDeleteNode = async (nodeId: string, nodeType: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定要删除该${nodeType === 'course' ? '课程及所有底层 Dify 数据集' : '节点'}吗？此操作不可逆！`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/kb/tree/${nodeType}/${nodeId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedNode === nodeId || selectedCourseId === nodeId) {
          setSelectedNode(null);
          setSelectedCourseId(null);
          setSelectedNodeTitle("请选择节点");
        }
        fetchTree();
      } else {
        alert("删除失败");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteResource = async (documentId: string) => {
    if (!confirm("确定要删除该文档吗？")) return;
    if (!selectedCourseId || !selectedNode) return;

    try {
      const res = await fetch(`${API_BASE}/api/kb/resources/${selectedCourseId}/${selectedNode}/${documentId}`, { method: "DELETE" });
      if (res.ok) {
        fetchResources();
      } else {
        alert("删除失败");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!selectedNode || !selectedCourseId) {
      alert("请先选择一个确定的课程知识节点！");
      return;
    }
    
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("course_id", selectedCourseId);
    formData.append("node_id", selectedNode);
    if (replaceId) formData.append("replace_id", replaceId);

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/kb/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        fetchResources();
        fetchTree();
        setUploadOpen(false);
        setReplaceId(null);
        setNotice(data.provider === "dify" ? "资料已提交 Dify，正在读取真实解析状态。" : "文件已保存本地。配置 Dify 后，点击资料旁的“上传到 Dify”。");
      } else {
        const err = await res.json();
        alert(`上传失败: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert("上传出错，请检查网络连接");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTree = (nodes: KbNode[], level = 0, currentCourseId?: string) => {
    return (
      <ul className="space-y-1">
        {nodes.map(node => {
          const isExpanded = expanded.has(node.id);
          const isSelected = selectedNode === node.id;
          const hasChildren = node.children && node.children.length > 0;
          const cid = node.type === "course" ? node.id : currentCourseId;
          
          return (
            <li key={node.id}>
              <div 
                onClick={() => {
                  if (node.type !== "node") toggleExpand(node.id);
                  if (node.type === "node" || node.type === "course") {
                    setSelectedNode(node.id);
                    setSelectedNodeTitle(node.title);
                    setSelectedType(node.type);
                    if (cid) setSelectedCourseId(cid);
                  }
                }}
                className={`group flex cursor-pointer items-center justify-between rounded-lg py-1.5 pr-2 transition ${
                  isSelected ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-600 hover:bg-slate-100"
                }`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {node.type !== "node" ? (
                      isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 opacity-40" />
                    )}
                  </div>
                  <span className="truncate text-[13px]">{node.title}</span>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition">
                  {node.type !== "node" && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreateType(node.type === "course" ? "module" : "node");
                        setCreateParentId(node.id);
                        setCreateModalOpen(true);
                      }}
                      className="p-1 hover:text-blue-600"
                    >
                      {node.type === "course" ? <FolderPlus className="h-3.5 w-3.5" /> : <FilePlus className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <button 
                    onClick={(e) => handleDeleteNode(node.id, node.type, e)}
                    className="p-1 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                      setEditNodeId(node.id);
                      setEditNodeType(node.type);
                      setCreateTitle(node.title);
                      setCreateModalOpen(true);
                    }}
                    className="p-1 hover:text-green-600"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {isExpanded && node.children && (
                <div className="mt-1">
                  {renderTree(node.children, level + 1, cid)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/")}
            className="flex items-center gap-2 rounded-lg py-1.5 pr-3 text-[13px] text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> 返回星图
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2 font-medium">
            <Database className="h-4 w-4 text-blue-600" />
            <span className="text-[14px]">知识库管理 (Knowledge Base)</span>
          </div>
        </div>
      </header>

      <div className="mx-6 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <span>知识库：Dify · {difyConfigured === null ? "正在检查配置" : difyConfigured ? "密钥已配置，连接可检查" : "尚未配置知识库 API 密钥"}{notice && <span className="ml-2">{notice}</span>}</span>
        <button disabled={isSyncing} onClick={() => void testDify()} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 disabled:opacity-50">检查 Dify 连接</button>
      </div>

      {/* Main Layout */}
      <main className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {/* Left Tree Panel */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <span className="text-[13px] font-medium text-slate-500">课程大纲</span>
            <div className="flex gap-2">
              <button 
                onClick={handleSync}
                disabled={isSyncing}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white transition hover:bg-slate-50 disabled:opacity-50"
                title="同步 Dify 云端数据"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={() => {
                  setIsEditing(false);
                  setCreateTitle("");
                  setCreateType("course");
                  setCreateParentId(null);
                  setCreateModalOpen(true);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white transition hover:bg-slate-50"
                title="新建课程"
              >
                <Plus className="h-3.5 w-3.5 text-slate-600" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {tree.length > 0 ? renderTree(tree) : (
              <div className="flex flex-col items-center justify-center mt-10 text-slate-400">
                <p className="text-[13px]">暂无课程，点击右上角加号创建</p>
              </div>
            )}
          </div>
        </aside>

        {/* Right Resource Panel */}
        <section className="flex flex-1 flex-col bg-slate-50/50">
          <div className="flex items-center justify-between border-b border-slate-200 px-8 py-6 bg-white">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-800">{selectedNodeTitle}</h2>
              <p className="mt-1 text-[13px] text-slate-500">{selectedType === "course" ? "课程资料与 AI 自动构建" : "该知识点关联的学习资料"}</p>
              {selectedCourseId && difyConfigured && <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">Dify 知识库
                <select aria-label="关联 Dify 知识库" value={tree.find(course => course.id === selectedCourseId)?.dify_dataset_id || ""} onChange={event => void bindDataset(event.target.value)} className="max-w-64 rounded-lg border border-slate-200 bg-white p-2">
                  <option value="">上传时为本课程自动创建</option>
                  {datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
                </select>
              </label>}
            </div>
            {selectedType === "node" && <button
              onClick={() => {
                if (!selectedNode) {
                  alert("请先在左侧选择一个知识节点！");
                  return;
                }
                setReplaceId(null); setUploadOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition hover:opacity-90 shadow-sm"
              style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}
            >
              <UploadCloud className="h-4 w-4" /> 上传学习资料
            </button>}
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {selectedType === "course" && selectedCourseId ? (
              <CourseMaterials key={`${selectedCourseId}-${tree.find(course => course.id === selectedCourseId)?.dify_dataset_id || ""}`} courseId={selectedCourseId} title={selectedNodeTitle} onBuilt={fetchTree} />
            ) : !selectedNode ? (
               <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <Database className="mb-4 h-12 w-12 opacity-20" />
                <p className="text-[13px]">请在左侧大纲中选择一个节点</p>
              </div>
            ) : resources.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <FolderOpen className="mb-4 h-12 w-12 opacity-20" />
                <p className="text-[13px]">当前节点暂无学习资料</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {resources.map(file => (
                  <div key={file.id} className="group relative flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-md">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                        <FileText className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <h4 className="text-[14px] font-medium text-slate-800">{file.name}</h4>
                        <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-slate-400">
                          <span>{file.size}</span>
                          <span className="h-1 w-1 rounded-full bg-slate-200" />
                          <span>{file.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pr-2">
                      {file.status === "completed" ? (
                        <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> 已完成
                        </div>
                      ) : file.status === "local" ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">已保存本地 · 待同步 Dify</span>
                      ) : file.status === "error" || file.status === "paused" ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] text-red-600">{file.status === "error" ? "Dify 解析失败" : "Dify 已暂停"}</span>
                      ) : (
                        <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] text-blue-600">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 解析中
                        </div>
                      )}
                      {(file.status === "local" || file.status === "error" || file.status === "paused") && <button disabled={!difyConfigured || busyResource === file.id} onClick={() => void pushDify(file.id)} className="rounded-lg border border-blue-200 px-2 py-1 text-xs text-blue-600 disabled:opacity-40">{busyResource === file.id ? "提交中…" : file.status === "local" ? "上传到 Dify" : "重试解析"}</button>}
                      <button onClick={() => { setReplaceId(file.id); setUploadOpen(true); }} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600">上传新版本</button>
                      <button onClick={() => handleDeleteResource(file.id)} className="ml-2 p-1 text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Upload Modal */}
      <AnimatePresence>
        {uploadOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !uploading && setUploadOpen(false)}
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">{replaceId ? "更新资料版本" : `上传至「${selectedNodeTitle}」`}</h3>
                <button 
                  onClick={() => !uploading && setUploadOpen(false)} 
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload} 
                accept=".pdf,.md,.txt,.doc,.docx"
              />
              <div 
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50/50'}`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mb-3 h-8 w-8 text-blue-500 animate-spin opacity-60" />
                    <p className="text-[13px] font-medium text-slate-700">正在传输到大模型知识库...</p>
                    <p className="mt-1 text-[11px] text-slate-400">系统将自动进行高质量文本清洗与分段</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="mb-3 h-8 w-8 text-blue-500 opacity-60" />
                    <p className="text-[13px] font-medium text-slate-700">点击或拖拽文件到此处</p>
                    <p className="mt-1 text-[11px] text-slate-400">支持 PDF, Markdown, Word, TXT (最大 50MB)</p>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create Node Modal */}
      <AnimatePresence>
        {createModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setCreateModalOpen(false);
                setIsEditing(false);
                setCreateTitle("");
              }}
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">
                  {isEditing ? "修改名称" : `新建${createType === "course" ? "课程" : createType === "module" ? "模块" : "知识节点"}`}
                </h3>
                <button onClick={() => {
                  setCreateModalOpen(false);
                  setIsEditing(false);
                  setCreateTitle("");
                }} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-[13px] font-medium text-slate-700">名称</label>
                <input 
                  autoFocus
                  type="text" 
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateSubmit()}
                  placeholder="请输入名称..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setCreateModalOpen(false);
                    setIsEditing(false);
                    setCreateTitle("");
                  }}
                  className="rounded-xl px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  取消
                </button>
                <button 
                  onClick={handleCreateSubmit}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700 transition"
                >
                  {isEditing ? "保存修改" : "确定创建"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
