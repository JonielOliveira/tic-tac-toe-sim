package com.joniel.backend2.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.listener.ConnectListener;
import com.corundumstudio.socketio.listener.DataListener;
import com.corundumstudio.socketio.listener.DisconnectListener;
import com.joniel.backend2.model.ErrorPayload;
import com.joniel.backend2.model.GameOverPayload;
import com.joniel.backend2.model.GameSession;
import com.joniel.backend2.model.InstancePayload;
import com.joniel.backend2.model.JoinRequest;
import com.joniel.backend2.model.Mark;
import com.joniel.backend2.model.MatchStartedPayload;
import com.joniel.backend2.model.MoveRequest;
import com.joniel.backend2.model.PlayerSession;
import com.joniel.backend2.model.ProfilePayload;
import com.joniel.backend2.model.StatePayload;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class GameService {

    private static final Logger LOGGER = LoggerFactory.getLogger(GameService.class);

    private final SocketIOServer socketIoServer;
    private final InstanceService instanceService;
    private final PlayerStatsService playerStatsService;
    private final ConcurrentLinkedQueue<PlayerSession> waitingQueue = new ConcurrentLinkedQueue<>();
    private final Map<String, GameSession> games = new ConcurrentHashMap<>();
    private final Map<UUID, PlayerSession> playersByClient = new ConcurrentHashMap<>();
    private final Object matchmakingLock = new Object();

    public GameService(SocketIOServer socketIoServer,
                       InstanceService instanceService,
                       PlayerStatsService playerStatsService) {
        this.socketIoServer = socketIoServer;
        this.instanceService = instanceService;
        this.playerStatsService = playerStatsService;
    }

    @PostConstruct
    public void init() {
        socketIoServer.addConnectListener(onConnect());
        socketIoServer.addDisconnectListener(onDisconnect());
        socketIoServer.addEventListener("join", JoinRequest.class, onJoin());
        socketIoServer.addEventListener("move", MoveRequest.class, onMove());
        socketIoServer.start();
        LOGGER.info("Socket.IO listening on {}:{}", socketIoServer.getConfiguration().getHostname(), socketIoServer.getConfiguration().getPort());
    }

    @PreDestroy
    public void shutdown() {
        socketIoServer.stop();
    }

    private ConnectListener onConnect() {
        return client -> client.sendEvent("instance", new InstancePayload(instanceService.getInstanceId()));
    }

    private DisconnectListener onDisconnect() {
        return client -> {
            PlayerSession player = playersByClient.remove(client.getSessionId());
            if (player == null) {
                return;
            }

            waitingQueue.removeIf(queued -> queued.getId().equals(player.getId()));

            for (GameSession game : new ArrayList<>(games.values())) {
                boolean isX = game.getPlayerX().getId().equals(player.getId());
                boolean isO = game.getPlayerO().getId().equals(player.getId());
                if (!isX && !isO) {
                    continue;
                }

                game.setFinished(true);
                Mark winnerMark = isX ? Mark.O : Mark.X;
                PlayerSession winner = isX ? game.getPlayerO() : game.getPlayerX();
                winner.getClient().sendEvent("gameOver", new GameOverPayload(game.getId(), winnerMark.name()));
                persistDisconnectResult(game, winnerMark);
                games.remove(game.getId());
                break;
            }
        };
    }

    private DataListener<JoinRequest> onJoin() {
        return (client, data, ackSender) -> {
            String rawName = data == null ? null : data.name();
            String playerName = playerStatsService.normalizeName(rawName);
            if (playerName.isBlank()) {
                playerName = client.getSessionId().toString();
            }

            PlayerSession player = new PlayerSession(client.getSessionId().toString(), playerName, client);
            playersByClient.put(client.getSessionId(), player);

            var stats = playerStatsService.ensurePlayerStats(playerName);
            client.sendEvent("profile", new ProfilePayload(playerName, stats != null, stats));

            waitingQueue.offer(player);
            client.sendEvent("waiting");
            tryStartMatch();
        };
    }

    private DataListener<MoveRequest> onMove() {
        return (client, data, ackSender) -> {
            PlayerSession player = playersByClient.get(client.getSessionId());
            if (player == null || data == null || data.gameId() == null) {
                return;
            }

            GameSession game = games.get(data.gameId());
            if (game == null || game.isFinished() || !data.gameId().equals(player.getGameId())) {
                return;
            }

            Mark mark = player.getMark();
            if (mark == null) {
                return;
            }

            if (game.getTurn() != mark) {
                client.sendEvent("error", new ErrorPayload("Nao e sua vez."));
                return;
            }
            if (data.index() < 0 || data.index() > 8) {
                client.sendEvent("error", new ErrorPayload("Posicao invalida."));
                return;
            }
            if (!game.getBoard().get(data.index()).isEmpty()) {
                client.sendEvent("error", new ErrorPayload("Casa ocupada."));
                return;
            }

            game.getBoard().set(data.index(), mark.name());
            game.setTurn(mark == Mark.X ? Mark.O : Mark.X);

            StatePayload state = new StatePayload(game.getId(), List.copyOf(game.getBoard()), game.getTurn());
            game.getPlayerX().getClient().sendEvent("state", state);
            game.getPlayerO().getClient().sendEvent("state", state);

            String result = checkWinner(game.getBoard());
            if (result != null) {
                game.setFinished(true);
                GameOverPayload payload = new GameOverPayload(game.getId(), result);
                game.getPlayerX().getClient().sendEvent("gameOver", payload);
                game.getPlayerO().getClient().sendEvent("gameOver", payload);
                persistResult(game, result);
                games.remove(game.getId());
            }
        };
    }

    private void tryStartMatch() {
        synchronized (matchmakingLock) {
            while (waitingQueue.size() >= 2) {
                PlayerSession first = waitingQueue.poll();
                PlayerSession second = waitingQueue.poll();
                if (first == null || second == null) {
                    return;
                }
                startMatch(first, second);
            }
        }
    }

    private void startMatch(PlayerSession first, PlayerSession second) {
        boolean firstIsX = Math.random() < 0.5;
        PlayerSession playerX = firstIsX ? first : second;
        PlayerSession playerO = firstIsX ? second : first;

        playerX.setMark(Mark.X);
        playerO.setMark(Mark.O);

        String gameId = "g_" + playerX.getId().substring(0, Math.min(5, playerX.getId().length()))
                + "_" + playerO.getId().substring(0, Math.min(5, playerO.getId().length()));

        GameSession game = new GameSession(gameId, playerX, playerO);
        games.put(gameId, game);
        playerX.setGameId(gameId);
        playerO.setGameId(gameId);

        playerX.getClient().sendEvent("matchStarted", new MatchStartedPayload(gameId, Mark.X, playerO.getName()));
        playerO.getClient().sendEvent("matchStarted", new MatchStartedPayload(gameId, Mark.O, playerX.getName()));

        StatePayload state = new StatePayload(gameId, List.copyOf(game.getBoard()), game.getTurn());
        playerX.getClient().sendEvent("state", state);
        playerO.getClient().sendEvent("state", state);
    }

    private String checkWinner(List<String> board) {
        int[][] lines = {
                {0, 1, 2}, {3, 4, 5}, {6, 7, 8},
                {0, 3, 6}, {1, 4, 7}, {2, 5, 8},
                {0, 4, 8}, {2, 4, 6}
        };

        for (int[] line : lines) {
            String a = board.get(line[0]);
            String b = board.get(line[1]);
            String c = board.get(line[2]);
            if (!a.isEmpty() && a.equals(b) && b.equals(c)) {
                return a;
            }
        }

        boolean full = board.stream().noneMatch(String::isEmpty);
        return full ? "draw" : null;
    }

    private void persistResult(GameSession game, String result) {
        try {
            String nameX = game.getPlayerX().getName();
            String nameO = game.getPlayerO().getName();
            if ("draw".equals(result)) {
                playerStatsService.addDraw(nameX);
                playerStatsService.addDraw(nameO);
            } else if ("X".equals(result)) {
                playerStatsService.addWin(nameX);
                playerStatsService.addLoss(nameO);
            } else if ("O".equals(result)) {
                playerStatsService.addWin(nameO);
                playerStatsService.addLoss(nameX);
            }
        } catch (Exception exception) {
            LOGGER.error("Erro ao persistir placar", exception);
        }
    }

    private void persistDisconnectResult(GameSession game, Mark winnerMark) {
        try {
            if (winnerMark == Mark.X) {
                playerStatsService.addWin(game.getPlayerX().getName());
                playerStatsService.addLoss(game.getPlayerO().getName());
            } else {
                playerStatsService.addWin(game.getPlayerO().getName());
                playerStatsService.addLoss(game.getPlayerX().getName());
            }
        } catch (Exception exception) {
            LOGGER.error("Erro ao persistir vitoria por desconexao", exception);
        }
    }
}
