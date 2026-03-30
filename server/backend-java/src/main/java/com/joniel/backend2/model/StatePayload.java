package com.joniel.backend2.model;

import java.util.List;

public record StatePayload(String gameId, List<String> board, Mark turn) {
}
