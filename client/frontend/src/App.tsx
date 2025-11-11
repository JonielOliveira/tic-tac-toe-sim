import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

// ---------- Helpers de ambiente / URLs ----------

/** Lê VITE_SERVER_URL em build-time; se vier vazia/ausente, retorna "" (same-origin). */
function resolveServerUrl(): string | "" {
  // Vite injeta em build-time; usamos any para evitar tipos do Vite aqui
  const raw = ((import.meta as any)?.env?.VITE_SERVER_URL ?? "") as string;
  const v = (raw || "").trim();
  // normaliza: remove barras finais
  return v ? v.replace(/\/+$/, "") : "";
}

/** Monta a URL final: se base estiver vazia, devolve path relativo (same-origin). */
function apiUrl(path: string, base: string | ""): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p; // same-origin
  return `${base}${p}`;
}

// ---------- Tipos espelhados do backend ----------

type Mark = "X" | "O";
type Cell = "" | Mark;

type MatchStarted = {
  gameId: string;
  youAre: Mark;
  opponent: string;
};

type StatePayload = {
  gameId: string;
  board: Cell[];
  turn: Mark;
};

type PlayerStats = {
  name: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  score: number;
};

// ---------- UI helpers ----------

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// Socket hook que aceita URL explícita ou same-origin (string vazia)
function useSocket(url: string | "") {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  useEffect(() => {
    // Quando url === "" → same-origin (client descobre sozinho)
    const s = url
      ? io(url, { transports: ["websocket"], autoConnect: true })
      : io({ transports: ["websocket"], autoConnect: true });

    setSocket(s);

    const onConnect = () => {
      setConnected(true);
      setConnError(null);
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: Error) =>
      setConnError(err.message || "Erro de conexão");

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);

    // cleanup deve retornar void
    return (): void => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      void s.close();
    };
  }, [url]);

  return { socket, connected, connError } as const;
}

// ---------- App ----------

