import { useState, useEffect, useCallback, useRef } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force';

const PROJECT_COLORS = {
  rgcs: '#f78166',
  ragefx: '#d2a8ff',
  clawtext: '#58a6ff',
  moltmud: '#3fb950',
  openclaw: '#e3b341',
  ingestion: '#f0883e',
  infrastructure: '#79c0ff',
  general: '#8b949e',
  default: '#58a6ff',
};

function projectColor(p) {
  return PROJECT_COLORS[p?.toLowerCase()] || PROJECT_COLORS.default;
}

function nodeRadius(memoryCount) {
  return Math.max(14, Math.min(34, 14 + (memoryCount || 0) * 0.6));
}

export default function GraphPanel({ api, onSelectCluster, selectedCluster, onNavigateToWalls }) {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [positions, setPositions] = useState({});
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [clusterDetail, setClusterDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  // Pan & zoom state
  const vtRef = useRef({ x: 0, y: 0, k: 1 });
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, k: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef(null);

  // d3-force simulation ref — persists across renders
  const simRef = useRef(null);
  // node map for d3 (keyed by id)
  const nodeMapRef = useRef({});
  // drag state
  const dragNodeRef = useRef(null);
  const dragMovedRef = useRef(false);
  const shouldAutoFitRef = useRef(true);

  function fitToViewport(padding = 70) {
    const vals = Object.values(nodeMapRef.current || {}).filter(n => Number.isFinite(n.x) && Number.isFinite(n.y));
    if (!vals.length || !dims.width || !dims.height) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of vals) {
      const r = nodeRadius(n.memoryCount);
      minX = Math.min(minX, n.x - r);
      maxX = Math.max(maxX, n.x + r);
      minY = Math.min(minY, n.y - r);
      maxY = Math.max(maxY, n.y + r);
    }

    const graphW = Math.max(1, maxX - minX);
    const graphH = Math.max(1, maxY - minY);
    const availW = Math.max(1, dims.width - padding * 2);
    const availH = Math.max(1, dims.height - padding * 2);

    const k = Math.max(0.35, Math.min(2.8, Math.min(availW / graphW, availH / graphH)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const x = dims.width / 2 - cx * k;
    const y = dims.height / 2 - cy * k;

    vtRef.current = { x, y, k };
    setViewTransform({ x, y, k });
  }

  // Resize observer
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      setDims({ width: e.contentRect.width, height: e.contentRect.height });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch graph data
  useEffect(() => {
    fetch(`${api}/api/graph`)
      .then(r => r.json())
      .then(data => {
        shouldAutoFitRef.current = true;
        setGraphData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [api]);

  // Build / restart d3 simulation when graph data or dims change
  useEffect(() => {
    if (!graphData.nodes.length || !dims.width) return;

    // Kill existing sim
    if (simRef.current) simRef.current.stop();

    const { width, height } = dims;

    // d3-force mutates node objects in place — give each node x/y starting positions
    const d3Nodes = graphData.nodes.map(n => {
      const r = nodeRadius(n.memoryCount);
      const existing = nodeMapRef.current[n.id];
      return {
        ...n,
        r,
        x: existing?.x ?? (width / 2 + (Math.random() - 0.5) * width * 0.5),
        y: existing?.y ?? (height / 2 + (Math.random() - 0.5) * height * 0.5),
      };
    });

    // Build lookup so edges can reference by id
    const nodeById = Object.fromEntries(d3Nodes.map(n => [n.id, n]));
    nodeMapRef.current = nodeById;

    // d3 links need source/target as object references or ids
    const d3Links = graphData.edges.map(e => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    const sim = forceSimulation(d3Nodes)
      .force('charge', forceManyBody()
        .strength(n => -Math.max(600, n.r * 60))  // bigger nodes repel harder
        .distanceMax(600)
        .distanceMin(30)
      )
      .force('link', forceLink(d3Links)
        .id(n => n.id)
        .distance(e => {
          if (e.type === 'negative') return 280;   // wall edges push apart
          if (e.type === 'partial') return 220;
          const w = e.weight || 1;
          return Math.max(80, 180 - w * 15);       // stronger links = closer
        })
        .strength(e => {
          if (e.type === 'negative') return 0.02;  // walls are weak (repulsion handles it)
          return Math.min(0.6, 0.2 + (e.weight || 1) * 0.04);
        })
      )
      .force('collide', forceCollide()
        .radius(n => n.r + 18)   // no overlap + breathing room
        .strength(0.9)
        .iterations(3)
      )
      .force('center', forceCenter(width / 2, height / 2).strength(0.04))
      .force('x', forceX(width / 2).strength(0.02))
      .force('y', forceY(height / 2).strength(0.02))
      .alphaDecay(0.022)         // settle slowly for smoother animation
      .velocityDecay(0.38);      // damping

    // Wall edges: add extra repulsion between negative pairs
    graphData.edges
      .filter(e => e.type === 'negative')
      .forEach(e => {
        sim.force(`wall-${e.id}`, forceManyBody()
          .strength(-800)
        );
      });

    sim.on('tick', () => {
      const pos = {};
      for (const n of d3Nodes) {
        pos[n.id] = { x: n.x, y: n.y };
      }
      setPositions({ ...pos });
      // keep nodeMapRef in sync
      for (const n of d3Nodes) nodeMapRef.current[n.id] = n;
    });

    sim.on('end', () => {
      if (shouldAutoFitRef.current) {
        shouldAutoFitRef.current = false;
        // next frame so final nodeMap updates are applied
        requestAnimationFrame(() => fitToViewport(72));
      }
    });

    // If the graph is already mostly settled, still auto-fit shortly after start
    if (shouldAutoFitRef.current) {
      setTimeout(() => {
        if (shouldAutoFitRef.current) {
          shouldAutoFitRef.current = false;
          fitToViewport(72);
        }
      }, 900);
    }

    simRef.current = sim;

    return () => sim.stop();
  }, [graphData, dims, fitToViewport]);

  // Wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.87 : 1.15;
    const newK = Math.max(0.15, Math.min(6, vtRef.current.k * factor));
    const newX = mx - (mx - vtRef.current.x) * (newK / vtRef.current.k);
    const newY = my - (my - vtRef.current.y) * (newK / vtRef.current.k);
    vtRef.current = { x: newX, y: newY, k: newK };
    setViewTransform({ ...vtRef.current });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Background pan
  const handleSvgMouseDown = useCallback((e) => {
    if (dragNodeRef.current) return;
    isPanningRef.current = true;
    panStartRef.current = { sx: e.clientX - vtRef.current.x, sy: e.clientY - vtRef.current.y };
  }, []);

  // Node drag start — fix node, reheat sim
  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    dragNodeRef.current = nodeId;
    dragMovedRef.current = false;
    const n = nodeMapRef.current[nodeId];
    if (n) { n.fx = n.x; n.fy = n.y; } // fix in place
    if (simRef.current) simRef.current.alphaTarget(0.3).restart();
  }, []);

  // Global mouse move + up
  useEffect(() => {
    const onMove = (e) => {
      if (isPanningRef.current && panStartRef.current) {
        vtRef.current = {
          ...vtRef.current,
          x: e.clientX - panStartRef.current.sx,
          y: e.clientY - panStartRef.current.sy,
        };
        setViewTransform({ ...vtRef.current });
      }
      if (dragNodeRef.current) {
        dragMovedRef.current = true;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const gx = (e.clientX - rect.left - vtRef.current.x) / vtRef.current.k;
        const gy = (e.clientY - rect.top - vtRef.current.y) / vtRef.current.k;
        const n = nodeMapRef.current[dragNodeRef.current];
        if (n) { n.fx = gx; n.fy = gy; }
      }
    };

    const onUp = () => {
      if (dragNodeRef.current) {
        const n = nodeMapRef.current[dragNodeRef.current];
        if (n) { n.fx = null; n.fy = null; } // release — sim takes over again
        if (simRef.current) simRef.current.alphaTarget(0).restart();
        dragNodeRef.current = null;
      }
      isPanningRef.current = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const handleNodeClick = useCallback(async (node) => {
    if (dragMovedRef.current) return;
    onSelectCluster(node);
    try {
      const res = await fetch(`${api}/api/graph/node/${node.id}`);
      setClusterDetail(await res.json());
    } catch {}
  }, [api, onSelectCluster]);

  // Re-fit when layout changes consume/release graph space
  useEffect(() => {
    const vals = Object.values(nodeMapRef.current || {}).filter(n => Number.isFinite(n.x) && Number.isFinite(n.y));
    if (!vals.length || loading) return;
    const t = setTimeout(() => fitToViewport(clusterDetail ? 56 : 72), 120);
    return () => clearTimeout(t);
  }, [clusterDetail, dims.width, dims.height, loading]);

  const handleRelayout = useCallback(() => {
    // Scatter nodes and reheat
    const { width, height } = dims;
    for (const n of Object.values(nodeMapRef.current)) {
      n.x = width / 2 + (Math.random() - 0.5) * width * 0.78;
      n.y = height / 2 + (Math.random() - 0.5) * height * 0.78;
      n.vx = 0; n.vy = 0;
      n.fx = null; n.fy = null;
    }
    shouldAutoFitRef.current = true;
    if (simRef.current) simRef.current.alpha(1).restart();
  }, [dims]);

  const zoomBy = useCallback((factor) => {
    const cx = dims.width / 2, cy = dims.height / 2;
    const newK = Math.max(0.15, Math.min(6, vtRef.current.k * factor));
    vtRef.current = {
      x: cx - (cx - vtRef.current.x) * (newK / vtRef.current.k),
      y: cy - (cy - vtRef.current.y) * (newK / vtRef.current.k),
      k: newK,
    };
    setViewTransform({ ...vtRef.current });
  }, [dims]);

  const edgeColor = (e) => {
    if (e.type === 'negative') return '#f85149';
    if (e.type === 'partial') return '#e3b341';
    const alpha = Math.min(0.7, 0.1 + (e.weight || 1) * 0.07);
    return `rgba(88,166,255,${alpha})`;
  };

  if (loading) return <div style={s.loading}>Loading memory graph…</div>;

  const { nodes, edges } = graphData;
  const { x: px, y: py, k: sk } = viewTransform;

  // d3-force stores positions on nodeMapRef, but we render from `positions` state (updated on tick)
  // For edges, use nodeMapRef directly (always current)

  return (
    <div style={s.root}>
      <div style={s.canvas} ref={containerRef}>
        <svg ref={svgRef} width={dims.width} height={dims.height}
          style={{ ...s.svg, cursor: isPanningRef.current ? 'grabbing' : 'grab' }}
          onMouseDown={handleSvgMouseDown}>
          <g transform={`translate(${px},${py}) scale(${sk})`}>

            {/* Edges — read from nodeMapRef for live positions */}
            {edges.map(e => {
              const src = nodeMapRef.current[typeof e.source === 'object' ? e.source.id : e.source];
              const tgt = nodeMapRef.current[typeof e.target === 'object' ? e.target.id : e.target];
              if (!src || !tgt || src.x == null || tgt.x == null) return null;
              const meaningful = e.type === 'negative' || e.type === 'partial' || (e.weight || 0) > 1;
              const strokeW = (e.type === 'negative' || e.type === 'partial' ? 2 : Math.min(e.weight || 1, 3)) / sk;
              return (
                <g key={e.id || `${e.source}-${e.target}`}>
                  <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke={edgeColor(e)} strokeWidth={strokeW}
                    strokeDasharray={e.type === 'negative' ? `${6/sk} ${3/sk}` : e.type === 'partial' ? `${3/sk} ${3/sk}` : undefined}
                    opacity={meaningful ? 0.9 : 0.18}
                    style={{ pointerEvents: 'stroke', cursor: 'default' }}
                    onMouseEnter={() => setTooltip({
                      x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2,
                      text: e.type === 'negative' ? `🧱 Wall: ${e.reason}`
                        : e.type === 'partial' ? `⚠️ Partial: ${e.partialNote || e.reason}`
                        : `Shared: ${(e.shared || []).slice(0, 4).join(', ')}`,
                    })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {(e.type === 'negative' || e.type === 'partial') && (
                    <text x={(src.x+tgt.x)/2} y={(src.y+tgt.y)/2 - 12/sk}
                      textAnchor="middle" fontSize={13/sk}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {e.type === 'negative' ? '🧱' : '⚠️'}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes — render from positions state (triggers re-render on tick) */}
            {nodes.map(n => {
              const pos = positions[n.id];
              if (!pos) return null;
              const isSel = selectedCluster?.id === n.id;
              const isHov = hovered === n.id;
              const color = projectColor(n.project);
              const r = nodeRadius(n.memoryCount);
              const labelSize = Math.max(9, 11 / sk);

              return (
                <g key={n.id} transform={`translate(${pos.x},${pos.y})`}
                  style={{ cursor: 'grab' }}
                  onMouseDown={e => handleNodeMouseDown(e, n.id)}
                  onClick={() => handleNodeClick(n)}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}>
                  {(isSel || isHov) && (
                    <circle r={r + 8} fill={`${color}18`} stroke={color} strokeWidth={1/sk} />
                  )}
                  <circle r={r}
                    fill={`${color}30`}
                    stroke={isSel ? color : `${color}90`}
                    strokeWidth={isSel ? 2.5/sk : 1.5/sk}
                  />
                  <text textAnchor="middle" dy="0.35em"
                    fontSize={Math.max(9, 11/sk)} fontWeight="700" fill={color}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {n.memoryCount || 0}
                  </text>
                  <text textAnchor="middle" dy={r + 14/sk}
                    fontSize={labelSize}
                    fill={isSel || isHov ? '#e6edf3' : '#8b949e'}
                    fontWeight={isSel ? '700' : '400'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {(n.label || n.id).slice(0, 22)}
                  </text>
                </g>
              );
            })}

            {/* Edge tooltip */}
            {tooltip && (
              <foreignObject x={tooltip.x + 8/sk} y={tooltip.y - 16/sk} width={200/sk} height={64/sk}
                style={{ pointerEvents: 'none' }}>
                <div style={{ background: '#21262d', border: '1px solid #30363d', borderRadius: 6,
                  padding: '0.3rem 0.5rem', color: '#c9d1d9', fontSize: `${0.72/Math.max(0.4,sk)}rem`,
                  lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {tooltip.text}
                </div>
              </foreignObject>
            )}
          </g>
        </svg>

        {/* Controls */}
        <div style={s.controls}>
          <button onClick={handleRelayout} style={s.btn} title="Scatter and re-settle">⟳ Re-layout</button>
          <button onClick={() => fitToViewport(72)} style={s.btn} title="Fit graph to viewport">⤢ Fit</button>
          <div style={s.divider} />
          <button onClick={() => zoomBy(1.3)} style={s.btn}>＋</button>
          <button onClick={() => zoomBy(0.77)} style={s.btn}>－</button>
          <button onClick={() => { vtRef.current={x:0,y:0,k:1}; setViewTransform({x:0,y:0,k:1}); }} style={s.btn} title="Reset view">⊙</button>
        </div>

        <div style={s.zoomBadge}>{Math.round(sk * 100)}%</div>

        <div style={s.legend}>
          <div style={s.li}><span style={{ ...s.dot, background: '#58a6ff' }} />Related</div>
          <div style={s.li}><span style={{ ...s.dot, background: '#f85149' }} />Wall</div>
          <div style={s.li}><span style={{ ...s.dot, background: '#e3b341' }} />Partial</div>
          <div style={{ ...s.li, color: '#6e7681', fontSize: '0.65rem', marginTop: 2 }}>
            Scroll zoom · Drag bg to pan · Drag nodes
          </div>
        </div>
      </div>

      {/* Cluster detail panel */}
      {clusterDetail && (
        <div style={s.detail}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: 4, fontWeight: 600,
              background: `${projectColor(clusterDetail.project)}22`, color: projectColor(clusterDetail.project) }}>
              {clusterDetail.project || 'general'}
            </span>
            <button style={s.closeBtn} onClick={() => { setClusterDetail(null); onSelectCluster(null); }}>✕</button>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e6edf3' }}>{clusterDetail.topic || clusterDetail.id}</div>
          {clusterDetail.keywords?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {clusterDetail.keywords.slice(0, 8).map(k => (
                <span key={k} style={{ fontSize: '0.7rem', background: '#21262d', color: '#8b949e', padding: '0.1rem 0.35rem', borderRadius: 4 }}>{k}</span>
              ))}
            </div>
          )}
          <div style={{ fontSize: '0.78rem', color: '#8b949e' }}>{clusterDetail.memories?.length || 0} memories</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
            {(clusterDetail.memories || []).slice(0, 10).map((m, i) => (
              <div key={i} style={{ background: '#21262d', borderRadius: 6, padding: '0.5rem 0.65rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#c9d1d9', marginBottom: '0.2rem' }}>{m.title || m.date || `Memory ${i+1}`}</div>
                <div style={{ fontSize: '0.74rem', color: '#8b949e', lineHeight: 1.4 }}>{(m.content || '').slice(0, 120)}…</div>
              </div>
            ))}
          </div>
          <button style={s.wallBtn} onClick={onNavigateToWalls}>🧱 Manage Walls</button>
        </div>
      )}
    </div>
  );
}

const s = {
  root: { display: 'flex', height: '100%', overflow: 'hidden' },
  canvas: { flex: 1, position: 'relative', overflow: 'hidden', background: '#0d1117' },
  svg: { display: 'block', userSelect: 'none' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8b949e' },
  controls: {
    position: 'absolute', top: '0.75rem', right: '0.75rem',
    display: 'flex', alignItems: 'center', gap: '0.2rem',
    background: '#161b22dd', border: '1px solid #30363d', borderRadius: 8,
    padding: '0.35rem 0.5rem', backdropFilter: 'blur(8px)',
  },
  btn: { background: 'transparent', border: 'none', color: '#c9d1d9', cursor: 'pointer', fontSize: '0.82rem', padding: '3px 8px', borderRadius: 4 },
  divider: { width: 1, height: 16, background: '#30363d', margin: '0 2px' },
  zoomBadge: {
    position: 'absolute', top: '0.75rem', left: '0.75rem',
    background: '#161b22dd', border: '1px solid #30363d', borderRadius: 6,
    padding: '3px 8px', fontSize: '0.72rem', color: '#8b949e', backdropFilter: 'blur(8px)',
  },
  legend: {
    position: 'absolute', bottom: '1rem', left: '1rem',
    background: '#161b22dd', border: '1px solid #30363d', borderRadius: 8,
    padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
    backdropFilter: 'blur(8px)',
  },
  li: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#c9d1d9' },
  dot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  detail: {
    width: '300px', minWidth: '300px', background: '#161b22',
    borderLeft: '1px solid #30363d', padding: '1rem',
    overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem',
  },
  closeBtn: { background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1rem' },
  wallBtn: {
    marginTop: 'auto', background: '#21262d', border: '1px solid #f8514944',
    color: '#f85149', borderRadius: 6, padding: '0.5rem',
    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
  },
};
