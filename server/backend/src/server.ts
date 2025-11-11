import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';

import {
  addDraw,
  addLoss,
  addWin,
  getLeaderboard,
  getPlayerStats,
  ensurePlayerStats,
} from './db';

// ID curto legível (A-Z, 2-9) – evita 0/O/1/I
function genInstanceId(len = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

const INSTANCE_ID = process.env.INSTANCE_ID || genInstanceId();
const STARTED_AT = new Date().toISOString();
console.log(`[BOOT] INSTANCE_ID=${INSTANCE_ID} started at ${STARTED_AT}`);

type Mark = 'X' | 'O';
type Cell = '' | Mark;

type Player = {
  id: string;
  name: string;
  mark: Mark;
  socket: any;
  gameId?: string;
};

type Game = {
  id: string;
  board: Cell[];
  players: Record<Mark, Player>;
  turn: Mark;
  finished: boolean;
};

// -------------------------------------
// REST endpoints
// -------------------------------------
const app = express();
app.use(express.json());
app.use(cors());

// -------------------------------------
// Router montado em /api
// -------------------------------------
const router = express.Router();

// Healthcheck
router.get('/health', (_req, res): void => {
  res.status(200).json({
    status: 'ok',
    instanceId: INSTANCE_ID,
    uptime: process.uptime(), // segundos desde o boot
    startedAt: STARTED_AT,
    timestamp: new Date().toISOString(),
  });
});

// Info da instância
router.get('/instance', (_req, res): void => {
  res.json({
    instanceId: INSTANCE_ID,
    startedAt: STARTED_AT,
    pid: process.pid,
    hostname: process.env.HOSTNAME || undefined,
  });
});

// Leaderboard TOP 10
router.get('/leaderboard', async (_req, res) => {
  try {
    const top = await getLeaderboard();
    res.json(top);
  } catch (e: any) {
    res.status(500).json({ error: 'Erro ao buscar leaderboard', details: e.message });
  }
});

// Consultar stats de um jogador (não cria)
router.get('/players/:name', async (req, res): Promise<void> => {
  try {
    const name = String(req.params.name || '');
    const stats = await getPlayerStats(name);
    if (!stats) {
      return void res.status(404).json({ message: 'Jogador não encontrado' });
    } 
    return void res.json(stats);
  } catch (e: any) {
    return void res.status(500).json({ error: 'Erro ao ler jogador', details: e.message });
  }
});

// Monta tudo sob /api
app.use('/api', router);

// -------------------------------------

// -------------------------------------
// Socket.IO (path padrão /socket.io/)
// -------------------------------------
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const waitingQueue: Player[] = [];
const games = new Map<string, Game>();

function checkWinner(board: Cell[]): Mark | 'draw' | null {
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
  if (board.every(c => c !== '')) return 'draw';
  return null;
}

function startMatch(p1: Player, p2: Player) {
  const gameId = `g_${p1.id.slice(0,5)}_${p2.id.slice(0,5)}`;
  const X = Math.random() < 0.5 ? p1 : p2;
  const O = X === p1 ? p2 : p1;
  X.mark = 'X'; O.mark = 'O';

  const game: Game = {
    id: gameId,
    board: Array<Cell>(9).fill(''),
    players: { X, O },
    turn: 'X',
    finished: false,
  };
  games.set(gameId, game);
  X.gameId = gameId; O.gameId = gameId;

  X.socket.emit('matchStarted', { gameId, youAre: 'X', opponent: O.name });
  O.socket.emit('matchStarted', { gameId, youAre: 'O', opponent: X.name });
  io.to(X.id).emit('state', { gameId, board: game.board, turn: game.turn });
  io.to(O.id).emit('state', { gameId, board: game.board, turn: game.turn });
}

async function persistResultSafe(game: Game, result: Mark | 'draw') {
  try {
    const nameX = game.players.X.name?.trim() || 'Jogador_X';
    const nameO = game.players.O.name?.trim() || 'Jogador_O';

    if (result === 'draw') {
      await Promise.all([addDraw(nameX), addDraw(nameO)]);
    } else if (result === 'X') {
      await Promise.all([addWin(nameX), addLoss(nameO)]);
    } else if (result === 'O') {
      await Promise.all([addWin(nameO), addLoss(nameX)]);
    }
  } catch (err) {
    console.error('Erro ao persistir placar:', err);
  }
}

io.on('connection', (socket) => {

  // manda o ID da instância pra este cliente
  socket.emit('instance', { instanceId: INSTANCE_ID });

  let player: Player | null = null;

  socket.on('join', async ({ name }) => {
    player = { id: socket.id, name: (name || socket.id), mark: 'X', socket };

    // Obtém stats atuais do jogador (se existir / criar se não existir).
    const stats = await ensurePlayerStats(player.name);
    socket.emit('profile', {
      name: player.name,
      exists: Boolean(stats),
      stats: stats ?? null, // { name, wins, losses, draws, games, score }
    });

    waitingQueue.push(player);
    socket.emit('waiting');

    // matchmaking simples: pareia de 2 em 2
    if (waitingQueue.length >= 2) {
      const p1 = waitingQueue.shift()!;
      const p2 = waitingQueue.shift()!;
      startMatch(p1, p2);
    }
  });

  socket.on('move', ({ gameId, index }): void => {
    const game = games.get(gameId);
    if (!game || game.finished) return;
    if (!player || player.gameId !== gameId) return;

    const mark = player.mark;
    if (game.turn !== mark) {
      socket.emit('error', { message: 'Não é sua vez.' });
      return;
    }
    if (index < 0 || index > 8) {
      socket.emit('error', { message: 'Posição inválida.' });
      return;
    }
    if (game.board[index] !== '') {
      socket.emit('error', { message: 'Casa ocupada.' });
      return;
    }

    game.board[index] = mark;
    game.turn = mark === 'X' ? 'O' : 'X';

    const state = { gameId: game.id, board: game.board, turn: game.turn };
    io.to(game.players.X.id).emit('state', state);
    io.to(game.players.O.id).emit('state', state);

    const res = checkWinner(game.board);
    if (res) {
      game.finished = true;
      const payload = { gameId: game.id, result: res };
      io.to(game.players.X.id).emit('gameOver', payload);
      io.to(game.players.O.id).emit('gameOver', payload);

      // Persistência no MySQL (não bloqueia o fluxo se falhar)
      persistResultSafe(game, res);

      games.delete(game.id);
    }
  });

  socket.on('disconnect', () => {
    // tira da fila (se ainda não tinha sido pareado)
    const idx = waitingQueue.findIndex(p => p.id === socket.id);
    if (idx >= 0) waitingQueue.splice(idx, 1);

    // encerra jogo em andamento (se já estava jogando)
    for (const g of games.values()) {
      const isX = g.players.X.id === socket.id;
      const isO = g.players.O.id === socket.id;
      if (isX || isO) {
        g.finished = true;

        // quem ficou é o vencedor
        const winnerMark: Mark = isX ? 'O' : 'X';
        const winner = isX ? g.players.O : g.players.X;

        // avisa o oponente que permaneceu
        io.to(winner.id).emit('gameOver', { gameId: g.id, result: winnerMark });

        // persiste VITÓRIA do oponente e DERROTA de quem caiu
        (async () => {
          try {
            if (winnerMark === 'X') {
              await Promise.all([
                addWin(g.players.X.name),
                addLoss(g.players.O.name),
              ]);
            } else {
              await Promise.all([
                addWin(g.players.O.name),
                addLoss(g.players.X.name),
              ]);
            }
          } catch (err) {
            console.error('Erro ao persistir vitória por desconexão:', err);
          }
        })();

        games.delete(g.id);
        break;
      }
    }
  });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () =>
  console.log(`Server on ${HOST}:${PORT}`)
);
