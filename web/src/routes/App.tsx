import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { animated } from "@react-spring/web";
import { ArrowRight, ChevronDown, Loader2, Lock, Plus, RefreshCw, Wallet, X, Zap } from "lucide-react";
import { formatUnits, isAddress, parseAbi, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { toDataSuffix } from "@celo/attribution-tags";
import { Shell } from "../components/Shell";
import {
  attachBill,
  coinName,
  getBillProviders,
  getBillQuote,
  getConfig,
  getDrives,
  getIntlCountries,
  getIntlOperators,
  getIntlPlans,
  type BillChoice,
  type BillProvider,
  type BillQuote,
  type IntlCountry,
  type IntlOperator,
  type IntlPlan,
  type DriveSummary,
} from "../lib/api";
import { chainFor, connect, publicFor, silentAccount, walletFor, type Config } from "../lib/wallet";
import { useLift } from "../lib/springs";

const EARMARK_ABI = parseAbi([
  "function createDrive(address token, address destination, uint256 target, uint64 deadline, string label) returns (uint256)",
  "function close(uint256 id)",
  "event DriveCreated(uint256 indexed id, address indexed collector, address indexed destination, address token, uint256 target, uint64 deadline, string label)",
]);

type BillDraft = { quote: BillQuote; choice: BillChoice };

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function pct(raised: bigint, target: bigint) {
  if (target <= 0n) return 0;
  return Math.min(100, Number((raised * 100n) / target));
}

// A drive that hit its target is a success, and reads differently from one somebody shut early.
function driveState(d: DriveSummary): "open" | "paid" | "closed" {
  const raised = BigInt(d.raised);
  const target = BigInt(d.target);
  if (target > 0n && raised >= target) return "paid";
  return d.closed ? "closed" : "open";
}

function DriveRow({ d, mine, onClose, agent }: { d: DriveSummary; mine: boolean; onClose: (id: number) => void; agent?: Address }) {
  const isBill = !!agent && d.destination.toLowerCase() === agent.toLowerCase();
  const raised = BigInt(d.raised);
  const target = BigInt(d.target);
  const state = driveState(d);
  const amount = (v: bigint) =>
    `${Number(formatUnits(v, d.token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${d.token.symbol}`;

  const pill =
    state === "paid"
      ? { label: "Paid in full", background: "var(--accent-soft)", color: "var(--accent)", border: "none" }
      : state === "closed"
        ? { label: "Closed", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }
        : { label: "Open", background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" };

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{d.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {isBill ? (
              <>
                <Zap className="h-3 w-3" /> Earmark pays the bill
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" /> pays {short(d.destination)}
              </>
            )}
            <span aria-hidden="true">·</span>
            {d.token.symbol}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ background: pill.background, color: pill.color, border: pill.border }}
        >
          {pill.label}
        </span>
      </div>

      {target > 0n && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct(raised, target)}%`, background: state === "closed" ? "var(--pending)" : "var(--accent)" }}
            />
          </div>
          <div className="mt-2 flex justify-between text-sm tabular-nums">
            <span className="font-semibold">{amount(raised)}</span>
            <span style={{ color: "var(--text-muted)" }}>of {amount(target)}</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to={`/d/${d.id}`}
          className="pressable inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold"
          style={
            d.closed
              ? { border: "1px solid var(--line)", color: "var(--text-muted)" }
              : { background: "var(--brand)", color: "var(--brand-ink)" }
          }
        >
          {d.closed ? "View" : "Pay"} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {mine && !d.closed && (
          <button
            onClick={() => onClose(d.id)}
            className="rounded-lg text-sm underline underline-offset-4"
            style={{ color: "var(--text-muted)" }}
          >
            Close drive
          </button>
        )}
      </div>
    </div>
  );
}

export function AppPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [drives, setDrives] = useState<DriveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  // A bill drive that opened but whose bill is not attached yet (the signature was declined, say).
  const [unattached, setUnattached] = useState<(BillDraft & { id: number }) | null>(null);
  const navigate = useNavigate();
  const connectBtn = useLift(2);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, ds] = await Promise.all([getConfig(), getDrives()]);
      setCfg(c);
      setDrives(ds);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void silentAccount().then((a) => a && setAccount(a));
  }, [load]);

  // Wiring tests never show; the rest split into yours, still open, and finished.
  const visible = useMemo(() => drives.filter((d) => !d.test), [drives]);
  const hiddenTests = drives.length - visible.length;
  const isMine = (d: DriveSummary) => !!account && d.collector.toLowerCase() === account.toLowerCase();
  const mine = useMemo(() => visible.filter(isMine), [visible, account]);
  const open = useMemo(() => visible.filter((d) => !isMine(d) && driveState(d) === "open"), [visible, account]);
  const finished = useMemo(() => visible.filter((d) => !isMine(d) && driveState(d) !== "open"), [visible, account]);

  async function onConnect() {
    if (!cfg) return;
    setError("");
    try {
      setAccount(await connect(cfg));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function closeDrive(id: number) {
    if (!cfg || !account) return;
    setError("");
    setBusy(`Closing drive ${id}`);
    try {
      const wallet = walletFor(cfg, account);
      const pub = publicFor(cfg);
      const hash = await wallet.writeContract({
        address: cfg.earmark,
        abi: EARMARK_ABI,
        functionName: "close",
        args: [BigInt(id)],
        chain: chainFor(cfg),
        dataSuffix: cfg.tag ? toDataSuffix(cfg.tag) : undefined,
      } as never);
      await pub.waitForTransactionReceipt({ hash: hash as Hex });
      await load();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Could not close that drive.");
    } finally {
      setBusy("");
    }
  }

  async function createDrive(form: { amount: string; symbol: string; destination: string; label: string; deadline: string }) {
    if (!cfg || !account) return;
    setError("");
    const token = Object.values(cfg.tokens).find((t) => t.symbol.toLowerCase() === form.symbol.toLowerCase());
    if (!token) return setError("Pick a token.");
    if (!isAddress(form.destination)) return setError("That destination is not a wallet address.");
    if (!form.label.trim()) return setError("Give the drive a name.");
    let target: bigint;
    try {
      target = parseUnits(form.amount, token.decimals);
    } catch {
      return setError("The amount must be a number.");
    }
    if (target <= 0n) return setError("The amount must be greater than zero.");
    // A date is the end of that day, UTC, so "by the 30th" still accepts a payment on the 30th.
    let deadline = 0n;
    if (form.deadline) {
      const t = Date.parse(`${form.deadline}T23:59:59Z`);
      if (Number.isNaN(t)) return setError("That closing date is not valid.");
      if (t < Date.now()) return setError("The closing date has already passed.");
      deadline = BigInt(Math.floor(t / 1000));
    }

    setBusy("Opening the drive");
    try {
      const wallet = walletFor(cfg, account);
      const pub = publicFor(cfg);
      const hash = await wallet.writeContract({
        address: cfg.earmark,
        abi: EARMARK_ABI,
        functionName: "createDrive",
        args: [token.address, form.destination as Address, target, deadline, form.label.trim()],
        chain: chainFor(cfg),
        dataSuffix: cfg.tag ? toDataSuffix(cfg.tag) : undefined,
      } as never);
      await pub.waitForTransactionReceipt({ hash: hash as Hex });
      setShowNew(false);
      await load();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Could not open the drive.");
    } finally {
      setBusy("");
    }
  }

  // The opener signs which bill the drive pays, so nobody else can attach their own number to it.
  async function attach(p: BillDraft & { id: number }) {
    if (!cfg || !account) return;
    setBusy("Sign to attach the bill");
    const signature = await walletFor(cfg, account).signMessage({ account, message: p.quote.sign.replace("{id}", String(p.id)) });
    await attachBill({ ...p.choice, driveId: p.id, number: p.quote.number, coin: p.quote.coin, signature });
    setUnattached(null);
    navigate(`/d/${p.id}`);
  }

  async function createBillDrive(b: BillDraft) {
    if (!cfg || !account) return;
    setError("");
    if (b.quote.payee.toLowerCase() !== cfg.agent.toLowerCase()) return setError("That price did not come from Earmark. Reload and try again.");
    setBusy("Opening the bill drive");
    try {
      const wallet = walletFor(cfg, account);
      const pub = publicFor(cfg);
      const hash = await wallet.writeContract({
        address: cfg.earmark,
        abi: EARMARK_ABI,
        functionName: "createDrive",
        args: [b.quote.token, b.quote.payee, BigInt(b.quote.target), 0n, b.quote.label],
        chain: chainFor(cfg),
        dataSuffix: cfg.tag ? toDataSuffix(cfg.tag) : undefined,
      } as never);
      const receipt = await pub.waitForTransactionReceipt({ hash: hash as Hex });
      const created = parseEventLogs({ abi: EARMARK_ABI, logs: receipt.logs, eventName: "DriveCreated" }).find(
        (l) => l.address.toLowerCase() === cfg.earmark.toLowerCase(),
      );
      if (!created) throw new Error("The drive opened but Earmark could not read its number. Refresh the list.");
      const pending = { ...b, id: Number(created.args.id) };
      setUnattached(pending);
      setShowNew(false);
      await attach(pending);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Could not open the bill drive.");
    } finally {
      setBusy("");
    }
  }

  async function retryAttach() {
    if (!unattached) return;
    setError("");
    try {
      await attach(unattached);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Could not attach the bill.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Shell>
      <main className="mx-auto max-w-3xl px-5 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
          <div>
            <h1 className="font-display text-4xl tracking-tight">Drives</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Everything the bot can do, from a browser. Drives live on Celo, so this list is public and read from
              the chain.
            </p>
          </div>
          {account ? (
            <div className="flex items-center gap-3">
              <span className="surface rounded-full px-3 py-1.5 font-mono text-xs">{short(account)}</span>
              <button
                onClick={() => setShowNew(true)}
                className="pressable inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold"
                style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
              >
                <Plus className="h-4 w-4" /> New drive
              </button>
            </div>
          ) : (
            <animated.button
              {...connectBtn.bind}
              onClick={onConnect}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ ...connectBtn.style, background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              <Wallet className="h-4 w-4" /> Connect wallet
            </animated.button>
          )}
        </div>

        {busy && (
          <p className="mt-4 flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> {busy}. Confirm in your wallet.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {unattached && !busy && (
          <div className="surface mt-4 rounded-2xl p-4 text-sm">
            <p>
              Drive #{unattached.id} is open, but its bill is not attached yet, so nobody should pay into it until it is.
            </p>
            <button
              onClick={retryAttach}
              className="pressable mt-3 rounded-xl px-4 py-2 font-semibold"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              Sign to attach the bill
            </button>
          </div>
        )}

        <AnimatePresence>
          {showNew && cfg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <NewPanel cfg={cfg} onCancel={() => setShowNew(false)} onSubmit={createDrive} onBill={createBillDrive} />
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <p className="mt-10 flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the chain
          </p>
        ) : (
          <>
            {account && mine.length > 0 && (
              <section className="mt-10">
                <h2 className="text-sm font-semibold">
                  Drives you opened{" "}
                  <span className="font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {mine.length}
                  </span>
                </h2>
                <div className="mt-3 grid gap-3">
                  {mine.map((d) => (
                    <DriveRow key={d.id} d={d} mine onClose={closeDrive} agent={cfg?.agent} />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Open drives{" "}
                  <span className="font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {open.length}
                  </span>
                </h2>
                <button
                  onClick={load}
                  disabled={loading}
                  className="pressable inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
              {open.length === 0 ? (
                <p className="surface mt-3 rounded-2xl p-6 text-sm" style={{ color: "var(--text-muted)" }}>
                  {account
                    ? "Nothing open right now. Open one here, or add Earmark to a group chat and use /new."
                    : "Nothing open right now. Connect a wallet to open one, or add Earmark to a group chat and use /new."}
                </p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {open.map((d) => (
                    <DriveRow key={d.id} d={d} mine={false} onClose={closeDrive} agent={cfg?.agent} />
                  ))}
                </div>
              )}
            </section>

            {finished.length > 0 && (
              <section className="mt-10">
                <button
                  onClick={() => setShowClosed((v) => !v)}
                  aria-expanded={showClosed}
                  className="pressable inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold"
                >
                  Finished{" "}
                  <span className="font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {finished.length}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 transition-transform duration-200"
                    style={{ color: "var(--text-muted)", transform: showClosed ? "rotate(180deg)" : "none" }}
                  />
                </button>
                {showClosed && (
                  <div className="mt-3 grid gap-3">
                    {finished.map((d) => (
                      <DriveRow key={d.id} d={d} mine={false} onClose={closeDrive} agent={cfg?.agent} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {hiddenTests > 0 && (
              <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
                {hiddenTests === 1 ? "One wiring test is hidden." : `${hiddenTests} wiring tests are hidden.`}
              </p>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}

function NewPanel({
  cfg,
  onCancel,
  onSubmit,
  onBill,
}: {
  cfg: Config;
  onCancel: () => void;
  onSubmit: (f: { amount: string; symbol: string; destination: string; label: string; deadline: string }) => void;
  onBill: (b: BillDraft) => void;
}) {
  const [kind, setKind] = useState<"address" | "bill">("address");
  return (
    <div className="surface mt-6 rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Kind of drive" className="inline-flex rounded-xl p-1" style={{ background: "var(--bg-sunken)" }}>
          {(
            [
              ["address", "Pay an address"],
              ["bill", "⚡ Pay a bill"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className="pressable rounded-lg px-3 py-1.5 text-sm font-medium"
              style={kind === k ? { background: "var(--bg-raised)", color: "var(--text)", boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)" } : { color: "var(--text-muted)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={onCancel} aria-label="Cancel" className="pressable -m-2 rounded-full p-2">
          <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
      {kind === "address" ? <NewDriveForm cfg={cfg} onSubmit={onSubmit} /> : <BillDriveForm onSubmit={onBill} />}
    </div>
  );
}

function NewDriveForm({
  cfg,
  onSubmit,
}: {
  cfg: Config;
  onSubmit: (f: { amount: string; symbol: string; destination: string; label: string; deadline: string }) => void;
}) {
  const symbols = Object.values(cfg.tokens).map((t) => t.symbol);
  const [amount, setAmount] = useState("");
  const [symbol, setSymbol] = useState(symbols[0] ?? "USDT");
  const [destination, setDestination] = useState("");
  const [label, setLabel] = useState("");
  const [deadline, setDeadline] = useState("");

  return (
    <>
      <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
        The destination is locked for the life of the drive. Paste the school, landlord or vendor wallet.
      </p>

      <div className="mt-4 grid gap-3">
        <div className="flex gap-3">
          <input
            className="field tabular-nums"
            inputMode="decimal"
            aria-label="Amount"
            placeholder="450"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select className="field" style={{ maxWidth: 130 }} aria-label="Token" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {symbols.map((s) => (
              <option key={s} value={s}>
                {coinName(s)}
              </option>
            ))}
          </select>
        </div>
        <input
          className="field"
          placeholder="Destination address, 0x…"
          aria-label="Destination address"
          spellCheck={false}
          autoComplete="off"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
        <input
          className="field"
          placeholder="What is it for? Term 1 fees for Chioma"
          aria-label="What the drive is for"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className="grid gap-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Closes on <span className="font-normal">(optional, the drive stops accepting payments after this day)</span>
          <input
            className="field tabular-nums"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <button
          onClick={() => onSubmit({ amount, symbol, destination, label, deadline })}
          className="pressable rounded-xl py-3 text-[15px] font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          Open drive
        </button>
      </div>
    </>
  );
}

const PRESETS = { AIRTIME: [100, 200, 500, 1000, 2000, 5000], ELECTRICITY: [2000, 5000, 10000, 20000, 50000] };

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl p-1" style={{ background: "var(--bg-sunken)" }}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className="pressable rounded-lg px-3 py-1.5 text-sm font-medium"
          style={value === v ? { background: "var(--bg-raised)", color: "var(--text)", boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)" } : { color: "var(--text-muted)" }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

type BillKind = "ELECTRICITY" | "AIRTIME" | "ABROAD";

// Listed first: the countries whose money Earmark can take, as wARS and wBRL through Ripio.
const FIRST = ["AR", "BR", "MX", "CO"];

function BillDriveForm({ onSubmit }: { onSubmit: (b: BillDraft) => void }) {
  const [providers, setProviders] = useState<BillProvider[]>([]);
  const [category, setCategory] = useState<BillKind>("ELECTRICITY");
  const [provider, setProvider] = useState("");
  const [number, setNumber] = useState("");
  const [naira, setNaira] = useState("");
  const [coin, setCoin] = useState<"USAT" | "USDT">("USAT");
  const [quote, setQuote] = useState<BillQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  // Abroad: AbaPay's live catalogue, one level at a time.
  const [countries, setCountries] = useState<IntlCountry[]>([]);
  const [country, setCountry] = useState("AR");
  const [operators, setOperators] = useState<IntlOperator[]>([]);
  const [operator, setOperator] = useState("");
  const [plans, setPlans] = useState<IntlPlan[]>([]);
  const [plan, setPlan] = useState("");
  const abroad = category === "ABROAD";

  useEffect(() => {
    getBillProviders()
      .then(setProviders)
      .catch(() => setQuoteError("Could not load the providers. Refresh to try again."));
  }, []);

  useEffect(() => {
    if (!abroad || countries.length) return;
    getIntlCountries()
      .then(setCountries)
      .catch(() => setQuoteError("Could not load the countries. Refresh to try again."));
  }, [abroad]);

  useEffect(() => {
    if (!abroad || !country) return;
    setOperators([]);
    setOperator("");
    getIntlOperators(country)
      .then((o) => {
        setOperators(o);
        setOperator(o[0]?.id ?? "");
      })
      .catch(() => setQuoteError("Could not load that country's networks."));
  }, [abroad, country]);

  useEffect(() => {
    if (!abroad || !operator) return;
    setPlans([]);
    setPlan("");
    getIntlPlans(operator)
      .then((p) => {
        setPlans(p);
        setPlan(p[0]?.code ?? "");
      })
      .catch(() => setQuoteError("Could not load that network's top-ups."));
  }, [abroad, operator]);

  const list = providers.filter((p) => p.category === category);
  useEffect(() => {
    if (!abroad && !list.some((p) => p.key === provider)) setProvider(list[0]?.key ?? "");
  }, [category, providers]);

  const choice: BillChoice | null = abroad
    ? country && operator && plan
      ? { country, operator, plan }
      : null
    : provider && Number.isInteger(Number(naira)) && Number(naira) >= 100
      ? { provider, naira: Number(naira) }
      : null;
  const choiceKey = JSON.stringify(choice);

  // A live price from AbaPay once the bill is complete enough to price.
  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    if (!choice || number.replace(/\D/g, "").length < 6) return;
    let live = true;
    const t = setTimeout(() => {
      getBillQuote({ ...choice, number, coin })
        .then((q) => live && setQuote(q))
        .catch((e: Error) => live && setQuoteError(e.message));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [choiceKey, number, coin]);

  const here = countries.find((c) => c.code === country);
  const what = category === "ELECTRICITY" ? "Prepaid meter number" : "Phone number to top up";
  const chosenLabel = abroad ? operators.find((o) => o.id === operator)?.name : list.find((p) => p.key === provider)?.label;
  const shortName = (name: string) => (here && name.startsWith(`${here.name} `) ? name.slice(here.name.length + 1) : name);

  return (
    <>
      <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
        Everyone pays their share into Earmark's wallet. When the drive is full, Earmark pays the provider itself through AbaPay.
      </p>
      <div className="mt-4 grid gap-3">
        <Segmented
          label="Kind of bill"
          value={category}
          options={[
            ["ELECTRICITY", "⚡ Nigerian electricity"],
            ["AIRTIME", "📱 Nigerian airtime"],
            ["ABROAD", "🌍 Airtime abroad"],
          ]}
          onChange={(v) => {
            setCategory(v);
            setNumber("");
            if (v === "ABROAD") setCoin("USDT");
          }}
        />

        {abroad ? (
          <>
            <select className="field" aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <optgroup label="Where Ripio ramps pesos and reais">
                {countries
                  .filter((c) => FIRST.includes(c.code))
                  .sort((a, b) => FIRST.indexOf(a.code) - FIRST.indexOf(b.code))
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Everywhere else">
                {countries
                  .filter((c) => !FIRST.includes(c.code))
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            </select>
            <select className="field" aria-label="Network" value={operator} onChange={(e) => setOperator(e.target.value)} disabled={!operators.length}>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {shortName(o.name)}
                </option>
              ))}
            </select>
            <div className="field flex items-center gap-2 py-0">
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                +{here?.prefix ?? ""}
              </span>
              <input
                className="w-full bg-transparent py-3 tabular-nums outline-none"
                inputMode="tel"
                aria-label="Phone number to top up"
                placeholder={`${here?.name ?? "Phone"} number`}
                autoComplete="off"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {plans.slice(0, 9).map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPlan(p.code)}
                  className="pressable rounded-full px-3 py-1 text-sm tabular-nums"
                  style={plan === p.code ? { background: "var(--accent)", color: "var(--accent-ink)" } : { border: "1px solid var(--line)" }}
                >
                  {Number(p.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} {p.currency}
                </button>
              ))}
              {operator && !plans.length && (
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Loading top-ups…
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <select className="field" aria-label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {list.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              className="field tabular-nums"
              inputMode="numeric"
              aria-label={what}
              placeholder={category === "ELECTRICITY" ? "Meter number, e.g. 45012345678" : "Phone number, e.g. 08031234567"}
              autoComplete="off"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <div>
              <div className="field flex items-center gap-2 py-0">
                <span style={{ color: "var(--text-muted)" }}>₦</span>
                <input
                  className="w-full bg-transparent py-3 tabular-nums outline-none"
                  inputMode="numeric"
                  aria-label="Amount in naira"
                  placeholder="Amount in naira"
                  value={naira}
                  onChange={(e) => setNaira(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESETS[category as "ELECTRICITY" | "AIRTIME"].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNaira(String(n))}
                    className="pressable rounded-full px-3 py-1 text-sm tabular-nums"
                    style={Number(naira) === n ? { background: "var(--accent)", color: "var(--accent-ink)" } : { border: "1px solid var(--line)" }}
                  >
                    ₦{n.toLocaleString("en-US")}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            The drive collects
          </p>
          <div className="mt-2">
            <Segmented
              label="Coin the drive collects"
              value={coin}
              options={[
                ["USAT", "USA₮"],
                ["USDT", "USD₮"],
              ]}
              onChange={setCoin}
            />
          </div>
          <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {coin === "USDT"
              ? "People can also pay in pesos (wARS), reais (wBRL) or naira (cNGN); Earmark swaps it on Textile FX."
              : "Everyone pays in USA₮. Pick USD₮ if someone will pay in pesos, reais or naira."}
          </p>
        </div>

        <div className="rounded-xl p-3 text-sm leading-relaxed" style={{ background: "var(--accent-soft)" }}>
          {quote ? (
            <p>
              The drive collects{" "}
              <strong className="tabular-nums">
                {Number(quote.targetHuman).toLocaleString("en-US", { maximumFractionDigits: 4 })} {coinName(quote.coin)}
              </strong>
              : AbaPay's price for {quote.amountLabel} of {chosenLabel ?? "the bill"} now, plus 2% in case the rate moves. Anything unused goes back
              to whoever paid.
            </p>
          ) : (
            <p style={{ color: quoteError ? "var(--danger)" : "var(--text-muted)" }}>
              {quoteError || "Fill in the bill to see what the drive will collect."}
            </p>
          )}
        </div>

        <button
          disabled={!quote || !choice}
          onClick={() => quote && choice && onSubmit({ quote, choice })}
          className="pressable rounded-xl py-3 text-[15px] font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          Open bill drive
        </button>
      </div>
    </>
  );
}
