import { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useConsoleStore } from '../../store/consoleStore';

// Custom Node to show Agent Status
function AgentNode({ data }: { data: any }) {
  const isWorking = data.status === 'working';
  return (
    <div className={`rounded-xl border ${isWorking ? 'border-primary shadow-[0_0_15px_var(--primary)]' : 'border-border'} bg-[#131520] text-white p-4 transition-all duration-300 relative`}>
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-none" />
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-[#222436]">
          <data.icon className="h-5 w-5" style={{ color: data.color }} />
          {isWorking && (
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: data.color }}></span>
              <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: data.color }}></span>
            </span>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold">{data.label}</div>
          <div className="text-xs uppercase text-white/50">{data.status || 'idle'}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#333] !border-none" />
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
};

export function ConsoleGraph() {
  const agentStatuses = useConsoleStore((state) => state.agentStatuses);

  const initialNodes = [
    {
      id: 'api',
      type: 'agent',
      position: { x: 250, y: 50 },
      data: { label: 'API Gateway', status: 'idle', color: '#888', icon: () => <div className="text-xl">🌐</div> },
    },
    {
      id: 'writer',
      type: 'agent',
      position: { x: 100, y: 200 },
      data: { label: 'Writer Agent', status: agentStatuses['Writer'] || 'idle', color: 'var(--primary)', icon: () => <div className="text-xl">✍️</div> },
    },
    {
      id: 'presenter',
      type: 'agent',
      position: { x: 400, y: 200 },
      data: { label: 'Presenter Agent', status: agentStatuses['Presenter'] || 'idle', color: 'var(--destructive)', icon: () => <div className="text-xl">🎤</div> },
    },
    {
      id: 'coder',
      type: 'agent',
      position: { x: 250, y: 350 },
      data: { label: 'Coder Agent', status: agentStatuses['Coder'] || 'idle', color: '#7ce0b0', icon: () => <div className="text-xl">💻</div> },
    }
  ];

  const initialEdges = [
    { id: 'e-api-writer', source: 'api', target: 'writer', animated: agentStatuses['Writer'] === 'working', style: { stroke: 'var(--primary)' } },
    { id: 'e-api-presenter', source: 'api', target: 'presenter', animated: agentStatuses['Presenter'] === 'working', style: { stroke: 'var(--destructive)' } },
    { id: 'e-writer-coder', source: 'writer', target: 'coder', animated: agentStatuses['Coder'] === 'working', style: { stroke: '#7ce0b0' } },
    { id: 'e-presenter-coder', source: 'presenter', target: 'coder', animated: agentStatuses['Coder'] === 'working', style: { stroke: '#7ce0b0' } }
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync with store
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === 'writer') n.data = { ...n.data, status: agentStatuses['Writer'] || 'idle' };
        if (n.id === 'presenter') n.data = { ...n.data, status: agentStatuses['Presenter'] || 'idle' };
        if (n.id === 'coder') n.data = { ...n.data, status: agentStatuses['Coder'] || 'idle' };
        return n;
      })
    );
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id === 'e-api-writer') e.animated = agentStatuses['Writer'] === 'working';
        if (e.id === 'e-api-presenter') e.animated = agentStatuses['Presenter'] === 'working';
        if (e.id === 'e-writer-coder' || e.id === 'e-presenter-coder') e.animated = agentStatuses['Coder'] === 'working';
        return e;
      })
    );
  }, [agentStatuses, setNodes, setEdges]);

  return (
    <div className="h-full w-full rounded-2xl border border-border bg-card overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
