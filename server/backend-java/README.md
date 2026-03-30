# backend2

Backend equivalente ao `server/backend`, reescrito em Java 17 com Spring Boot.

## Estrutura

- `entity`: mapeamento JPA da tabela `players`
- `repository`: consultas e upserts no MySQL
- `service`: regras de leaderboard, instancia e partidas em memoria
- `controller`: endpoints REST em `/api`

## Endpoints REST

- `GET /api/health`
- `GET /api/instance`
- `GET /api/leaderboard`
- `GET /api/players/{name}`

## Socket.IO

Eventos implementados:

- servidor -> cliente: `instance`, `profile`, `waiting`, `matchStarted`, `state`, `gameOver`, `error`
- cliente -> servidor: `join`, `move`

Observacao: nesta implementacao o Socket.IO roda em uma porta separada da API HTTP.

- API REST: `PORT` (padrao `3000`)
- Socket.IO: `SOCKET_PORT` (padrao `3001`)

## Rodar localmente

```bash
mvn spring-boot:run
```

## Variaveis de ambiente

- `PORT`
- `HOST`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `INSTANCE_ID`
- `SOCKET_HOST`
- `SOCKET_PORT`
- `SOCKET_ORIGIN`
