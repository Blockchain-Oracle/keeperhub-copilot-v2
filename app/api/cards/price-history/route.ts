import { ulid } from "ulid";

import { routeToolCall } from "@/lib/execution";
import { HISTORY_ROUNDS, previousRoundIds, priceFeedFor, unbrokenRun, type PriceFeed } from "@/lib/price-feeds";
import { readDecimals, readRound } from "@/lib/read-results";
import { getSession, type AuthenticatedSession } from "@/lib/session";

/*
 * The price card's chart (decision 13): the rounds before the one the card
 * already shows, read once from the feed KeeperHub's named action reads.
 * Every read goes through the one door (routeToolCall), so the gate still
 * validates it; recordRead:false keeps these lookups out of the ledger, since
 * they are the card's own chart data rather than reads the person asked for.
 *
 * Stops at the first round that does not answer (the feed moved to a new
 * aggregator), so the line never bridges a gap. A past round never changes, so
 * rounds are cached for the life of the server.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Point = { roundId: string; answer: string; updatedAt: number };

const CACHE_CAP = 1_000;
const roundCache = new Map<string, Point>();
const decimalsCache = new Map<string, number>();

function remember<V>(cache: Map<string, V>, key: string, value: V) {
  if (cache.size >= CACHE_CAP) cache.clear();
  cache.set(key, value);
}

type Read = (actionType: string, params: Record<string, unknown>) => ReturnType<typeof routeToolCall>;

export async function POST(req: Request): Promise<Response> {
  const requestId = ulid();

  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "price_history_session_error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      { ok: false, error: { code: "server_error", message: "We could not reach KeeperHub just now." } },
      { status: 503 },
    );
  }
  if (session === null) {
    return Response.json(
      { ok: false, error: { code: "unauthorized", message: "Connect KeeperHub to continue." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = parseBody(body);
  if (parsed === null) return badRequest();

  const feed = priceFeedFor(parsed.opId);
  const address = feed?.addresses[parsed.network];
  if (feed === undefined || address === undefined) {
    return Response.json(
      { ok: false, error: { code: "not_found", message: "This feed has no history on this network." } },
      { status: 404 },
    );
  }

  const read: Read = (actionType, params) =>
    routeToolCall({
      session,
      toolName: "execute_protocol_action",
      args: { actionType, params },
      requestId,
      signal: req.signal,
      conversationId: `price-history:${requestId}`,
      toolCallId: ulid(),
      recordRead: false,
    });

  const feedKey = `${parsed.network}:${address.toLowerCase()}`;
  const ids = previousRoundIds(BigInt(parsed.roundId), HISTORY_ROUNDS - 1);
  let decimals: number;
  let found: Array<Point | null>;
  try {
    [decimals, ...found] = await Promise.all([
      decimalsFor(feedKey, feed, parsed.network, read),
      ...ids.map((id) => roundFor(feedKey, address, parsed.network, id, read)),
    ]);
  } catch (error) {
    // routeToolCall returns expected failures as values; anything thrown is unexpected.
    console.error(
      JSON.stringify({
        event: "price_history_failed",
        requestId,
        opId: parsed.opId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      { ok: false, error: { code: "server_error", message: "The history could not be read." } },
      { status: 502 },
    );
  }

  // `found` runs newest to oldest: keep the unbroken run back from the card's own round.
  return Response.json({ ok: true, decimals, points: unbrokenRun(found) });
}

async function decimalsFor(feedKey: string, feed: PriceFeed, network: string, read: Read): Promise<number> {
  const cached = decimalsCache.get(feedKey);
  if (cached !== undefined) return cached;
  const output = await read(feed.decimalsOpId, { network });
  const live = output.ok && output.tool === "execute_protocol_action" && "data" in output ? readDecimals(output.data) : null;
  if (live === null) return feed.decimals;
  remember(decimalsCache, feedKey, live);
  return live;
}

async function roundFor(
  feedKey: string,
  address: string,
  network: string,
  roundId: bigint,
  read: Read,
): Promise<Point | null> {
  const key = `${feedKey}:${roundId}`;
  const cached = roundCache.get(key);
  if (cached !== undefined) return cached;
  const output = await read("chainlink/get-round-data", {
    network,
    contractAddress: address,
    _roundId: roundId.toString(),
  });
  if (!output.ok || output.tool !== "execute_protocol_action" || !("data" in output)) return null;
  const round = readRound(output.data);
  if (round === null || round.roundId !== roundId) return null;
  const point = { roundId: round.roundId.toString(), answer: round.answer.toString(), updatedAt: round.updatedAt };
  remember(roundCache, key, point);
  return point;
}

function parseBody(body: unknown): { opId: string; network: string; roundId: string } | null {
  if (body === null || typeof body !== "object") return null;
  const { opId, network, roundId } = body as Record<string, unknown>;
  if (typeof opId !== "string" || typeof network !== "string" || typeof roundId !== "string") return null;
  if (!/^\d+$/.test(network) || !/^\d{1,30}$/.test(roundId)) return null;
  return { opId, network, roundId };
}

function badRequest(): Response {
  return Response.json(
    { ok: false, error: { code: "bad_request", message: "The history request could not be read." } },
    { status: 400 },
  );
}
