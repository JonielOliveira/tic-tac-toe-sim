package com.joniel.backend2.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "socketio")
public record SocketIoProperties(
        String host,
        int port,
        String origin
) {
}
