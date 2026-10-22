import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { animated, useSpring } from "@react-spring/web";
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  GraduationCap,
  Home,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { toDataSuffix } from "@celo/attribution-tags";
import { CoinMark, CoinPicker } from "../components/CoinPicker";
import { Shell } from "../components/Shell";
import { PayQr } from "../components/PayQr";
import { ensureChain } from "../lib/wallet";
import { coinName, getBillReceipt, getDrive, type BillReceipt, type Drive } from "../lib/api";
import { coinFace, coinIcon, COIN_FACES } from "../lib/coins";
import { useLift } from "../lib/springs";
import { driveCode } from "../lib/driveCode";

const EARMARK_ABI = parseAbi(["function contribute(uint256 id, uint256 amount, string memo)"]);
const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

type Stage = "idle" | "approving" | "paying" | "swapping" | "done" | "error";

// "direct" pays in the drive's own coin; any other value is a coin Earmark swaps on Textile FX.
type PayIn = string;
type CorridorQuote = { quote: string; maxPay: string; maxPayHuman: string; payToken: Address; payDecimals: number; pay: string; sendTo: Address; wantLocal: string };
type CorridorStatus = { status: string; swap_tx: string | null; contribute_tx: string | null; refund_tx: string | null; local_amount: string | null; note: string | null; pay_amount: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ripio's on-ramp, prefilled so the person lands straight in Ripio's flow with the coin delivered to
// their own wallet; they then pay the drive like anyone else. Ripio does their KYC there.
function onrampLink(country: string, symbol: string, amount: string, wallet?: string | null) {
  const q = new URLSearchParams({ country, chain: "42220", token: symbol.toUpperCase() });
  const n = Number(amount);
  if (Number.isFinite(n) && n > 0) q.set("amount", (Math.ceil(n * 100) / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  if (wallet) q.set("address", wallet);
  return `https://ramp.ripio.com/?${q.toString()}`;
}

const LOCAL_MONEY: Record<string, string> = { AR: "Argentine pesos", BR: "reais", MX: "Mexican pesos", CO: "Colombian pesos" };
// Coins Ripio sells for local money, so someone paying in them can buy them first.
const RAMP_COUNTRY: Record<string, string> = { wARS: "AR", wBRL: "BR", wMXN: "MX", wCOP: "CO" };
// The flag or logo for a coin, so people pick their money by sight.

const money = (v: string) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 });

// The photograph that says what this drive is for, before the address and the amounts.
function sceneFor(drive: Drive): { img: string; alt: string; icon: LucideIcon } {
  const label = drive.label.toLowerCase();
  if (drive.bill?.category === "ELECTRICITY" || /electric|meter|prepaid/.test(label)) {
    return { img: "/images/meter.webp", alt: "A prepaid electricity meter on a wall", icon: Zap };
  }
  if (drive.bill?.category === "INTERNATIONAL") {
    return { img: "/images/buenos-aires.webp", alt: "A street in Buenos Aires with a fruit stand", icon: Globe };
  }
  if (drive.bill?.category === "AIRTIME" || /airtime|mtn|airtel|glo|9mobile/.test(label)) {
    return { img: "/images/phone-yellow.webp", alt: "A woman smiling at her phone", icon: Smartphone };
  }
  if (/school|fee|term|tuition/.test(label)) {
    return { img: "/images/school.webp", alt: "Two smiling schoolboys in uniform", icon: GraduationCap };
  }
  if (/rent|house|landlord|compound/.test(label)) {
    return { img: "/images/compound.webp", alt: "A house with washing drying out front", icon: Home };
  }
  return { img: "/images/friends.webp", alt: "Friends sitting together", icon: Users };
}

function pathMarks(drive: Drive): { src: string; name: string }[] {
  const marks: { src: string; name: string }[] = [{ src: "/logos/celo.png", name: "Celo" }];
  const coin = coinIcon(drive.token.symbol);
  if (coin) marks.push({ src: coin, name: coinName(drive.token.symbol) });
  // Textile only while a swap is still on offer; a closed drive was never swapped into.
  if (drive.payOptions.length > 0 && !drive.closed) marks.push({ src: "/logos/textile.svg", name: "Textile" });
  if (drive.bill) marks.push({ src: "/logos/abapay.png", name: "AbaPay" });
  if (drive.ramp) marks.push({ src: "/logos/ripio.png", name: "Ripio" });
  if (drive.chat) marks.push({ src: "/logos/telegram.svg", name: "Telegram" });
  return marks;
}

/** The rails this drive actually runs on, as one quiet line, not a wall of sponsor logos. */
function RunsOn({ marks }: { marks: { src: string; name: string }[] }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t pt-4 text-xs" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
      <span className="font-semibold tracking-wide uppercase">Runs on</span>
      {marks.map((m) => (
        <span key={m.name} className="inline-flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5">
            <img src={m.src} alt="" className={m.src.includes("/flags/") ? "h-full w-full object-cover" : "h-3.5 w-3.5 object-contain"} />
          </span>
          {m.name}
        </span>
      ))}
    </div>
  );
}

