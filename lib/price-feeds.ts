/*
 * The Chainlink feeds the price card can chart, with each feed's contract per
 * network. The addresses are KeeperHub's own, the contracts its named
 * `chainlink/<pair>-latest-round-data` actions read (references/keeperhub-fork
 * protocols/chainlink.ts:650-740 @ 946eeb5c9). Decimals follow Chainlink's
 * convention, 8 for a USD quote and 18 for an ETH quote; the history route
 * confirms them with the feed's own decimals action.
 */

export type PriceFeed = {
  base: string;
  quote: "USD" | "ETH";
  decimals: number;
  decimalsOpId: string;
  /** chain id → feed contract */
  addresses: Readonly<Record<string, string>>;
};

function feed(slug: string, base: string, quote: "USD" | "ETH", addresses: Record<string, string>): [string, PriceFeed] {
  return [
    `chainlink/${slug}-latest-round-data`,
    { base, quote, decimals: quote === "USD" ? 8 : 18, decimalsOpId: `chainlink/${slug}-decimals`, addresses },
  ];
}

export const PRICE_FEEDS: Readonly<Record<string, PriceFeed>> = Object.fromEntries([
  feed("eth-usd", "ETH", "USD", {
    "1": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "8453": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    "42161": "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
    "10": "0x13e3Ee699D1909E989722E753853AE30b17e08c5",
    "11155111": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  }),
  feed("btc-usd", "BTC", "USD", {
    "1": "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    "8453": "0x03Df23A32C83cA8cD9B1aAC0aF1c72924af7502b",
    "42161": "0x06047dD6f43552831BB51319917DC0C99c29A44c",
    "10": "0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593",
    "11155111": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  }),
  feed("link-usd", "LINK", "USD", {
    "1": "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c",
    "8453": "0x17CAb8FE31E32f08326e5E27412894e49B0f9D65",
    "42161": "0x3EAbF62EB761BD86c71d07AdBb1A9183FeC24064",
    "10": "0xCc232dcFAAE6354cE191Bd574108c1aD03f86450",
  }),
  feed("usdc-usd", "USDC", "USD", {
    "1": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    "8453": "0x1401Fd60F9ba4F718a2fE6149aadf3d1F0dB1b0A",
    "42161": "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
    "10": "0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3",
  }),
  feed("dai-usd", "DAI", "USD", {
    "1": "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
    "8453": "0x591e79239a7d679378eC8c847e5038150364C78F",
    "42161": "0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB",
    "10": "0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6",
  }),
  feed("usdt-usd", "USDT", "USD", {
    "1": "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    "8453": "0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9",
    "42161": "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7",
    "10": "0xECef79E109e997bCA29c1c0897ec9d7b03647F5E",
  }),
  feed("link-eth", "LINK", "ETH", {
    "1": "0xDC530D9457755926550b59e8ECcdaE7624181557",
    "8453": "0xc5E65227fe3385B88468F9A01600017cDC9F3A12",
    "42161": "0xb7c8Fb1dB45007F98A68Da0588e1AA524C317f27",
    "10": "0x464A1515ADc20de946f8d0DEB99cead8CEAE310d",
  }),
  feed("btc-eth", "BTC", "ETH", {
    "1": "0xdeb288F737066589598e9214E782fa5A8eD689e8",
    "42161": "0xc5a90A6d7e4Af242dA238FFe279e9f2BA0c64B2e",
  }),
]);

export function priceFeedFor(opId: string | undefined): PriceFeed | undefined {
  return opId === undefined ? undefined : PRICE_FEEDS[opId];
}

/** The chart's length, the latest round included. */
export const HISTORY_ROUNDS = 12;

// A proxy's round id is (phase << 64) | aggregator round; rounds count down only within a phase.
const PHASE_MASK = (1n << 64n) - 1n;

/** Up to `count` round ids before `latest`, newest first, never crossing into an earlier phase. */
export function previousRoundIds(latest: bigint, count: number): bigint[] {
  const inPhase = latest & PHASE_MASK;
  const ids: bigint[] = [];
  for (let k = 1n; k <= BigInt(count) && inPhase - k >= 1n; k++) {
    ids.push(latest - k);
  }
  return ids;
}

/** Newest-first lookups → the unbroken run back from the newest, oldest first, so a chart never bridges a gap. */
export function unbrokenRun<T>(newestFirst: ReadonlyArray<T | null>): T[] {
  const run: T[] = [];
  for (const point of newestFirst) {
    if (point === null) break;
    run.push(point);
  }
  return run.reverse();
}
