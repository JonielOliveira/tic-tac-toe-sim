import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

type Mark = "X" | "O";
type Cell = "" | Mark;

type Player = {
  id: string;          // socket.id
  name: string;
  mark: Mark;
  socket: any;         // Socket
  gameId?: string;
};

type Game = {
  id: string;
  board: Cell[];
  players: Record<Mark, Player>;
  turn: Mark;
  finished: boolean;
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const waitingQueue: Player[] = [];
const games = new Map<string, Game>();

function checkWinner(board: Cell[]): Mark | "draw" | null {
  const lines: Array<[number, number, number]> = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6],         // diags
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a] as Mark;
    }
  }
  if (board.every(c => c !== "")) return "draw";
  return null;
}

function startMatch(p1: Player, p2: Player) {
  const gameId = `g_${p1.id.slice(0,5)}_${p2.id.slice(0,5)}`;
  const X = Math.random() < 0.5 ? p1 : p2;
  const O = X === p1 ? p2 : p1;
  X.mark = "X"; O.mark = "O";

  const game: Game = {
    id: gameId,
    board: Array<Cell>(9).fill(""),
    players: { X, O },
    turn: "X",
    finished: false,
  };
  games.set(gameId, game);
  X.gameId = gameId; O.gameId = gameId;

  X.socket.emit("matchStarted", { gameId, youAre: "X", opponent: O.name });
  O.socket.emit("matchStarted", { gameId, youAre: "O", opponent: X.name });
  io.to(X.id).emit("state", { gameId, board: game.board, turn: game.turn });
  io.to(O.id).emit("state", { gameId, board: game.board, turn: game.turn });
}

io.on("connection", (socket) => {
  let player: Player | null = null;

  socket.on("join", ({ name }) => {
    player = { id: socket.id, name: name || socket.id, mark: "X", socket };
    waitingQueue.push(player);
    socket.emit("waiting");

    // matchmaking simples: pareia de 2 em 2
    if (waitingQueue.length >= 2) {
      const p1 = waitingQueue.shift()!;
      const p2 = waitingQueue.shift()!;
      startMatch(p1, p2);
    }
  });

  socket.on("move", ({ gameId, index }): void => {
    const game = games.get(gameId);
    if (!game || game.finished) return;
    if (!player || player.gameId !== gameId) return;

    const mark = player.mark;
    if (game.turn !== mark) {
        socket.emit("error", { message: "Não é sua vez." });
        return;
    }
    if (index < 0 || index > 8) {
        socket.emit("error", { message: "Posição inválida." });
        return;
    }
    if (game.board[index] !== "") {
        socket.emit("error", { message: "Casa ocupada." });
        return;
    }

    game.board[index] = mark;
    game.turn = mark === "X" ? "O" : "X";

    const state = { gameId: game.id, board: game.board, turn: game.turn };
    io.to(game.players.X.id).emit("state", state);
    io.to(game.players.O.id).emit("state", state);

    const res = checkWinner(game.board);
    if (res) {
      game.finished = true;
      const payload = { gameId: game.id, result: res };
      io.to(game.players.X.id).emit("gameOver", payload);
      io.to(game.players.O.id).emit("gameOver", payload);
      games.delete(game.id);
    }
  });

  socket.on("disconnect", () => {
    // tira da fila
    const idx = waitingQueue.findIndex(p => p.id === socket.id);
    if (idx >= 0) waitingQueue.splice(idx, 1);

    // encerra jogo em andamento
    for (const g of games.values()) {
      if (g.players.X.id === socket.id || g.players.O.id === socket.id) {
        g.finished = true;
        const other = g.players.X.id === socket.id ? g.players.O : g.players.X;
        io.to(other.id).emit("gameOver", { gameId: g.id, result: "draw" });
        games.delete(g.id);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server on :${PORT}`));
