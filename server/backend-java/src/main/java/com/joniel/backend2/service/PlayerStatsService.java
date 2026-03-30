package com.joniel.backend2.service;

import com.joniel.backend2.entity.PlayerEntity;
import com.joniel.backend2.repository.PlayerRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlayerStatsService {

    private final PlayerRepository playerRepository;

    public PlayerStatsService(PlayerRepository playerRepository) {
        this.playerRepository = playerRepository;
    }

    public String normalizeName(String name) {
        if (name == null) {
            return "";
        }
        return name.trim().substring(0, Math.min(name.trim().length(), 64));
    }

    public List<PlayerEntity> getLeaderboard() {
        return playerRepository.findTop10Leaderboard();
    }

    public Optional<PlayerEntity> getPlayerStats(String name) {
        String normalized = normalizeName(name);
        if (normalized.isBlank()) {
            return Optional.empty();
        }
        return playerRepository.findById(normalized);
    }

    @Transactional
    public PlayerEntity ensurePlayerStats(String name) {
        String normalized = normalizeName(name);
        if (normalized.isBlank()) {
            return null;
        }
        playerRepository.ensurePlayer(normalized);
        return playerRepository.findById(normalized).orElseThrow();
    }

    @Transactional
    public void addWin(String name) {
        String normalized = normalizeName(name);
        if (!normalized.isBlank()) {
            playerRepository.addWin(normalized);
        }
    }

    @Transactional
    public void addLoss(String name) {
        String normalized = normalizeName(name);
        if (!normalized.isBlank()) {
            playerRepository.addLoss(normalized);
        }
    }

    @Transactional
    public void addDraw(String name) {
        String normalized = normalizeName(name);
        if (!normalized.isBlank()) {
            playerRepository.addDraw(normalized);
        }
    }
}
