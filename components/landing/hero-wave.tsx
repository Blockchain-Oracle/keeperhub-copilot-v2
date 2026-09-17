"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { useIsMobile } from "@/hooks/use-mobile";

const COLS = 16;
const ROWS = 6;
const COUNT = COLS * ROWS;
const SPACING_X = 0.46;
const SPACING_Z = 0.46;
const BAR_W = 0.18;

/* Approximations of the OKLCH brand colors for THREE.Color */
const VIOLET = new THREE.Color("#8b5cf6"); // ≈ oklch(0.66 0.22 288)
const CYAN = new THREE.Color("#7fdff2"); //   ≈ oklch(0.78 0.13 220)

/** Build a box geometry with per-vertex color gradient bottom (violet) → top (cyan). */
function makeBarGeometry(): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(BAR_W, 1, BAR_W);
  const pos = geo.attributes.position.array as Float32Array;
  const colors = new Float32Array((pos.length / 3) * 3);
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1]; // -0.5 or +0.5
    const t = y + 0.5; // 0 (bottom) → 1 (top)
    const c = VIOLET.clone().lerp(CYAN, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function Bars() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => makeBarGeometry(), []);

  useFrame(({ clock, pointer }) => {
    const m = meshRef.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const cursorXWorld = pointer.x * (COLS / 2) * SPACING_X;
    const cursorYWorld = pointer.y * (ROWS / 2) * SPACING_Z * 0.4; // dampen Y reactivity
    void cursorYWorld;

    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c - (COLS - 1) / 2) * SPACING_X;
        const z = (r - (ROWS - 1) / 2) * SPACING_Z;

        // Base sine drift — different phase per row/col
        const phase = c * 0.42 + r * 0.27;
        let amp = 0.55 + 0.45 * Math.sin(t * 1.35 + phase);

        // Cursor reactivity — bars within 1.8 world units of cursor X amplify up to 1.45×
        const dx = Math.abs(x - cursorXWorld);
        if (dx < 1.8) {
          amp *= 1 + (1 - dx / 1.8) * 0.45;
        }

        // Final amplitude (visible height)
        amp = Math.max(0.08, Math.min(amp, 2.4));

        tmp.position.set(x, amp / 2 - 0.6, z); // pivot at base
        tmp.scale.set(1, amp, 1);
        tmp.updateMatrix();
        m.setMatrixAt(idx, tmp.matrix);
        idx++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geo, undefined, COUNT]}>
      <meshBasicMaterial vertexColors transparent opacity={0.92} toneMapped={false} />
    </instancedMesh>
  );
}

function MobileFallback() {
  // Static SVG of 16 stacked rects with a CSS idle sine drift, gradient fill.
  const cols = 18;
  return (
    <svg
      viewBox="0 0 360 160"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="hw-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#7fdff2" />
        </linearGradient>
      </defs>
      {Array.from({ length: cols }).map((_, i) => {
        const x = (i + 0.5) * (360 / cols);
        const delay = (i / cols) * 1.6;
        const baseH = 30 + (i % 4) * 8;
        return (
          <rect
            key={i}
            x={x - 3}
            width={6}
            y={160 - baseH}
            height={baseH}
            rx={2}
            fill="url(#hw-grad)"
            opacity={0.85}
            style={{
              transformOrigin: `${x}px 160px`,
              animation: `hw-sine 5.4s ease-in-out ${delay}s infinite`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes hw-sine {
          0%, 100% { transform: scaleY(1); }
          50%      { transform: scaleY(1.55); }
        }
      `}</style>
    </svg>
  );
}

/**
 * HeroWave — the instrument-panel signature: instanced violet→cyan bars on a
 * tilted plane, cursor-reactive, bloomed. Dynamic-imported by hero.tsx with
 * `ssr:false` so it never touches the server bundle.
 */
export default function HeroWave() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <MobileFallback />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Canvas
        camera={{ position: [0, 1.7, 5.4], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <group rotation={[-0.32, 0, 0]} position={[0, 0.2, 0]}>
          <Bars />
        </group>
        <EffectComposer multisampling={2}>
          <Bloom intensity={0.45} luminanceThreshold={0.45} luminanceSmoothing={0.4} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
