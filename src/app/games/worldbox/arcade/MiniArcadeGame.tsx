"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { arcadeById } from "@/lib/worldbox/activity/arcade";
import { getWebGame } from "@/lib/games-catalog";

interface Props {
  gameId: string;
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 680,
  margin: "0 auto",
};

const barStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(30,41,59,0.7)",
  border: "1px solid rgba(148,163,184,0.22)",
};

const pillBtn = (active = false): React.CSSProperties => ({
  minHeight: 34,
  padding: "6px 12px",
  borderRadius: 8,
  border: active ? "1px solid #38bdf8" : "1px solid rgba(148,163,184,0.28)",
  background: active ? "rgba(56,189,248,0.22)" : "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
});

function useArcadeEconomy(gameId: string) {
  const [stake, setStake] = useState(100);
  const [activeStake, setActiveStake] = useState<number | null>(null);
  const [resultMsg, setResultMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const startMatch = useCallback(
    async (customStake?: number) => {
      const s = customStake ?? stake;
      setBusy(true);
      setResultMsg("");
      try {
        const res = await fetch("/api/worldbox/arcade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", gameId, stake: s }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setResultMsg(
            j.error === "insufficient_funds"
              ? "コイン不足のため無料モードで起動しました"
              : "練習モードで起動しました",
          );
          setActiveStake(0);
          return true;
        }
        setActiveStake(s);
        return true;
      } catch {
        setActiveStake(0);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [gameId, stake],
  );

  const finishMatch = useCallback(
    async (won: boolean, draw = false, mult = 1.9) => {
      const s = activeStake ?? 0;
      setActiveStake(null);
      try {
        const res = await fetch("/api/worldbox/arcade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finish", gameId, stake: s, won, draw, mult }),
        });
        const j = (await res.json().catch(() => ({}))) as { payout?: number };
        if (won && (j.payout ?? 0) > 0) {
          setResultMsg(`[勝利] 賞金 +¥${Number(j.payout).toLocaleString()} を獲得`);
        } else if (draw && s > 0) {
          setResultMsg(`[引分] 参加費 ¥${s.toLocaleString()} を返却しました`);
        } else if (won) {
          setResultMsg("[クリア] 素晴らしいプレイでした");
        } else {
          setResultMsg("[惜敗] もう一回チャレンジしよう");
        }
      } catch {
        setResultMsg(won ? "[勝利]" : "終了しました");
      }
    },
    [activeStake, gameId],
  );

  return { stake, setStake, activeStake, resultMsg, setResultMsg, busy, startMatch, finishMatch };
}

/* ---------------- 1. Reversi 6x6 Mini AI ---------------- */
const DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function flipsFor(board: number[][], r: number, c: number, color: number): [number, number][] {
  if (board[r][c] !== 0) return [];
  const out: [number, number][] = [];
  for (const [dr, dc] of DIRS) {
    const line: [number, number][] = [];
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < 6 && cc >= 0 && cc < 6 && board[rr][cc] === -color) {
      line.push([rr, cc]);
      rr += dr;
      cc += dc;
    }
    if (line.length > 0 && rr >= 0 && rr < 6 && cc >= 0 && cc < 6 && board[rr][cc] === color) {
      out.push(...line);
    }
  }
  return out;
}

