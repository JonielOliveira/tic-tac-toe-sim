import mysql from 'mysql2/promise';

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'tictactoe',
} = process.env;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,    // se todas ocupadas, espera em fila
  connectionLimit: 10,         // nº máx. de conexões simultâneas no pool
  queueLimit: 0,               // 0 = fila ilimitada (utilizar com cautela)
});

/** Sanitiza nome para caber no VARCHAR(64) e remover espaços extras */
export function normalizeName(name: string) {
  return (name ?? '').trim().slice(0, 64);
}

export async function addWin(name: string) {
  const n = normalizeName(name);
  if (!n) return;
  await pool.execute(
    `INSERT INTO players (name, wins, losses, draws)
     VALUES (?, 1, 0, 0)
     ON DUPLICATE KEY UPDATE wins = wins + VALUES(wins)`,
    [n]
  );
}

export async function addLoss(name: string) {
  const n = normalizeName(name);
  if (!n) return;
  await pool.execute(
    `INSERT INTO players (name, wins, losses, draws)
     VALUES (?, 0, 1, 0)
     ON DUPLICATE KEY UPDATE losses = losses + VALUES(losses)`,
    [n]
  );
}

export async function addDraw(name: string) {
  const n = normalizeName(name);
  if (!n) return;
  await pool.execute(
    `INSERT INTO players (name, wins, losses, draws)
     VALUES (?, 0, 0, 1)
     ON DUPLICATE KEY UPDATE draws = draws + VALUES(draws)`,
    [n]
  );
}

/** Leaderboard simples (TOP 10) */
export async function getLeaderboard() {
  const [rows] = await pool.query(
    `SELECT
       name,
       wins,
       losses,
       draws,
       games,
       score
     FROM players
     ORDER BY score DESC, wins DESC, draws DESC, losses ASC, name ASC
     LIMIT 10`
  );
  
  return rows as Array<{
    name: string;
    wins: number;
    losses: number;
    draws: number;
    games: number;
    score: number;
  }>;
}

/** Lê as estatísticas do jogador, sem criar se não existir */
export async function getPlayerStats(name: string) {
  const n = normalizeName(name);
  if (!n) return null;

  const [rows] = await pool.query(
    `SELECT name, wins, losses, draws, games, score
       FROM players
      WHERE name = ?
      LIMIT 1`,
    [n]
  );
  const list = rows as Array<{
    name: string; wins: number; losses: number; draws: number; games: number; score: number;
  }>;
  return list[0] ?? null;
}

/** Garante o registro do jogador (cria zerado, se não existir) e retorna as estatísticas */
export async function ensurePlayerStats(name: string) {
  const n = normalizeName(name);
  if (!n) return null;

  // Cria zerado se não existir (não altera se já existir)
  await pool.execute(
    `INSERT INTO players (name, wins, losses, draws)
     VALUES (?, 0, 0, 0)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [n]
  );

  // Retorna consolidado
  return getPlayerStats(n);
}
