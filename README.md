# tic-tac-toe-sim

Projeto de Jogo da Velha com arquitetura cliente-servidor:
- Frontend em React + Vite (`client/frontend`)
- Backend em Java + Spring Boot (`server/backend-java`)
- Banco MySQL (`database/schema.sql`)

## Pré-requisitos

- Node.js 20+ e npm
- Java 17
- Maven 3.9+
- MySQL 8+

## 1) Criar banco de dados MySQL

No diretório raiz do projeto, execute:

```bash
mysql -u root -p < database/schema.sql
```

Isso cria o banco `tictactoe` e a tabela `players`.

## 2) Configurar e rodar o backend Java

Diretório:

```bash
cd server/backend-java
```

### Variáveis de ambiente (backend Java)

Você pode configurar pelo terminal (PowerShell) antes de iniciar:

```powershell
$env:PORT="3000"
$env:HOST="0.0.0.0"
$env:SOCKET_PORT="3001"
$env:SOCKET_HOST="0.0.0.0"
$env:SOCKET_ORIGIN="*"
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="sua_senha"
$env:DB_NAME="tictactoe"
$env:INSTANCE_ID="JAVA1"
```

Variáveis principais:

- `PORT`: porta da API REST (padrão `3000`)
- `HOST`: host da API REST (padrão `0.0.0.0`)
- `SOCKET_PORT`: porta do Socket.IO (padrão `3001`)
- `SOCKET_HOST`: host do Socket.IO (padrão `0.0.0.0`)
- `SOCKET_ORIGIN`: origem permitida no Socket.IO (padrão `*`)
- `DB_HOST`: host do MySQL (padrão `127.0.0.1`)
- `DB_PORT`: porta do MySQL (padrão `3306`)
- `DB_USER`: usuário do MySQL (padrão `root`)
- `DB_PASSWORD`: senha do MySQL (padrão vazio)
- `DB_NAME`: nome do banco (padrão `tictactoe`)
- `INSTANCE_ID`: identificador da instância (opcional)

> Observação: no backend Java, `.env` não é carregado automaticamente pelo Spring Boot.  
> Use variáveis no ambiente do sistema/terminal ou configure na IDE.

### Rodar backend Java

```bash
mvn spring-boot:run
```

Endpoints esperados:
- API Health: `http://localhost:3000/api/health`
- API Instance: `http://localhost:3000/api/instance`
- Socket.IO: `http://localhost:3001`

## 3) Configurar e rodar o frontend

Em outro terminal:

```bash
cd client/frontend
```

Crie/edite o arquivo `.env` com:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3001
PORT=5173
```

Variáveis do frontend:

- `VITE_API_URL`: URL base da API REST
- `VITE_SOCKET_URL`: URL base do Socket.IO
- `PORT`: porta do Vite (frontend), padrão `5173`
- `VITE_SERVER_URL` (legado/opcional): fallback único para API e socket

Instale dependências e rode:

```bash
npm install
npm run dev
```

Acesse:

- `http://localhost:5173`

## 4) Fluxo rápido de validação

1. Suba o MySQL e aplique `database/schema.sql`.
2. Rode o backend Java com `mvn spring-boot:run`.
3. Rode o frontend com `npm run dev`.
4. Abra `http://localhost:5173` e teste entrada na fila/partida.
