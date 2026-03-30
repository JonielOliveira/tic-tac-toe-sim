package com.joniel.backend2.repository;

import com.joniel.backend2.entity.PlayerEntity;
import jakarta.transaction.Transactional;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlayerRepository extends JpaRepository<PlayerEntity, String> {

    @Query(value = """
            SELECT name, wins, losses, draws, games, score, created_at, updated_at
            FROM players
            ORDER BY score DESC, wins DESC, draws DESC, losses ASC, name ASC
            LIMIT 10
            """, nativeQuery = true)
    List<PlayerEntity> findTop10Leaderboard();

    @Transactional
    @Modifying
    @Query(value = """
            INSERT INTO players (name, wins, losses, draws)
            VALUES (:name, 1, 0, 0)
            ON DUPLICATE KEY UPDATE wins = wins + VALUES(wins)
            """, nativeQuery = true)
    void addWin(@Param("name") String name);

    @Transactional
    @Modifying
    @Query(value = """
            INSERT INTO players (name, wins, losses, draws)
            VALUES (:name, 0, 1, 0)
            ON DUPLICATE KEY UPDATE losses = losses + VALUES(losses)
            """, nativeQuery = true)
    void addLoss(@Param("name") String name);

    @Transactional
    @Modifying
    @Query(value = """
            INSERT INTO players (name, wins, losses, draws)
            VALUES (:name, 0, 0, 1)
            ON DUPLICATE KEY UPDATE draws = draws + VALUES(draws)
            """, nativeQuery = true)
    void addDraw(@Param("name") String name);

    @Transactional
    @Modifying
    @Query(value = """
            INSERT INTO players (name, wins, losses, draws)
            VALUES (:name, 0, 0, 0)
            ON DUPLICATE KEY UPDATE name = VALUES(name)
            """, nativeQuery = true)
    void ensurePlayer(@Param("name") String name);
}
