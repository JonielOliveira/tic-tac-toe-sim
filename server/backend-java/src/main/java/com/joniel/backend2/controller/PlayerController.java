package com.joniel.backend2.controller;

import com.joniel.backend2.entity.PlayerEntity;
import com.joniel.backend2.service.PlayerStatsService;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/players")
public class PlayerController {

    private final PlayerStatsService playerStatsService;

    public PlayerController(PlayerStatsService playerStatsService) {
        this.playerStatsService = playerStatsService;
    }

    @GetMapping("/{name}")
    public ResponseEntity<?> getPlayer(@PathVariable String name) {
        return playerStatsService.getPlayerStats(name)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Jogador nao encontrado")));
    }
}
