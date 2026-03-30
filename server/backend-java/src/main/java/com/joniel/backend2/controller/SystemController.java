package com.joniel.backend2.controller;

import com.joniel.backend2.service.InstanceService;
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class SystemController {

    private final InstanceService instanceService;

    public SystemController(InstanceService instanceService) {
        this.instanceService = instanceService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", "ok");
        payload.put("instanceId", instanceService.getInstanceId());
        payload.put("uptime", ManagementFactory.getRuntimeMXBean().getUptime() / 1000.0d);
        payload.put("startedAt", instanceService.getStartedAt());
        payload.put("timestamp", Instant.now());
        return payload;
    }

    @GetMapping("/instance")
    public Map<String, Object> instance() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("instanceId", instanceService.getInstanceId());
        payload.put("startedAt", instanceService.getStartedAt());
        payload.put("pid", ProcessHandle.current().pid());
        payload.put("hostname", System.getenv("HOSTNAME"));
        return payload;
    }
}
