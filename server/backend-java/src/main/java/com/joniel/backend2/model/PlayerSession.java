package com.joniel.backend2.model;

import com.corundumstudio.socketio.SocketIOClient;

public class PlayerSession {

    private final String id;
    private final String name;
    private final SocketIOClient client;
    private Mark mark;
    private String gameId;

    public PlayerSession(String id, String name, SocketIOClient client) {
        this.id = id;
        this.name = name;
        this.client = client;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public SocketIOClient getClient() {
        return client;
    }

    public Mark getMark() {
        return mark;
    }

    public void setMark(Mark mark) {
        this.mark = mark;
    }

    public String getGameId() {
        return gameId;
    }

    public void setGameId(String gameId) {
        this.gameId = gameId;
    }
}
