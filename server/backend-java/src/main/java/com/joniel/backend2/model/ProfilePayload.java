package com.joniel.backend2.model;

import com.joniel.backend2.entity.PlayerEntity;

public record ProfilePayload(String name, boolean exists, PlayerEntity stats) {
}