function ReversiGame({ gameId }: Props) {
  const econ = useArcadeEconomy(gameId);
  const initBoard = () => {
    const b = Array.from({ length: 6 }, () => Array(6).fill(0) as number[]);
    b[2][2] = -1;
    b[2][3] = 1;
    b[3][2] = 1;
    b[3][3] = -1;
    return b;
  };
  const [board, setBoard] = useState<number[][]>(initBoard);
  const [running, setRunning] = useState(false);

  const counts = board.flat().reduce(
    (acc, v) => {
      if (v === 1) acc.p += 1;
      if (v === -1) acc.cpu += 1;
      return acc;
    },
    { p: 0, cpu: 0 },
  );

  const start = async () => {
    setBoard(initBoard());
    setRunning(true);
    await econ.startMatch();
  };

  const validMovesFor = (b: number[][], col: number) => {
    const res: { r: number; c: number; f: [number, number][] }[] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const f = flipsFor(b, r, c, col);
        if (f.length > 0) res.push({ r, c, f });
      }
    }
    return res;
  };

  const playCell = (r: number, c: number) => {
    if (!running) return;
    const f = flipsFor(board, r, c, 1);
    if (f.length === 0) return;
    const next = board.map((row) => [...row]);
    next[r][c] = 1;
    for (const [fr, fc] of f) next[fr][fc] = 1;

    // CPU turn (greedily picks corner or max flips)
    let cpuMoves = validMovesFor(next, -1);
    if (cpuMoves.length > 0) {
      cpuMoves.sort((a, b) => {
        const cornerA = (a.r === 0 || a.r === 5) && (a.c === 0 || a.c === 5) ? 5 : 0;
        const cornerB = (b.r === 0 || b.r === 5) && (b.c === 0 || b.c === 5) ? 5 : 0;
        return b.f.length + cornerB - (a.f.length + cornerA);
      });
      const mv = cpuMoves[0];
      next[mv.r][mv.c] = -1;
      for (const [fr, fc] of mv.f) next[fr][fc] = -1;
    }

    setBoard(next);
    const pLeft = validMovesFor(next, 1).length;
    cpuMoves = validMovesFor(next, -1);
    if (pLeft === 0 && cpuMoves.length === 0) {
      const pCount = next.flat().filter((v) => v === 1).length;
      const cpuCount = next.flat().filter((v) => v === -1).length;
      setRunning(false);
      void econ.finishMatch(pCount > cpuCount, pCount === cpuCount, 2.0);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={barStyle}>
        <span>
          ● あなた: {counts.p} / ○ CPU: {counts.cpu}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[0, 100, 300].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => econ.setStake(s)}
              style={pillBtn(econ.stake === s)}
            >
              {s === 0 ? "無料" : `¥${s}`}
            </button>
          ))}
          <button type="button" onClick={start} disabled={econ.busy} style={pillBtn(true)}>
            {running ? "リスタート" : "対局開始"}
          </button>
        </div>
      </div>
      {econ.resultMsg && <div style={{ fontWeight: 700, color: "#38bdf8" }}>{econ.resultMsg}</div>}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 46px)",
          gap: 4,
          margin: "0 auto",
          padding: 8,
          background: "#065f46",
          borderRadius: 10,
        }}
      >
        {board.map((row, r) =>
          row.map((val, c) => {
            const can = running && flipsFor(board, r, c, 1).length > 0;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => playCell(r, c)}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: can ? "rgba(52,211,153,0.35)" : "rgba(6,78,59,0.9)",
                  display: "grid",
                  placeItems: "center",
                  cursor: can ? "pointer" : "default",
                }}
              >
                {val !== 0 && (
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: val === 1 ? "#0f172a" : "#f8fafc",
                      border: "2px solid rgba(255,255,255,0.4)",
                      display: "block",
                    }}
                  />
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

/* ---------------- 2. Connect 4 ---------------- */
function Connect4Game({ gameId }: Props) {
  const econ = useArcadeEconomy(gameId);
  const ROWS = 6;
  const COLS = 7;
  const [grid, setGrid] = useState<number[][]>(() =>
    Array.from({ length: ROWS }, () => Array(COLS).fill(0) as number[]),
  );
  const [running, setRunning] = useState(false);

  const checkWin = (g: number[][], who: number) => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (g[r][c] !== who) continue;
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
          [1, 1],
          [1, -1],
        ]) {
          let n = 1;
          for (let k = 1; k < 4; k++) {
            const nr = r + dr * k;
            const nc = c + dc * k;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc] === who) n++;
          }
          if (n >= 4) return true;
        }
      }
    }
    return false;
  };

  const dropInCol = (g: number[][], c: number, who: number): boolean => {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (g[r][c] === 0) {
        g[r][c] = who;
        return true;
      }
    }
    return false;
  };

  const start = async () => {
    setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(0) as number[]));
    setRunning(true);
    await econ.startMatch();
  };

  const playCol = (c: number) => {
    if (!running) return;
    const next = grid.map((r) => [...r]);
    if (!dropInCol(next, c, 1)) return;
    if (checkWin(next, 1)) {
      setGrid(next);
      setRunning(false);
      void econ.finishMatch(true, false, 1.9);
      return;
    }
    // CPU picks center or valid col
    const avail = [3, 2, 4, 1, 5, 0, 6].filter((col) => next[0][col] === 0);
    if (avail.length > 0) {
      const pick = avail[Math.floor(Math.random() * Math.min(3, avail.length))];
      dropInCol(next, pick, -1);
      if (checkWin(next, -1)) {
        setGrid(next);
        setRunning(false);
        void econ.finishMatch(false, false, 1.9);
        return;
      }
    }
    setGrid(next);
    if (next[0].every((v) => v !== 0)) {
      setRunning(false);
      void econ.finishMatch(false, true, 1.9);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={barStyle}>
        <span>4つ並べた方の勝ち！（赤: あなた / 黄: CPU）</span>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 100, 300].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => econ.setStake(s)}
              style={pillBtn(econ.stake === s)}
            >
              {s === 0 ? "無料" : `¥${s}`}
            </button>
          ))}
          <button type="button" onClick={start} disabled={econ.busy} style={pillBtn(true)}>
            {running ? "やり直す" : "スタート"}
          </button>
        </div>
      </div>
      {econ.resultMsg && <div style={{ fontWeight: 700, color: "#38bdf8" }}>{econ.resultMsg}</div>}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 42px)",
          gap: 5,
          margin: "0 auto",
          padding: 10,
          borderRadius: 12,
          background: "#1d4ed8",
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              onClick={() => playCol(c)}
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.22)",
                background: cell === 1 ? "#ef4444" : cell === -1 ? "#facc15" : "#0f172a",
                cursor: running ? "pointer" : "default",
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}

