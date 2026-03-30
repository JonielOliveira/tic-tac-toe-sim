package com.joniel.backend2.model;

import java.util.ArrayList;
import java.util.List;

public class GameSession {

    private final String id;
    private final List<String> board;
    private final PlayerSession playerX;
    private final PlayerSession playerO;
    private Mark turn;
    private boolean finished;

    public GameSession(String id, PlayerSession playerX, PlayerSession playerO) {
        this.id = id;
        this.playerX = playerX;
        this.playerO = playerO;
        this.board = new ArrayList<>(List.of("", "", "", "", "", "", "", "", ""));
        this.turn = Mark.X;
        this.finished = false;
    }

    public String getId() {
        return id;
    }

    public List<String> getBoard() {
        return board;
    }

    public PlayerSession getPlayerX() {
        return playerX;
    }

    public PlayerSession getPlayerO() {
        return playerO;
    }

    public Mark getTurn() {
        return turn;
    }

    public void setTurn(Mark turn) {
        this.turn = turn;
    }

    public boolean isFinished() {
        return finished;
    }

    public void setFinished(boolean finished) {
        this.finished = finished;
    }
}
