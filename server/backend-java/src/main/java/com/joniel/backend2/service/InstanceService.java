package com.joniel.backend2.service;

import java.security.SecureRandom;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class InstanceService {

    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private final String instanceId;
    private final Instant startedAt;

    public InstanceService(@Value("${app.instance-id:}") String configuredInstanceId) {
        this.startedAt = Instant.now();
        this.instanceId = configuredInstanceId == null || configuredInstanceId.isBlank()
                ? generateInstanceId(4)
                : configuredInstanceId.trim();
    }

    public String getInstanceId() {
        return instanceId;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    private String generateInstanceId(int length) {
        SecureRandom random = new SecureRandom();
        StringBuilder builder = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            builder.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        }
        return builder.toString();
    }
}
