package com.joniel.backend2.config;

import com.corundumstudio.socketio.SocketIOServer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SocketIoConfig {

    @Bean(destroyMethod = "stop")
    public SocketIOServer socketIoServer(SocketIoProperties properties) {
        com.corundumstudio.socketio.Configuration configuration = new com.corundumstudio.socketio.Configuration();
        configuration.setHostname(properties.host());
        configuration.setPort(properties.port());
        configuration.setOrigin(properties.origin());
        return new SocketIOServer(configuration);
    }
}