export default function App() {
  // Server URL: lê VITE_SERVER_URL; se vazia/ausente → same-origin ("")
  const [serverUrl] = useState<string | "">(() => resolveServerUrl());
  const { socket, connected, connError } = useSocket(serverUrl);

  // Identificação da instância (para validar balanceamento)
  const [instanceId, setInstanceId] = useState<string>("-");
  const [, setInstanceMeta] =
    useState<{ startedAt?: string; hostname?: string } | null>(null);

  console.log("VITE_SERVER_URL", import.meta.env.VITE_SERVER_URL);

  async function fetchInstance() {
    try {
      const r = await fetch(apiUrl("/api/instance", serverUrl));
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setInstanceId(d.instanceId || "-");
      setInstanceMeta({ startedAt: d.startedAt, hostname: d.hostname });
    } catch (e) {
      // silencioso; socket também envia o id
      console.warn("Falha ao buscar instance", e);
    }
  }

  useEffect(() => {
    fetchInstance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  useEffect(() => {
    if (!socket) return;

    const onInstance = (p: any) => {
      if (p?.instanceId) setInstanceId(p.instanceId);
    };

    socket.on("instance", onInstance);

    return (): void => {
      socket.off("instance", onInstance);
    };
  }, [socket]);

  // Session
  const [name, setName] = useState("");
  const [phase, setPhase] =
    useState<"idle" | "waiting" | "playing" | "gameover">("idle");

  // Game state
  const [youAre, setYouAre] = useState<Mark | null>(null);
  const [opponent, setOpponent] = useState<string>("");
  const [gameId, setGameId] = useState<string>("");
  const [board, setBoard] = useState<Cell[]>(Array<Cell>(9).fill(""));
  const [turn, setTurn] = useState<Mark>("X");
  const [result, setResult] = useState<Mark | "draw" | null>(null);

  const yourTurn = youAre !== null && turn === youAre;

  // Player profile (stats)
  const [profile, setProfile] = useState<{
    name: string;
    exists: boolean;
    stats: PlayerStats | null;
  } | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<PlayerStats[]>([]);

  // Toasts / errors
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  // Fetch leaderboard helper
  const fetchLeaderboard = async () => {
    try {
      const r = await fetch(apiUrl("/api/leaderboard", serverUrl));
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as PlayerStats[];
      setLeaderboard(data);
    } catch (e: any) {
      console.error("Falha ao buscar leaderboard:", e?.message || e);
    }
  };

  // Carrega leaderboard ao iniciar e quando URL mudar
  useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  // Recarrega leaderboard ao terminar partidas
  useEffect(() => {
    if (phase === "gameover") {
      fetchLeaderboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Socket event wiring
  useEffect(() => {
    if (!socket) return;

    const onWaiting = () => setPhase("waiting");

    const onMatchStarted = (p: MatchStarted) => {
      setPhase("playing");
      setYouAre(p.youAre);
      setOpponent(p.opponent);
      setGameId(p.gameId);
      setBoard(Array<Cell>(9).fill(""));
      setTurn("X");
      setResult(null);
    };

    const onState = (p: StatePayload) => {
      if (!p || !p.board) return;
      setBoard(p.board);
      setTurn(p.turn);
    };

    const onGameOver = ({
      gameId: endedId,
      result: res,
    }: {
      gameId: string;
      result: Mark | "draw";
    }) => {
      if (endedId !== gameId && gameId) return;
      setResult(res);
      setPhase("gameover");
    };

    const onCustomError = (payload: any) => {
      const msg = payload?.message || "Erro";
      showToast(msg);
    };

    const onProfile = (data: any) => {
      // data: { name, exists, stats?: { wins, losses, draws, games, score } }
      setProfile(data ?? null);
    };

    socket.on("waiting", onWaiting);
    socket.on("matchStarted", onMatchStarted);
    socket.on("state", onState);
    socket.on("gameOver", onGameOver);
    socket.on("error", onCustomError); // server emits custom 'error'
    socket.on("profile", onProfile);

    return (): void => {
      socket.off("waiting", onWaiting);
      socket.off("matchStarted", onMatchStarted);
      socket.off("state", onState);
      socket.off("gameOver", onGameOver);
      socket.off("error", onCustomError);
      socket.off("profile", onProfile);
    };
  }, [socket, gameId]);

  // Actions
  const canJoin = connected && phase === "idle" && name.trim().length > 0;
  const joinQueue = () => socket?.emit("join", { name: name.trim() || undefined });

  const makeMove = (idx: number) => {
    if (!yourTurn) return;
    if (board[idx] !== "") return;
    socket?.emit("move", { gameId, index: idx });
  };

  const playAgain = () => {
    // Reset and rejoin queue com o mesmo nome
    setBoard(Array<Cell>(9).fill(""));
    setResult(null);
    setPhase("idle");
    setTurn("X");
    setYouAre(null);
    setOpponent("");
    setGameId("");
    setTimeout(() => joinQueue(), 50);
  };

  // UI Components
  const StatusBadge = () => {
    if (phase === "waiting")
      return (
        <div className="inline-flex items-center gap-2 rounded-full bg-yellow-100 text-yellow-800 px-3 py-1 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
          </span>
          Procurando partida…
        </div>
      );

    if (phase === "playing") {
      const yourTurnBadge = yourTurn
        ? "bg-emerald-100 text-emerald-800"
        : "bg-slate-100 text-slate-700";
      return (
        <div
          className={classNames(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm",
            yourTurnBadge
          )}
        >
          {yourTurn ? "Sua vez" : `Vez de ${turn}`}
        </div>
      );
    }

    if (phase === "gameover") {
      const text =
        result === "draw"
          ? "Empate!"
          : result === youAre
          ? "Você venceu!"
          : "Você perdeu!";
      const style =
        result === "draw"
          ? "bg-slate-100 text-slate-700"
          : result === youAre
          ? "bg-emerald-100 text-emerald-800"
          : "bg-rose-100 text-rose-800";
      return (
        <div
          className={classNames(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm",
            style
          )}
        >
          {text}
        </div>
      );
    }

    return null;
  };

  // Para exibir algo útil quando same-origin
  const displayServer = serverUrl ? `(${serverUrl})` : "(load balance)";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/80 border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-2xl bg-slate-900 text-white grid place-items-center font-bold">
              #
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Jogo da Velha</h1>
            {/* Chip de Instância */}
            <span className="ml-2 rounded-lg bg-slate-100 text-slate-700 px-2 py-0.5 text-sm">
              Servidor da Partida:{" "}
              <span className="font-mono font-semibold">{instanceId}</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span
              className={classNames(
                "inline-block h-2 w-2 rounded-full",
                connected ? "bg-emerald-500" : "bg-rose-500"
              )}
            ></span>
            {connected ? "Conectado" : "Desconectado"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 grid lg:grid-cols-3 gap-6">
        {/* Left: Controls (apenas o card principal) */}
        <section className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="textbase font-semibold mb-3">Conexão</h2>
            <label className="block text-xs text-slate-500 mb-1">Ponto de entrada:</label>
            <input
              value={displayServer}
              readOnly
              disabled
              className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-600 text-sm cursor-default select-text"
              title="URL do servidor (vazio = mesma origem)"
            />
            {connError && (
              <p className="mt-2 text-xs text-rose-600">{connError}</p>
            )}

            <div className="h-px bg-slate-200 my-4" />

            <h2 className="text-base font-semibold mb-2">Entrar na fila</h2>
            <label className="block text-xs text-slate-500 mb-1">Seu nome:</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border-slate-300 focus:border-slate-400 focus:ring-slate-300 text-sm"
              placeholder="..."
            />

            <button
              onClick={joinQueue}
              disabled={!canJoin}
              className={classNames(
                "mt-3 w-full rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition",
                canJoin
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed"
              )}
            >
              {phase === "idle" ? "Entrar e procurar partida" : "Aguardando…"}
            </button>

            <div className="mt-3">
              <StatusBadge />
            </div>

            {phase === "gameover" && (
              <button
                onClick={playAgain}
                className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                Jogar novamente
              </button>
            )}

            {/* Player Stats */}
            {profile?.stats && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold mb-2">Seus resultados:</h3>
                <dl className="text-sm text-slate-700 space-y-1">
                  <div className="flex justify-between space-x-3">
                    <dt>Vitórias</dt>
                    <dd className="font-mono">{profile.stats.wins}</dd>
                  </div>
                  <div className="flex justify-between space-x-3">
                    <dt>Derrotas</dt>
                    <dd className="font-mono">{profile.stats.losses}</dd>
                  </div>
                  <div className="flex justify-between space-x-3">
                    <dt>Empates</dt>
                    <dd className="font-mono">{profile.stats.draws}</dd>
                  </div>
                  <div className="flex justify-between space-x-3">
                    <dt>Total de Partidas</dt>
                    <dd className="font-mono">{profile.stats.games}</dd>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 mt-1">
                    <dt>Pontuação</dt>
                    <dd className="font-mono">{profile.stats.score} pts</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </section>

        {/* Right: Game Board + Sidebar à direita */}
        <section className="lg:col-span-2">
          {/* grid interno: tabuleiro | sidebar */}
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            {/* Coluna 1 — Tabuleiro */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 mx-auto">
                  <div className="rounded-xl bg-slate-100 px-3 py-1 text-sm">
                    <span className="font-semibold">Partida:</span>{" "}
                    {gameId ? `[ ${gameId} ]` : "—"}
                  </div>
                  <div className="rounded-xl bg-slate-100 px-3 py-1 text-sm">
                    <span className="font-semibold">Você:</span> {youAre ?? "—"}
                  </div>
                  <div className="rounded-xl bg-slate-100 px-3 py-1 text-sm">
                    <span className="font-semibold">Oponente:</span>{" "}
                    {opponent || "—"}
                  </div>
                </div>
                {/* <StatusBadge /> */}
              </div>

              {/* Board */}
              <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4 max-w-md mx-auto">
                {board.map((cell, idx) => {
                  const clickable =
                    phase === "playing" && yourTurn && cell === "";
                  return (
                    <button
                      key={idx}
                      onClick={() => makeMove(idx)}
                      disabled={!clickable}
                      className={classNames(
                        "aspect-square rounded-2xl border grid place-items-center text-4xl sm:text-5xl font-black tracking-widest",
                        clickable
                          ? "bg-white border-slate-300 hover:bg-slate-50 hover:border-slate-400"
                          : "bg-slate-50 border-slate-200"
                      )}
                      aria-label={`casa ${idx + 1}`}
                    >
                      <span
                        className={classNames(
                          cell === "X" && "text-sky-500",
                          cell === "O" && "text-rose-500"
                        )}
                      >
                        {cell}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Turn / Legend */}
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-sky-500 inline-block" /> X
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500 inline-block" /> O
                </div>
                {phase === "playing" && (
                  <div className="ml-auto text-slate-700">
                    {yourTurn ? "Faça sua jogada" : `Aguardando ${turn}`}
                  </div>
                )}
                {phase === "gameover" && (
                  <div className="ml-auto text-slate-700">
                    {result === "draw"
                      ? "Empate."
                      : result === youAre
                      ? "Parabéns, você venceu!"
                      : "Você perdeu, tente novamente."}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna 2 — Sidebar: Ranking + Regras rápidas */}
            <aside className="space-y-6">
              {leaderboard.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">🏆 Ranking</h3>
                    <button
                      onClick={fetchLeaderboard}
                      className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    >
                      atualizar
                    </button>
                  </div>
                  <ol className="text-sm space-y-1 text-slate-700">
                    {leaderboard.map((p, i) => (
                      <li key={p.name} className="flex items-center justify-between">
                        <span className="truncate">
                          <span className="text-slate-400 mr-2 tabular-nums w-5 inline-block text-right">
                            {i + 1}.
                          </span>
                          {p.name}
                        </span>
                        <span className="font-mono">{p.score} pts</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
                <h3 className="text-sm font-semibold mb-2">Regras rápidas</h3>
                <ul className="text-sm list-disc pl-5 space-y-1 text-slate-600">
                  <li>
                    Jogo 1×1. A fila pareia automaticamente assim que houver outro
                    jogador no mesmo servidor.
                  </li>
                  <li>Você joga somente quando for a sua vez.</li>
                  <li>Partidas encerram ao vencer, empatar ou desconectar.</li>
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-slate-500">
        Desenvolvido por <span className="font-semibold">Joniel R. de Oliveira</span>
      </footer>
    </div>
  );
}
