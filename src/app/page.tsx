"use client";

import { Chess, type Square } from "chess.js";
import { useEffect, useRef, useState } from "react";

const LANGUAGES = [
  ["en-IN", "English"], ["hi-IN", "हिन्दी"], ["ta-IN", "தமிழ்"], ["te-IN", "తెలుగు"],
  ["bn-IN", "বাংলা"], ["kn-IN", "ಕನ್ನಡ"], ["ml-IN", "മലയാളം"], ["mr-IN", "मराठी"],
  ["gu-IN", "ગુજરાતી"], ["pa-IN", "ਪੰਜਾਬੀ"], ["od-IN", "ଓଡ଼ିଆ"],
];
const PIECES: Record<string, string> = { wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙", bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟" };
const FILES = "abcdefgh";

export default function Home() {
  const game = useRef(new Chess());
  const recorder = useRef<MediaRecorder | null>(null);
  const activeAudio = useRef<{ audio: HTMLAudioElement; cancel: () => void } | null>(null);
  const [fen, setFen] = useState(game.current.fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Your move. Say or type a move like “knight to f3”.");
  const [error, setError] = useState("");

  useEffect(() => () => { activeAudio.current?.cancel(); }, []);

  function refresh() {
    setFen(game.current.fen());
    setMoves(game.current.history());
  }

  async function speak(text: string) {
    activeAudio.current?.cancel();
    try {
      const response = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Voice output failed.");
      if (!data.audio) return;

      const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          audio.onended = null;
          audio.onerror = null;
          if (activeAudio.current?.audio === audio) activeAudio.current = null;
          resolve();
        };
        activeAudio.current = { audio, cancel: () => { audio.pause(); finish(); } };
        audio.onended = finish;
        audio.onerror = finish;
        void audio.play().catch(finish);
      });
    } catch (cause) {
      setError(cause instanceof Error ? `Narration unavailable: ${cause.message}` : "Narration unavailable.");
    }
  }

  async function takeTurn(transcript: string) {
    if (!transcript.trim() || busy || game.current.isGameOver()) return;
    setBusy(true);
    setError("");
    try {
      const legalMoves = game.current.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
      const parsedResponse = await fetch("/api/move", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, legalMoves, language }),
      });
      const parsed = await parsedResponse.json();
      if (!parsedResponse.ok) throw new Error(parsed.error || "Could not understand that move.");
      if (!parsed.move) throw new Error(parsed.say || "I could not identify a legal move. Try saying the piece and square.");

      const playerMove = game.current.move({ from: parsed.move.slice(0, 2) as Square, to: parsed.move.slice(2, 4) as Square, ...(parsed.move.length === 5 ? { promotion: parsed.move[4] } : {}) });
      if (!playerMove) throw new Error("That move is not legal. Try another move.");
      refresh();
      setInput("");
      if (game.current.isGameOver()) {
        const end = game.current.isCheckmate() ? "Checkmate. You win!" : "The game is a draw.";
        setStatus(end);
        await speak(`${parsed.say || `You played ${playerMove.san}.`} ${end}`);
        return;
      }

      setStatus(`You played ${playerMove.san}. The opponent is thinking…`);
      if (parsed.say) await speak(parsed.say);
      const replies = game.current.moves({ verbose: true });
      const reply = replies[Math.floor(Math.random() * replies.length)];
      const engineMove = game.current.move({ from: reply.from, to: reply.to, ...(reply.promotion ? { promotion: reply.promotion } : {}) });
      if (!engineMove) throw new Error("The opponent could not make a move.");
      refresh();
      const gameEnded = game.current.isGameOver();
      const endMessage = game.current.isCheckmate() ? "Checkmate." : "The game is a draw.";
      const engineText = gameEnded ? `I play ${engineMove.san}. ${endMessage}` : `I play ${engineMove.san}. Your turn.`;
      setStatus(gameEnded ? endMessage : `Opponent played ${engineMove.san}. Your move.`);
      await speak(engineText);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setStatus("Your move.");
    } finally {
      setBusy(false);
    }
  }

  async function recordMove() {
    setError("");
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Audio recording is not supported in this browser. Type your move instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      recorder.current = mediaRecorder;
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setBusy(true);
        try {
          const form = new FormData();
          form.append("file", new Blob(chunks, { type: mimeType }), "move.webm");
          form.append("language", language);
          const response = await fetch("/api/stt", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Speech recognition failed.");
          setInput(data.transcript);
          await takeTurn(data.transcript);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Speech recognition failed.");
          setBusy(false);
        }
      };
      mediaRecorder.start();
      setRecording(true);
      setStatus("Listening… say one move, then press Stop listening.");
    } catch {
      setError("Microphone permission was denied. You can type your move instead.");
    }
  }

  function newGame() {
    game.current = new Chess();
    refresh();
    setError("");
    setStatus("New game. Your move as White.");
    setInput("");
  }

  const board = game.current.board();
  const history = moves;

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Blindfold Chess home"><span className="brand-mark">♞</span> BLINDFOLD<span className="brand-light">.CHESS</span></a>
        <div className="topbar-right"><span className="live-dot" /> SARVAM VOICE AI <span className="top-separator">/</span> <span>SOLO PRACTICE</span></div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span>01</span> TRAIN YOUR MIND’S EYE</div>
        <h1>Chess, without<br /><em>looking.</em></h1>
        <p className="hero-copy">Listen to the position. Speak your moves. Let imagination take the board.</p>
      </section>

      <section className="game-layout" aria-label="Blindfold chess game">
        <div className="board-column">
          <div className="board-heading"><div><span className="section-kicker">THE POSITION</span><h2>Board in your mind</h2></div><span className="round-tag"><i /> {fen.split(" ")[1] === "w" ? "WHITE TO MOVE" : "BLACK TO MOVE"}</span></div>
          <div className="board-frame">
            <div className={`chessboard ${revealed ? "revealed" : "blurred"}`} aria-label={revealed ? "Chess board revealed" : "Chess board hidden for blindfold play"}>
              {board.map((row, rowIndex) => row.map((piece, colIndex) => {
                const square = `${FILES[colIndex]}${8 - rowIndex}`;
                const light = (rowIndex + colIndex) % 2 === 0;
                return <div key={square} className={`square ${light ? "light-square" : "dark-square"}`} aria-hidden="true">
                  {piece && <span className={`piece ${piece.color === "w" ? "white-piece" : "black-piece"}`}>{PIECES[`${piece.color}${piece.type}`]}</span>}
                  {colIndex === 0 && <span className="rank-coordinate">{8 - rowIndex}</span>}
                  {rowIndex === 7 && <span className="file-coordinate">{FILES[colIndex]}</span>}
                </div>;
              }))}
            </div>
            {!revealed && <div className="blindfold-overlay"><span className="eye-icon">◉</span><strong>Position concealed</strong><span>Your board is being held in memory.</span></div>}
          </div>
          <div className="board-controls">
            <button className={`text-button ${revealed ? "active" : ""}`} onClick={() => setRevealed(!revealed)}>{revealed ? "◉  Hide board" : "◉  Peek at board"}</button>
            <button className="text-button" onClick={newGame} disabled={busy || recording}>↻  New game</button>
            <span className="board-note">{fen.split(" ")[1] === "w" ? "White" : "Black"} to play · {history.length} half-moves</span>
          </div>
        </div>

        <aside className="play-panel">
          <div className="panel-heading"><div><span className="section-kicker">YOUR TURN</span><h2>Make a move</h2></div><span className="turn-icon">♔</span></div>
          <p className="panel-description">Say a move naturally, or type it in English notation. The board stays hidden while you play.</p>
          <label className="field-label" htmlFor="language">VOICE LANGUAGE</label>
          <div className="select-wrap"><select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGES.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select><span>⌄</span></div>
          <button className={`mic-button ${recording ? "recording" : ""}`} onClick={recordMove} disabled={busy && !recording}>
            <span className="mic-glyph">{recording ? "■" : "♩"}</span><span>{recording ? "Stop listening" : busy ? "One moment…" : "Speak your move"}</span><span className="mic-shortcut">{recording ? "REC" : "MIC"}</span>
          </button>
          <div className="or-divider"><span /> OR TYPE A MOVE <span /></div>
          <form className="move-form" onSubmit={(event) => { event.preventDefault(); void takeTurn(input); }}>
            <input aria-label="Type a chess move" value={input} onChange={(event) => setInput(event.target.value)} placeholder="e.g. knight to f3" disabled={busy || recording} />
            <button aria-label="Submit move" type="submit" disabled={busy || !input.trim()}>↗</button>
          </form>
          <div className="status-box" role="status"><span className="status-mark">✳</span><p>{status}</p></div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="move-history"><div className="history-heading"><span className="section-kicker">MOVE LOG</span><span>{Math.ceil(history.length / 2)} TURNS</span></div>
            {history.length === 0 ? <p className="empty-history">The game begins when you do.</p> : <ol>{Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><b>{history[index * 2]}</b><b>{history[index * 2 + 1] ?? "—"}</b></li>)}</ol>}
          </div>
          <div className="engine-note"><span>✦</span> Powered by Sarvam Saaras · Bulbul · 105B</div>
        </aside>
      </section>

      <footer><span>BLINDFOLD CHESS CLUB</span><span>ONE BOARD. ALL IN YOUR HEAD.</span><span>EST. 2025</span></footer>
    </main>
  );
}