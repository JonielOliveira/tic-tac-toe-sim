-- Estrutura inicial do banco de dados do jogo Tic-Tac-Toe

CREATE DATABASE IF NOT EXISTS tictactoe
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE tictactoe;

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS players (
  name        VARCHAR(64) PRIMARY KEY,
  wins        INT UNSIGNED NOT NULL DEFAULT 0,
  losses      INT UNSIGNED NOT NULL DEFAULT 0,
  draws       INT UNSIGNED NOT NULL DEFAULT 0,

  -- total de partidas
  games       INT UNSIGNED AS (wins + losses + draws) STORED,

  -- pontuação para ranking
  score       INT UNSIGNED AS (3 * wins + draws) STORED,

  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP
);

-- índice para acelerar o ranking
CREATE INDEX idx_leaderboard 
ON players (score DESC, games DESC, wins DESC, draws DESC, losses ASC, name ASC);
