import { memo } from 'react';
import { cssFamily } from '../lib/browser.js';

function qrPath(p) {
  const mod = p.size / (p.n + 2 * p.margin);
  let d = '';
  for (const [c, r, len] of p.rects) {
    const x = p.x + (c + p.margin) * mod, y = p.y + (r + p.margin) * mod;
    d += `M${x.toFixed(2)} ${y.toFixed(2)}h${(len * mod).toFixed(2)}v${mod.toFixed(2)}h${(-len * mod).toFixed(2)}z`;
  }
  return d;
}

export const SceneSVG = memo(function SceneSVG({ scene, width }) {
  return (
    <svg viewBox={`0 0 ${scene.W} ${scene.H}`} width={width} height={(width * scene.H) / scene.W} className="scene" aria-label="Vista del documento">
      <rect x="0" y="0" width={scene.W} height={scene.H} fill="#ffffff" />
      {scene.prims.map((p, i) => {
        if (p.kind === 'image') return <image key={i} href={p.src} x={p.x} y={p.y} width={p.w} height={p.h} opacity={p.opacity} preserveAspectRatio="none" />;
        if (p.kind === 'rect') {
          return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill || 'none'}
            stroke={p.stroke && p.strokeWidth ? p.stroke : 'none'} strokeWidth={p.strokeWidth || 0} opacity={p.opacity} />;
        }
        if (p.kind === 'text') {
          return <text key={i} x={p.x} y={p.y} fontSize={p.size} fontFamily={cssFamily(p.family)} fontWeight={p.bold ? 700 : 400}
            fontStyle={p.italic ? 'italic' : 'normal'} fill={p.color} opacity={p.opacity} style={{ whiteSpace: 'pre' }}>{p.text}</text>;
        }
        if (p.kind === 'qr') {
          return (
            <g key={i} opacity={p.opacity}>
              {p.bg && <rect x={p.x} y={p.y} width={p.size} height={p.size} fill={p.bg} />}
              <path d={qrPath(p)} fill={p.color} shapeRendering="crispEdges" />
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
});
