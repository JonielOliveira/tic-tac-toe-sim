package com.joniel.backend2.controller;

import com.joniel.backend2.entity.PlayerEntity;
import com.joniel.backend2.service.PlayerStatsService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class LeaderboardController {

    private final PlayerStatsService playerStatsService;

    public LeaderboardController(PlayerStatsService playerStatsService) {
        this.playerStatsService = playerStatsService;
    }

    @GetMapping("/leaderboard")
    public List<PlayerEntity> leaderboard() {
        return playerStatsService.getLeaderboard();
    }
}