/** A pattern drawn from the wallet address itself, so the payee is recognised by sight, not by reading hex. */
function AddressAvatar({ address, size = 48 }: { address: string; size?: number }) {
  const hex = address.toLowerCase().replace(/^0x/, "");
  const byte = (i: number) => parseInt(hex.slice((i * 2) % 40, ((i * 2) % 40) + 2), 16);
  const hue = Math.round((byte(0) / 255) * 360);
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (byte(1 + y * 3 + x) % 2) continue;
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
      if (x < 2) cells.push(<rect key={`m${x}-${y}`} x={4 - x} y={y} width="1" height="1" />);
    }
  }
  return (
    <svg viewBox="-0.6 -0.6 6.2 6.2" width={size} height={size} aria-hidden className="shrink-0 rounded-xl" style={{ background: `hsl(${(hue + 30) % 360} 70% 93%)` }}>
      <g fill={`hsl(${hue} 60% 42%)`} shapeRendering="crispEdges">{cells}</g>
    </svg>
  );
}

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function DrivePage() {
  const { id } = useParams();
  const [drive, setDrive] = useState<Drive | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [payIn, setPayIn] = useState<PayIn>("direct");
  const [cq, setCq] = useState<CorridorQuote | null>(null);
  const [cqError, setCqError] = useState("");
  const [refundHash, setRefundHash] = useState<Hex | null>(null);
  const [failedHash, setFailedHash] = useState<Hex | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BillReceipt | null>(null);
  const [receiptError, setReceiptError] = useState("");

  // A wallet that is already connected (MiniPay, or a browser wallet that remembers the site) goes
  // into the on-ramp link, so bought pesos land where the payer will pay from.
  useEffect(() => {
    window.ethereum
      ?.request({ method: "eth_accounts" })
      .then((a) => setWallet(((a as string[]) ?? [])[0] ?? null))
      .catch(() => {});
  }, []);

  const query = new URLSearchParams(location.search);
  const tgId = query.get("u") ?? "";
  const tgName = query.get("n") ? decodeURIComponent(query.get("n")!) : "";

  const refresh = useCallback(() => {
    if (!id) return;
    getDrive(id, tgId)
      .then((d) => {
        setDrive(d);
        setLoadError(null);
      })
      .catch((e: Error) =>
        setLoadError(e.message.startsWith("HTTP ") ? "Earmark is not reachable right now. Try again in a moment." : e.message),
      );
  }, [id, tgId]);

  useEffect(refresh, [refresh]);

  // Prefill: the instalment the API says is next, else an amount handed over in the link.
  useEffect(() => {
    if (!drive) return;
    const amt = query.get("amt");
    if (drive.you) setAmount(formatUnits(BigInt(drive.you.amount), drive.token.decimals));
    else if (amt) setAmount(amt);
  }, [drive]);

  const chain = useMemo(() => {
    if (!drive) return null;
    return defineChain({
      id: drive.chainId,
      name: drive.chainId === 42220 ? "Celo" : "Local",
      nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
      rpcUrls: { default: { http: [drive.rpcUrl] } },
    });
  }, [drive]);

  const fmt = (v: bigint | string) =>
    drive
      ? (() => {
          const n = Number(formatUnits(BigInt(v), drive.token.decimals));
          return `${n.toLocaleString("en-US", { maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 4 : 2 })} ${coinName(drive.token.symbol)}`;
        })()
      : "";

  const raised = drive ? BigInt(drive.raised) : 0n;
  const target = drive ? BigInt(drive.target) : 0n;
  const remaining = target > raised ? target - raised : 0n;
  const pct = target > 0n ? Math.min(100, Number((raised * 1000n) / target) / 10) : 0;

  const corridor = !!drive && drive.payOptions.length > 0;
  const swapping = corridor && payIn !== "direct";

  // A dollar payer sees, before paying, the most they will send for the local amount they typed.
  useEffect(() => {
    if (!drive || !swapping) {
      setCq(null);
      setCqError("");
      return;
    }
    const want = amount || (remaining > 0n ? formatUnits(remaining, drive.token.decimals) : "");
    if (!want || Number(want) <= 0) return;
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/drive/${drive.id}/corridor-quote?pay=${payIn}&amount=${encodeURIComponent(want)}`)
        .then(async (r) => ({ ok: r.ok, body: await r.json() }))
        .then(({ ok, body }) => {
          if (!live) return;
          if (ok) {
            setCq(body as CorridorQuote);
            setCqError("");
          } else {
            setCq(null);
            setCqError(body.error ?? "No price right now.");
          }
        })
        .catch(() => live && setCqError("No price right now."));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [drive, swapping, payIn, amount, remaining]);

  async function payCorridor() {
    if (!drive || !chain || !cq) return;
    if (!window.ethereum) {
      setStage("error");
      setMessage("No wallet here. Open this link in MiniPay, or in the browser inside MetaMask or another Celo wallet.");
      return;
    }
    try {
      const [raw] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const account = getAddress(raw);
      await ensureChain({ chainId: drive.chainId, rpcUrl: drive.rpcUrl, explorer: drive.explorer });
      const pub = createPublicClient({ chain, transport: http(drive.rpcUrl) });
      const wallet = createWalletClient({ chain, account, transport: custom(window.ethereum) });
      const dataSuffix: Hex | undefined = drive.tag ? toDataSuffix(drive.tag) : undefined;
      const maxPay = BigInt(cq.maxPay);
      const balance = await pub.readContract({ address: cq.payToken, abi: ERC20_ABI, functionName: "balanceOf", args: [account] });
      if (balance < maxPay) {
        throw new Error(`This needs up to ${money(cq.maxPayHuman)} ${coinName(cq.pay)}, and your wallet has ${money(formatUnits(balance, cq.payDecimals))}.`);
      }

      setStage("paying");
      setMessage(`Confirm sending ${money(cq.maxPayHuman)} ${coinName(cq.pay)}. Whatever the swap does not use comes back to you.`);
      const payTx = await wallet.writeContract({
        address: cq.payToken,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [cq.sendTo, maxPay],
        dataSuffix,
      } as never);
      if ((await pub.waitForTransactionReceipt({ hash: payTx })).status !== "success") {
        throw new Error("The transfer failed on chain, so nothing was sent. Check your wallet has a little CELO for gas.");
      }

      setStage("swapping");
      setMessage(`Received. Swapping to ${drive.token.symbol} on Textile FX, then paying the drive.`);
      const sent = await fetch("/api/corridor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveId: String(drive.id), payTx, wantLocal: cq.wantLocal, name: tgName, u: tgId }),
      });
      const created = await sent.json();
      if (!sent.ok) throw new Error(created.error ?? "Earmark could not record that payment.");

      for (let i = 0; i < 90; i++) {
        await sleep(2000);
        const st = (await (await fetch(`/api/corridor/${created.id}`)).json()) as CorridorStatus;
        if (st.status === "contributed") {
          setTxHash(st.contribute_tx as Hex);
          setRefundHash((st.refund_tx as Hex) ?? null);
          setStage("done");
          setMessage(
            `Paid. ${fmt(st.local_amount ?? "0")} landed at the destination.${st.refund_tx ? ` The unused ${coinName(cq.pay)} went back to your wallet.` : ""}`,
          );
          setAmount("");
          refresh();
          return;
        }
        if (st.status === "refunded" || st.status === "failed") {
          setRefundHash((st.refund_tx as Hex) ?? null);
          setStage("error");
          setMessage(st.status === "refunded" ? `${st.note ?? "The payment was not swapped."} Your money was returned.` : `${st.note} Reply to the bot and it will be sorted by hand.`);
          return;
        }
      }
      setStage("error");
      setMessage("Still working on it. The tally in your group will show it when it lands.");
    } catch (e) {
      setStage("error");
      const err = e as { shortMessage?: string; message?: string };
      setMessage(err.shortMessage ?? err.message ?? "Something went wrong.");
    }
  }

  const still = useReducedMotion();
  const payBtn = useLift(2);
  const progress = useSpring({
    width: `${pct}%`,
    from: { width: "0%" },
    immediate: !!still,
    config: { tension: 120, friction: 26 },
  });

  async function pay() {
    if (!drive || !chain) return;
    const value = parseUnits(amount || (remaining > 0n ? formatUnits(remaining, drive.token.decimals) : "0"), drive.token.decimals);
    if (value <= 0n) {
      setStage("error");
      setMessage("Enter an amount.");
      return;
    }
    if (target > 0n && value > remaining) {
      // The contract refuses a payment past the target, and some wallets send it anyway.
      setStage("error");
      setMessage(`This drive needs only ${formatUnits(remaining, drive.token.decimals)} ${drive.token.symbol} more. Pay that, or less.`);
      return;
    }
    if (!window.ethereum) {
      setStage("error");
      setMessage("No wallet here. Open this link in MiniPay, or in the browser inside MetaMask or another Celo wallet.");
      return;
    }
    try {
      const [raw] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const account = getAddress(raw);
      await ensureChain({ chainId: drive.chainId, rpcUrl: drive.rpcUrl, explorer: drive.explorer });
      const pub = createPublicClient({ chain, transport: http(drive.rpcUrl) });
      const wallet = createWalletClient({ chain, account, transport: custom(window.ethereum) });
      const dataSuffix: Hex | undefined = drive.tag ? toDataSuffix(drive.tag) : undefined;
      const feeCurrency = drive.token.feeCurrency ?? undefined;
      const memo = tgId ? `tg:${tgId}:${tgName}` : tgName;

      const balance = await pub.readContract({ address: drive.token.address, abi: ERC20_ABI, functionName: "balanceOf", args: [account] });
      if (balance < value) throw new Error(`Your balance is ${fmt(balance)}, and this needs ${fmt(value)}.`);

      const allowance = await pub.readContract({
        address: drive.token.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account, drive.earmark],
      });
      if (allowance < value) {
        setStage("approving");
        setMessage("Approve in your wallet, step 1 of 2.");
        const h = await wallet.writeContract({
          address: drive.token.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [drive.earmark, value],
          dataSuffix,
          feeCurrency,
        } as never);
        if ((await pub.waitForTransactionReceipt({ hash: h })).status !== "success") {
          throw new Error("The approval failed on chain. Nothing was paid.");
        }
      }
      setStage("paying");
      setMessage("Confirm the payment.");
      const hash = await wallet.writeContract({
        address: drive.earmark,
        abi: EARMARK_ABI,
        functionName: "contribute",
        args: [BigInt(drive.id), value, memo],
        dataSuffix,
        feeCurrency,
      } as never);
      setMessage("Sending it to the destination.");
      if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") {
        setFailedHash(hash);
        throw new Error("The payment failed on chain, so nothing was paid. Only the gas was spent.");
      }
      setTxHash(hash);
      setStage("done");
      setMessage("Paid. It landed at the destination.");
      setAmount("");
      refresh();
    } catch (e) {
      setStage("error");
      const err = e as { shortMessage?: string; message?: string };
      setMessage(err.shortMessage ?? err.message ?? "Something went wrong.");
    }
  }

  const busy = stage === "approving" || stage === "paying" || stage === "swapping";

  // The token of a bill drive opened on the website goes only to the wallet that opened it.
  async function showReceipt() {
    if (!drive || !chain) return;
    setReceiptError("");
    try {
      if (!window.ethereum) throw new Error("Open this page in the wallet that opened the drive.");
      const [raw] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const account = getAddress(raw);
      const w = createWalletClient({ chain, account, transport: custom(window.ethereum) });
      const signature = await w.signMessage({ account, message: `Earmark: show me the receipt for drive #${drive.id}.` });
      setReceipt(await getBillReceipt(drive.id, signature));
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setReceiptError(err.shortMessage ?? err.message ?? "Could not show the receipt.");
    }
  }

  async function copyLink() {
    if (!drive) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/d/${driveCode(drive.id)}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      /* the address bar still has the link */
    }
  }

  async function copyDestination() {
    if (!drive) return;
    try {
      await navigator.clipboard.writeText(drive.destination);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* the address is selectable on screen either way */
    }
  }

  const scene = drive ? sceneFor(drive) : null;
  const marks = drive ? pathMarks(drive) : [];
  const SceneIcon = scene?.icon ?? Users;
  const full = target > 0n && remaining === 0n;
  // The contract refuses payments after the closing date, so the page must not offer to take one.
  const expired = !!drive && !drive.closed && drive.deadline > 0 && Date.now() / 1000 > drive.deadline;
  // A bill's header says what is being paid; the number and amount sit under it instead of wrapping the title.
  const heroTitle = drive?.bill ? drive.bill.provider : (drive?.label ?? "");
  const heroDetail = drive?.bill ? `for ${drive.bill.number} · ${drive.bill.amountLabel}` : null;
  const status = !drive
    ? null
    : full || drive.bill?.status === "paid"
      ? { text: "Fully paid", bg: "#56df7c", fg: "#0a0a08" }
      : drive.closed || expired
        ? { text: "Closed", bg: "rgb(255 255 255 / 0.18)", fg: "#ffffff" }
        : { text: "Open", bg: "var(--brand)", fg: "var(--brand-ink)" };

  return (
    <Shell>
      <main className="mx-auto max-w-lg px-5 pb-16 lg:max-w-6xl">
        {loadError && (
          <div className="surface mt-6 rounded-2xl p-6">
            <TriangleAlert className="h-5 w-5" style={{ color: "var(--pending)" }} />
            <p className="mt-3 font-semibold">This drive is not available.</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {loadError}
            </p>
          </div>
        )}

        {!drive && !loadError && (
          <div className="surface mt-6 flex items-center gap-3 rounded-2xl p-6" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading drive
          </div>
        )}

        {drive && scene && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-x-6"
          >
            <header className="relative mt-6 overflow-hidden rounded-[1.5rem] lg:col-start-1 lg:row-start-1" style={{ background: "#0a0a08" }}>
              <img src={scene.img} alt={scene.alt} className="absolute inset-0 h-full w-full object-cover opacity-85" />
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
              <div className="relative flex min-h-[14.5rem] flex-col p-5 text-white lg:min-h-[19rem] lg:p-7">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
                    <SceneIcon className="h-5 w-5" />
                  </span>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="pressable inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white"
                    style={{ background: "rgb(0 0 0 / 0.35)", border: "1px solid rgb(255 255 255 / 0.28)" }}
                  >
                    {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {linkCopied ? "Copied" : "Copy link"}
                  </button>
                </div>
                <div className="mt-auto pt-8">
                  {status && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase" style={{ background: status.bg, color: status.fg }}>
                      {status.text}
                    </span>
                  )}
                  <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight lg:text-[2.6rem]">{heroTitle}</h1>
                  {heroDetail && <p className="mt-1 text-base font-semibold text-white/90 tabular-nums">{heroDetail}</p>}
                  <p className="mt-1.5 text-sm text-white/80 tabular-nums">
                    {drive.you ? `Instalment ${drive.you.seq} of ${drive.you.count}` : `Drive ${driveCode(drive.id)}`}
                    {drive.closed ? " · closed" : ""}
                    {!drive.closed && drive.deadline > 0
                      ? ` · ${expired ? "closed" : "closes"} ${new Date(drive.deadline * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                      : ""}
                  </p>
                </div>
              </div>
            </header>

            <div className="surface mt-4 rounded-2xl p-5 lg:col-start-1 lg:row-start-2 lg:p-6">
              <div className="flex items-start gap-3.5 rounded-xl p-3.5" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}>
                <span className="relative">
                  <AddressAvatar address={drive.destination} />
                  <span className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full ring-2" style={{ background: "var(--brand)", color: "var(--brand-ink)", ["--tw-ring-color" as string]: "var(--bg-raised)" }}>
                    <Lock className="h-3 w-3" />
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                    {drive.bill ? "The pool waits at this address" : "Pays only to this address"}
                  </p>
                  <p className="mt-0.5 font-mono text-[15px] font-semibold">{shortAddress(drive.destination)}</p>
                  <p className="mt-0.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {drive.destination.slice(0, 22)}
                    <wbr />
                    {drive.destination.slice(22)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <a
                      href={`${drive.explorer}/address/${drive.destination}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded underline underline-offset-4"
                      style={{ color: "var(--accent)" }}
                    >
                      Open on Celoscan <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={copyDestination}
                      className="pressable inline-flex items-center gap-1 rounded"
                      style={{ color: "var(--accent)" }}
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  {drive.bill && (
                    <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      Pay with the button, or send this coin to the address above. A transfer counts when only one open drive can take it.
                    </p>
                  )}
                </div>
              </div>

              {drive.bill && (
                <div className="mt-4 overflow-hidden rounded-xl text-sm leading-relaxed" style={{ border: "1px solid var(--line)" }}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: "var(--bg-sunken)" }}>
                    <p className="flex min-w-0 items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      {drive.bill.category === "ELECTRICITY" ? (
                        <Zap className="h-4 w-4 shrink-0" aria-hidden />
                      ) : drive.bill.category === "INTERNATIONAL" ? (
                        <Globe className="h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      {drive.bill.provider}
                    </p>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-black/5">
                      <img src="/logos/abapay.png" alt="AbaPay" className="h-6 w-6 object-contain" />
                    </span>
                  </div>
                  <div className="p-4">
                  <p className="font-semibold">
                    Earmark pays {drive.bill.provider} for {drive.bill.number}, {drive.bill.amountLabel}
                  </p>
                  <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                    {drive.bill.status === "paid"
                      ? drive.bill.openedOnWeb
                        ? "Paid. Whoever opened this drive can see the token below."
                        : "Paid. The token was posted in the group that collected for it."
                      : drive.bill.status === "collecting"
                        ? `This pool sits in Earmark's wallet until the drive is full, then the provider is paid${drive.bill.openedOnWeb ? "" : " and the receipt goes to the group"}. Unused money comes back. If the bill cannot be paid, everyone is refunded.`
                        : drive.bill.status === "paying"
                          ? "Full. Earmark is paying the bill now."
                          : drive.bill.status === "vending"
                            ? "AbaPay has the payment and is still delivering it. This page updates when it lands. Do not pay it again."
                            : drive.bill.status === "awaiting_refund"
                              ? "The provider could not deliver this bill. Everyone is paid back as soon as the refund arrives."
                              : "This bill was not paid. The money went back to the people who sent it."}
                  </p>
                  {drive.bill.openedOnWeb && drive.bill.status === "paid" && !receipt && (
                    <button
                      type="button"
                      onClick={showReceipt}
                      className="pressable mt-3 rounded-lg px-3 py-1.5 text-sm font-semibold"
                      style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}
                    >
                      I opened this drive: show the {drive.bill.category === "ELECTRICITY" ? "token" : "receipt"}
                    </button>
                  )}
                  {receipt && (
                    <div className="mt-3 rounded-lg p-3" style={{ background: "var(--accent-soft)" }}>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        For {receipt.number}
                      </p>
                      {receipt.purchasedCode ? (
                        <p className="mt-1 select-all font-mono text-base font-semibold tracking-wide">{receipt.purchasedCode}</p>
                      ) : (
                        <p className="mt-1">Delivered straight to the phone number; there is no code to enter.</p>
                      )}
                      {receipt.units && <p className="mt-1 text-xs">{receipt.units} units</p>}
                    </div>
                  )}
                  {receiptError && (
                    <p role="alert" className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
                      {receiptError}
                    </p>
                  )}
                  {drive.bill.settleTx && (
                    <a href={`${drive.explorer}/tx/${drive.bill.settleTx}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 underline underline-offset-4" style={{ color: "var(--accent)" }}>
                      Payment to AbaPay <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  </div>
                </div>
              )}

              {target > 0n && (
                <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-[2rem] leading-none tabular-nums">{fmt(full ? raised : remaining)}</span>
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>{full ? "raised, the full amount" : `still needed of ${fmt(target)}`}</span>
                </p>
              )}
              <ul className="mt-3 grid gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                <li className="flex items-start gap-2">
                  <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                  {drive.bill
                    ? "Waits in Earmark's wallet until the bill is paid"
                    : swapping
                      ? `Swapped to ${drive.token.symbol}, then paid to the address above`
                      : "Goes straight to the address above, in one transaction"}
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                  Nobody can redirect it
                </li>
              </ul>

              {target > 0n && (
                <div className="mt-5">
                  <div className="h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                    <animated.div className="h-full rounded-full" style={{ ...progress, background: "var(--accent)" }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm tabular-nums">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <CoinMark symbol={drive.token.symbol} className="h-5 w-5" />
                      {fmt(raised)}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>of {fmt(target)}</span>
                  </div>
                </div>
              )}

              {drive.ramp && raised > 0n && (target === 0n || raised >= target || drive.closed) && (
                <div className="mt-6 flex items-start gap-3 rounded-xl p-4 text-sm" style={{ background: "var(--accent-soft)" }}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                    <img src="/logos/ripio.png" alt="" className="h-6 w-6 object-contain" />
                  </span>
                  <div>
                  <p className="font-semibold">Are you the payee?</p>
                  <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                    Turn the {fmt(raised)} this drive paid you into {LOCAL_MONEY[drive.ramp.country] ?? "local money"} in your bank.{" "}
                    <a href={drive.ramp.offramp} target="_blank" rel="noreferrer" className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
                      Cash out with Ripio
                    </a>
                  </p>
                  </div>
                </div>
              )}

              <RunsOn marks={marks} />
            </div>

            <div className="surface mt-4 rounded-2xl p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-6 lg:p-6">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Wallet className="h-4 w-4" style={{ color: "var(--accent)" }} aria-hidden />
                {drive.closed || full || expired ? "Payment" : "Pay your share"}
              </p>
              {drive.unattached ? (
                <p role="alert" className="mt-6 text-sm" style={{ color: "var(--danger)" }}>
                  This drive pays Earmark's own wallet but has no bill attached, so nothing would pay it out. Do not pay into it;
                  whoever opened it can open a new bill drive.
                </p>
              ) : drive.closed || full || expired ? (
                <div className="mt-6 flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--accent-soft)" }}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
                    <Check className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold">
                    {full ? "This drive is fully paid." : expired ? "Its closing date has passed, so it can't take payments." : "This drive is closed."}
                  </p>
                </div>
              ) : (
                <div className="mt-6">
                  <div className="mb-4">
                    <CoinPicker
                      label={swapping ? `Pay in ${coinFace(payIn).money}. Earmark swaps it.` : "Pay in"}
                      symbols={[...new Set([drive.token.symbol, ...COIN_FACES.map((c) => c.symbol)])]}
                      value={payIn === "direct" ? drive.token.symbol : payIn}
                      payable={[drive.token.symbol, ...drive.payOptions]}
                      collects={drive.token.symbol}
                      onChange={(s) => setPayIn(s === drive.token.symbol ? "direct" : s)}
                    />
                  </div>

                  <label htmlFor="amt" className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {drive.you
                      ? `Instalment ${drive.you.seq} of ${drive.you.count}${tgName ? ` for ${tgName}` : ""}`
                      : `Your contribution${tgName ? ` as ${tgName}` : ""}`}
                  </label>
                  <div className="field mt-2 flex items-center gap-2 py-0">
                    <input
                      id="amt"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={remaining > 0n ? formatUnits(remaining, drive.token.decimals) : "0.00"}
                      className="w-full bg-transparent py-3 text-lg tabular-nums outline-none"
                    />
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {drive.token.symbol}
                    </span>
                  </div>

                  {drive.ramp && !swapping && (
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                      No {drive.token.symbol}?{" "}
                      <a
                        href={onrampLink(drive.ramp.country, drive.token.symbol, amount || formatUnits(remaining, drive.token.decimals), wallet)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                        style={{ color: "var(--accent)" }}
                      >
                        Buy it with {LOCAL_MONEY[drive.ramp.country] ?? "local money"} on Ripio
                      </a>
                      , then come back and pay.
                    </p>
                  )}

                  {swapping && (
                    <div className="mt-3 rounded-xl p-3 text-sm leading-relaxed" style={{ background: "var(--accent-soft)" }}>
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text)" }}>
                        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5">
                          <img src="/logos/textile.svg" alt="" className="h-4 w-4 object-contain" />
                        </span>
                        Textile FX
                      </p>
                      {cq ? (
                        <>
                          <p>
                            You send at most <strong className="tabular-nums">{money(cq.maxPayHuman)} {coinName(cq.pay)}</strong>; the
                            {drive.bill ? " drive" : " destination"} receives <strong className="tabular-nums">{fmt(cq.wantLocal)}</strong>.
                          </p>
                          <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                            Earmark swaps it on Textile FX for about {money(cq.quote)} {coinName(cq.pay)} and returns what is not used. Your{" "}
                            {coinName(cq.pay)} sits with Earmark only for the seconds the swap takes; if it cannot swap at this price, it comes straight back.
                          </p>
                          {RAMP_COUNTRY[cq.pay] && (
                            <p className="mt-2">
                              No {cq.pay}?{" "}
                              <a
                                href={onrampLink(RAMP_COUNTRY[cq.pay], cq.pay, cq.maxPayHuman, wallet)}
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-4"
                                style={{ color: "var(--accent)" }}
                              >
                                Buy it with {LOCAL_MONEY[RAMP_COUNTRY[cq.pay]]} on Ripio
                              </a>
                              , then come back and pay.
                            </p>
                          )}
                        </>
                      ) : (
                        <p style={{ color: cqError ? "var(--danger)" : "var(--text-muted)" }}>{cqError || "Getting a price…"}</p>
                      )}
                    </div>
                  )}

                  <animated.button
                    {...payBtn.bind}
                    onClick={swapping ? payCorridor : pay}
                    disabled={busy || (swapping && !cq)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold disabled:opacity-60"
                    style={{ ...payBtn.style, background: "var(--brand)", color: "var(--brand-ink)" }}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    {stage === "swapping" ? "Swapping and paying" : busy ? "Confirm in your wallet" : "Pay now"}
                  </animated.button>

                  {!window.ethereum && <PayQr />}

                  <AnimatePresence>
                    {message && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        role={stage === "error" ? "alert" : "status"}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="mt-3 flex items-start gap-2 text-sm"
                        style={{ color: stage === "error" ? "var(--danger)" : "var(--text-muted)" }}
                      >
                        {stage === "done" && <CheckCircle2 className="mt-0.5 h-4 w-4" style={{ color: "var(--accent)" }} />}
                        <span>{message}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {refundHash && (
                    <a
                      href={`${drive.explorer}/tx/${refundHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-4 mt-2 inline-flex items-center gap-1 text-sm underline underline-offset-4"
                      style={{ color: "var(--accent)" }}
                    >
                      See the refund on Celoscan <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {failedHash && (
                    <a
                      href={`${drive.explorer}/tx/${failedHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-4 mt-2 inline-flex items-center gap-1 text-sm underline underline-offset-4"
                      style={{ color: "var(--danger)" }}
                    >
                      See the failed transaction <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {txHash && (
                    <a
                      href={`${drive.explorer}/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm underline underline-offset-4"
                      style={{ color: "var(--accent)" }}
                    >
                      View transaction <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {drive.payments.length > 0 && (
              <div className="surface mt-4 rounded-2xl p-6 lg:col-start-1 lg:row-start-3">
                <p className="text-sm font-semibold">
                  Who has paid{" "}
                  <span className="font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {drive.payments.length}
                  </span>
                </p>
                <ul className="mt-3">
                  {drive.payments.map((p) => (
                    <motion.li
                      key={p.tx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                      className="flex items-center justify-between border-t py-2.5 text-sm tabular-nums first:border-t-0"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
                          {(p.name.replace(/^@+/, "") || "?").slice(0, 1).toUpperCase()}
                        </span>
                        {p.name}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>{fmt(p.amount)}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </Shell>
  );
}
