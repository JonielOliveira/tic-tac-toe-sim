package com.joniel.backend2.model;

public record MatchStartedPayload(String gameId, Mark youAre, String opponent) {
}