/* ---------------- 3. Calc / Type Sprint Game ---------------- */
function CalcOrTypeSprint({ gameId }: Props) {
  const econ = useArcadeEconomy(gameId);
  const isType = gameId === "typerace";
  const WORDS = ["metro", "worldbox", "robot", "circuit", "credit", "station", "economy", "guild"];
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [prompt, setPrompt] = useState("");
  const [answerTarget, setAnswerTarget] = useState("");
  const [input, setInput] = useState("");

  const nextQ = useCallback(() => {
    if (isType) {
      const w = WORDS[Math.floor(Math.random() * WORDS.length)];
      setPrompt(w);
      setAnswerTarget(w);
    } else {
      const a = 4 + Math.floor(Math.random() * 18);
      const b = 3 + Math.floor(Math.random() * 15);
      setPrompt(`${a} + ${b} = ?`);
      setAnswerTarget(String(a + b));
    }
    setInput("");
  }, [isType]);

  useEffect(() => {
    if (!running) return;
    if (timeLeft <= 0) {
      setRunning(false);
      void econ.finishMatch(score >= 6, score === 5, 2.0);
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [running, timeLeft, score, econ]);

  const start = async () => {
    setScore(0);
    setTimeLeft(20);
    nextQ();
    setRunning(true);
    await econ.startMatch();
  };

  const handleChange = (val: string) => {
    setInput(val);
    if (val.trim() === answerTarget) {
      setScore((s) => s + 1);
      nextQ();
    }
  };

  return (
    <div style={cardStyle}>
      <div style={barStyle}>
        <span>
          スコア: {score} / 目標 6問（残り {timeLeft}秒）
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 100, 300].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => econ.setStake(s)}
              style={pillBtn(econ.stake === s)}
            >
              {s === 0 ? "無料" : `¥${s}`}
            </button>
          ))}
          <button type="button" onClick={start} style={pillBtn(true)}>
            スタート
          </button>
        </div>
      </div>
      {econ.resultMsg && <div style={{ fontWeight: 700, color: "#38bdf8" }}>{econ.resultMsg}</div>}
      <div style={{ textAlign: "center", padding: "20px 10px" }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
          {running ? prompt : "「スタート」で挑戦！"}
        </div>
        <input
          value={input}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!running}
          placeholder={isType ? "同じ単語を入力" : "答えの数字を入力"}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 18,
            width: 220,
            textAlign: "center",
            background: "rgba(15,23,42,0.8)",
            color: "#fff",
            border: "1px solid rgba(148,163,184,0.35)",
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- 4. Stop Battle & Speed Timing ---------------- */
function TimingReflexGame({ gameId }: Props) {
  const econ = useArcadeEconomy(gameId);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const targetMs = 5000;
  const startRef = useRef(0);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 40);
    return () => clearInterval(id);
  }, [phase]);

  const start = async () => {
    startRef.current = Date.now();
    setElapsed(0);
    setPhase("running");
    await econ.startMatch();
  };

  const stop = () => {
    if (phase !== "running") return;
    const diff = Math.abs(Date.now() - startRef.current - targetMs);
    setPhase("done");
    void econ.finishMatch(diff <= 450, diff <= 700, 2.2);
  };

  return (
    <div style={cardStyle}>
      <div style={barStyle}>
        <span>目標: ピッタリ 5.00秒（±0.45秒以内で勝利！）</span>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 100, 300].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => econ.setStake(s)}
              style={pillBtn(econ.stake === s)}
            >
              {s === 0 ? "無料" : `¥${s}`}
            </button>
          ))}
        </div>
      </div>
      {econ.resultMsg && <div style={{ fontWeight: 700, color: "#38bdf8" }}>{econ.resultMsg}</div>}
      <div style={{ textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 42, fontWeight: 800, fontFamily: "monospace", marginBottom: 16 }}>
          {(elapsed / 1000).toFixed(2)}s
        </div>
        {phase !== "running" ? (
          <button type="button" onClick={start} style={pillBtn(true)}>
            計測スタート
          </button>
        ) : (
          <button type="button" onClick={stop} style={{ ...pillBtn(true), background: "#ef4444" }}>
            ここでストップ！
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- 5. Universal Card/Tactical High-Low Duel for Party & Strategy Cabinets ---------------- */
function MetroCardCabinetGame({ gameId }: Props) {
  const econ = useArcadeEconomy(gameId);
  const game = getWebGame(gameId);
  const [round, setRound] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [currentCard, setCurrentCard] = useState(7);
  const [nextCard, setNextCard] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const start = async () => {
    setRound(1);
    setPlayerScore(0);
    setCpuScore(0);
    setCurrentCard(2 + Math.floor(Math.random() * 11));
    setNextCard(null);
    setRunning(true);
    await econ.startMatch();
  };

  const guess = (higher: boolean) => {
    if (!running) return;
    const nxt = 1 + Math.floor(Math.random() * 13);
    setNextCard(nxt);
    const winRound = higher ? nxt >= currentCard : nxt <= currentCard;
    const nextP = playerScore + (winRound ? 1 : 0);
    const nextC = cpuScore + (winRound ? 0 : 1);
    setPlayerScore(nextP);
    setCpuScore(nextC);
    setCurrentCard(nxt);

    if (round >= 5) {
      setRunning(false);
      void econ.finishMatch(nextP > nextC, nextP === nextC, 1.9);
    } else {
      setRound((r) => r + 1);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={barStyle}>
        <span>
          {game?.title ?? gameId}（全5ラウンド）| あなた {playerScore} - {cpuScore} CPU
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 100, 300].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => econ.setStake(s)}
              style={pillBtn(econ.stake === s)}
            >
              {s === 0 ? "無料" : `¥${s}`}
            </button>
          ))}
          <button type="button" onClick={start} style={pillBtn(true)}>
            {running ? "リセット" : "プレイ開始"}
          </button>
        </div>
      </div>
      {game?.description && (
        <p style={{ margin: 0, opacity: 0.78, fontSize: 12 }}>{game.description}</p>
      )}
      {econ.resultMsg && <div style={{ fontWeight: 700, color: "#38bdf8" }}>{econ.resultMsg}</div>}
      <div
        style={{
          textAlign: "center",
          padding: 16,
          background: "rgba(15,23,42,0.7)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7 }}>現在の数値カード（1〜13）</div>
        <div style={{ fontSize: 44, fontWeight: 900, margin: "8px 0" }}>{currentCard}</div>
        {nextCard !== null && (
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>直前の出目: {nextCard}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            disabled={!running}
            onClick={() => guess(true)}
            style={pillBtn(running)}
          >
            HIGH ▲（以上）
          </button>
          <button
            type="button"
            disabled={!running}
            onClick={() => guess(false)}
            style={pillBtn(running)}
          >
            LOW ▼（以下）
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MiniArcadeGame({ gameId }: Props) {
  const entry = arcadeById(gameId);
  if (!entry) return <p>筐体が見つかりません</p>;
  if (gameId === "reversi") return <ReversiGame gameId={gameId} />;
  if (gameId === "connect4") return <Connect4Game gameId={gameId} />;
  if (gameId === "calcrace" || gameId === "typerace") return <CalcOrTypeSprint gameId={gameId} />;
  if (gameId === "stopbattle") return <TimingReflexGame gameId={gameId} />;
  return <MetroCardCabinetGame gameId={gameId} />;
}
