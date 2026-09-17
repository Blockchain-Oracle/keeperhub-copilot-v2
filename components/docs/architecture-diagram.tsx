/*
 * How a sentence becomes a transaction.
 *
 * Drawn from the code it describes, not from a whiteboard:
 *   lib/registry        the 442 tools, generated from KeeperHub's own registry
 *   lib/execution/index the one door every tool call goes through
 *   lib/mcp/index       the client that talks to KeeperHub, and nothing else
 *   lib/ledger          the record that outlives the conversation
 *
 * If one of those changes shape, this changes with it.
 *
 * Laid out by hand in a fixed viewBox and scaled by the browser, so it stays
 * legible on a phone; every colour is a token, so it follows the theme.
 */

interface Node {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  tone?: "waiting" | "gate" | "outside";
}

interface Edge {
  d: string;
  label?: string;
  labelAt?: [number, number];
  tone?: "waiting" | "quiet";
  dashed?: boolean;
}

const W = 1000;
const H = 470;

const NODES: Node[] = [
  { id: "you", x: 20, y: 40, w: 150, h: 62, title: "You", sub: "in the browser" },
  { id: "chat", x: 210, y: 40, w: 190, h: 62, title: "Chat and the model", sub: "picks the action" },
  { id: "door", x: 440, y: 40, w: 190, h: 62, title: "The one door", sub: "checks every call", tone: "gate" },
  { id: "kh", x: 670, y: 40, w: 190, h: 62, title: "KeeperHub", sub: "runs the action", tone: "outside" },

  { id: "card", x: 440, y: 176, w: 190, h: 66, title: "The card", sub: "waits for your click", tone: "waiting" },
  { id: "wallet", x: 670, y: 176, w: 190, h: 62, title: "Your org wallet", sub: "signs it", tone: "outside" },

  { id: "ledger", x: 210, y: 320, w: 190, h: 62, title: "The ledger", sub: "keeps the receipt" },
  { id: "chain", x: 670, y: 320, w: 190, h: 62, title: "The chain", sub: "where it lands", tone: "outside" },
];

const EDGES: Edge[] = [
  { d: "M170 71 H210", tone: "quiet" },
  { d: "M400 71 H440", tone: "quiet" },
  {
    d: "M630 71 H670",
    label: "a question goes straight through",
    labelAt: [650, 26],
    tone: "quiet",
  },
  {
    // Labels sit beside their line rather than on it, and clear of each other —
    // two of them used to overlap in the gap between the card and KeeperHub.
    d: "M535 102 V176",
    label: "a write stops here",
    labelAt: [452, 146],
    tone: "waiting",
  },
  {
    // back to you, around the left of the card
    d: "M440 209 H300 Q280 209 280 189 V102",
    label: "you check it",
    labelAt: [216, 146],
    tone: "waiting",
  },
  {
    // and on to KeeperHub once you have clicked
    d: "M630 209 H670",
    label: "you authorize",
    labelAt: [650, 166],
    tone: "waiting",
  },
  { d: "M765 102 V176", tone: "quiet" },
  { d: "M765 238 V320", label: "signed", labelAt: [765, 285], tone: "quiet" },
  {
    // the receipt, read back off the chain and recorded
    d: "M670 351 H430 Q400 351 400 351",
    label: "read back off the chain",
    labelAt: [535, 336],
    tone: "quiet",
    dashed: true,
  },
];

const tone = {
  waiting: "var(--pending)",
  gate: "var(--neon)",
  outside: "var(--telemetry)",
  quiet: "var(--border-strong)",
};

export function ArchitectureDiagram() {
  return (
    <figure className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-card-bezel bg-surface-2/30 p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label="You ask in the browser. The chat picks an action and every call goes through one door. A question goes straight through to KeeperHub. Anything that moves value stops as a card and waits for your click; once you authorize, KeeperHub runs it, your organisation's wallet signs it and it lands on the chain. The receipt is read back off the chain and kept in the ledger."
        >
          <defs>
            <marker id="arch-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10Z" fill="var(--border-strong)" />
            </marker>
            <marker id="arch-head-waiting" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10Z" fill="var(--pending)" />
            </marker>
          </defs>

          {EDGES.map((edge) => {
            const stroke = edge.tone === "waiting" ? tone.waiting : tone.quiet;
            return (
              <g key={edge.d}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.6"
                  strokeDasharray={edge.dashed ? "5 5" : undefined}
                  markerEnd={`url(#${edge.tone === "waiting" ? "arch-head-waiting" : "arch-head"})`}
                />
                {edge.label && edge.labelAt ? (
                  <text
                    x={edge.labelAt[0]}
                    y={edge.labelAt[1]}
                    textAnchor="middle"
                    fill="var(--fg-muted)"
                    fontSize="12.5"
                    fontFamily="ui-monospace, monospace"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {NODES.map((node) => {
            const accent = node.tone ? tone[node.tone] : "var(--border-strong)";
            return (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx="12"
                  fill="var(--card)"
                  stroke={accent}
                  strokeWidth={node.tone ? 1.5 : 1}
                />
                {/* a short accent bar, so a node's role reads before its words do */}
                <rect x={node.x} y={node.y} width="3" height={node.h} rx="1.5" fill={accent} />
                <text
                  x={node.x + 16}
                  y={node.y + 26}
                  fill="var(--foreground)"
                  fontSize="15"
                  fontWeight="500"
                  fontFamily="var(--font-display), sans-serif"
                >
                  {node.title}
                </text>
                <text
                  x={node.x + 16}
                  y={node.y + 45}
                  fill="var(--fg-muted)"
                  fontSize="12.5"
                  fontFamily="ui-monospace, monospace"
                >
                  {node.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.16em]">
        <Key colour="var(--neon)" label="the gate" />
        <Key colour="var(--pending)" label="waits for you" />
        <Key colour="var(--telemetry)" label="outside this app" />
      </figcaption>
    </figure>
  );
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2 rounded-[2px]" style={{ background: colour }} />
      {label}
    </span>
  );
}
