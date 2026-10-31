import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

export function MermaidRenderer({ chart }: { chart: string }) {
  const [svgStr, setSvgStr] = useState<string>('');

  useEffect(() => {
    if (chart) {
      const renderId = 'mermaid-chart-' + Math.random().toString(36).substr(2, 9);
      mermaid.render(renderId, chart)
        .then((result) => {
          setSvgStr(result.svg);
        })
        .catch(err => {
          console.error("Mermaid render error:", err);
          setSvgStr(`<div class="text-red-500 text-xs">渲染失败: ${err.message}</div>`);
        });
    }
  }, [chart]);

  return (
    <div className="w-full h-full overflow-hidden relative cursor-grab active:cursor-grabbing">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={4}
        centerOnInit={true}
        wheel={{ step: 0.01 }}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div 
            className="mermaid-container" 
            dangerouslySetInnerHTML={{ __html: svgStr }} 
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
