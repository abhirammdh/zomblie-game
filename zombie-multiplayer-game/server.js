const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

// Serve static files
app.use(express.static(path.join(__dirname)))

// Game state
const rooms = {}
const players = {}

class GameRoom {
  constructor(roomId) {
    this.roomId = roomId
    this.players = {}
    this.zombies = []
    this.bullets = []
    this.gameState = "waiting" // waiting, playing, ended
    this.currentWave = 1
    this.maxWaves = 6
    this.zombiesPerWave = 5
    this.waveStartTime = 0
    this.lastUpdate = Date.now()
  }

  addPlayer(socket, playerData) {
    this.players[socket.id] = {
      id: socket.id,
      name: playerData.playerName,
      customization: playerData.customization,
      x: Math.random() * 1000 + 100,
      y: Math.random() * 600 + 100,
      health: 100,
      maxHealth: 100,
      speed: 3,
    }
    socket.join(this.roomId)
    players[socket.id] = this.roomId
  }

  removePlayer(socketId) {
    delete this.players[socketId]
    delete players[socketId]
  }

  startGame() {
    if (Object.keys(this.players).length === 0) return

    this.gameState = "playing"
    this.currentWave = 1
    this.spawnWave()
    this.gameLoop()

    io.to(this.roomId).emit("gameStarted", {
      players: this.players,
    })
  }

  spawnWave() {
    this.zombies = []
    const zombieCount = this.zombiesPerWave + (this.currentWave - 1) * 3

    for (let i = 0; i < zombieCount; i++) {
      this.spawnZombie()
    }

    this.waveStartTime = Date.now()
  }

  spawnZombie() {
    const side = Math.floor(Math.random() * 4)
    let x, y

    switch (side) {
      case 0: // Top
        x = Math.random() * 1200
        y = -50
        break
      case 1: // Right
        x = 1250
        y = Math.random() * 800
        break
      case 2: // Bottom
        x = Math.random() * 1200
        y = 850
        break
      case 3: // Left
        x = -50
        y = Math.random() * 800
        break
    }

    this.zombies.push({
      id: Math.random().toString(36).substr(2, 9),
      x: x,
      y: y,
      health: 50,
      maxHealth: 50,
      speed: 1 + Math.random() * 0.5,
      lastAttack: 0,
    })
  }

  gameLoop() {
    if (this.gameState !== "playing") return

    const now = Date.now()
    const deltaTime = now - this.lastUpdate
    this.lastUpdate = now

    this.updateZombies(deltaTime)
    this.updateBullets(deltaTime)
    this.checkCollisions()
    this.checkWaveComplete()
    this.checkGameEnd()

    // Send game state to all players
    io.to(this.roomId).emit("gameState", {
      players: this.players,
      zombies: this.zombies,
      bullets: this.bullets,
      wave: this.currentWave,
      zombiesLeft: this.zombies.length,
    })

    setTimeout(() => this.gameLoop(), 1000 / 60) // 60 FPS
  }

  updateZombies(deltaTime) {
    const now = Date.now() // Declare now variable here
    this.zombies.forEach((zombie) => {
      // Find nearest player
      let nearestPlayer = null
      let nearestDistance = Number.POSITIVE_INFINITY

      Object.values(this.players).forEach((player) => {
        if (player.health <= 0) return
        const distance = Math.sqrt(Math.pow(player.x - zombie.x, 2) + Math.pow(player.y - zombie.y, 2))
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestPlayer = player
        }
      })

      if (nearestPlayer) {
        // Move towards player
        const angle = Math.atan2(nearestPlayer.y - zombie.y, nearestPlayer.x - zombie.x)

        zombie.x += Math.cos(angle) * zombie.speed
        zombie.y += Math.sin(angle) * zombie.speed

        // Attack player if close enough
        if (nearestDistance < 30 && now - zombie.lastAttack > 1000) {
          nearestPlayer.health -= 20
          zombie.lastAttack = now

          if (nearestPlayer.health <= 0) {
            io.to(nearestPlayer.id).emit("playerDied", {
              playerId: nearestPlayer.id,
            })
          }
        }
      }
    })
  }

  updateBullets(deltaTime) {
    this.bullets = this.bullets.filter((bullet) => {
      bullet.x += Math.cos(bullet.angle) * bullet.speed
      bullet.y += Math.sin(bullet.angle) * bullet.speed

      // Remove bullets that go off screen
      return bullet.x >= 0 && bullet.x <= 1200 && bullet.y >= 0 && bullet.y <= 800
    })
  }

  checkCollisions() {
    this.bullets.forEach((bullet, bulletIndex) => {
      this.zombies.forEach((zombie, zombieIndex) => {
        const distance = Math.sqrt(Math.pow(bullet.x - zombie.x, 2) + Math.pow(bullet.y - zombie.y, 2))

        if (distance < 15) {
          // Hit!
          zombie.health -= bullet.damage
          this.bullets.splice(bulletIndex, 1)

          if (zombie.health <= 0) {
            this.zombies.splice(zombieIndex, 1)
          }
        }
      })
    })
  }

  checkWaveComplete() {
    if (this.zombies.length === 0) {
      this.currentWave++

      if (this.currentWave > this.maxWaves) {
        this.gameState = "ended"
        io.to(this.roomId).emit("gameWon")
        return
      }

      // Start next wave after delay
      setTimeout(() => {
        if (this.gameState === "playing") {
          this.spawnWave()
        }
      }, 3000)
    }
  }

  checkGameEnd() {
    const alivePlayers = Object.values(this.players).filter((p) => p.health > 0)

    if (alivePlayers.length === 0) {
      this.gameState = "ended"
      io.to(this.roomId).emit("gameLost")
    }
  }

  movePlayer(socketId, movement) {
    const player = this.players[socketId]
    if (!player || player.health <= 0) return

    const newX = player.x + movement.dx * player.speed
    const newY = player.y + movement.dy * player.speed

    // Keep player within bounds
    player.x = Math.max(20, Math.min(1180, newX))
    player.y = Math.max(20, Math.min(780, newY))
  }

  shoot(socketId, shootData) {
    const player = this.players[socketId]
    if (!player || player.health <= 0) return

    const weapons = {
      pistol: { damage: 25, speed: 8 },
      rifle: { damage: 35, speed: 10 },
      shotgun: { damage: 60, speed: 6 },
    }

    const weapon = weapons[shootData.weapon] || weapons.pistol

    this.bullets.push({
      x: shootData.x,
      y: shootData.y,
      angle: shootData.angle,
      speed: weapon.speed,
      damage: weapon.damage,
      playerId: socketId,
    })
  }
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id)

  socket.on("createRoom", (data) => {
    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase()
    const room = new GameRoom(roomId)
    rooms[roomId] = room

    room.addPlayer(socket, data)

    socket.emit("roomCreated", {
      roomId: roomId,
      player: room.players[socket.id],
    })
  })

  socket.on("joinRoom", (data) => {
    const room = rooms[data.roomId]

    if (!room) {
      socket.emit("error", "Room not found")
      return
    }

    if (room.gameState === "playing") {
      socket.emit("error", "Game already in progress")
      return
    }

    room.addPlayer(socket, data)

    socket.emit("roomJoined", {
      roomId: data.roomId,
      player: room.players[socket.id],
      players: room.players,
    })

    socket.to(data.roomId).emit("playerJoined", {
      player: room.players[socket.id],
    })
  })

  socket.on("startGame", (roomId) => {
    const room = rooms[roomId]
    if (room && room.players[socket.id]) {
      room.startGame()
    }
  })

  socket.on("move", (movement) => {
    const roomId = players[socket.id]
    const room = rooms[roomId]
    if (room) {
      room.movePlayer(socket.id, movement)
    }
  })

  socket.on("shoot", (shootData) => {
    const roomId = players[socket.id]
    const room = rooms[roomId]
    if (room) {
      room.shoot(socket.id, shootData)
    }
  })

  socket.on("leaveRoom", (roomId) => {
    const room = rooms[roomId]
    if (room) {
      room.removePlayer(socket.id)
      socket.to(roomId).emit("playerLeft", {
        playerId: socket.id,
      })
      socket.leave(roomId)

      // Delete room if empty
      if (Object.keys(room.players).length === 0) {
        delete rooms[roomId]
      }
    }
  })

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id)

    const roomId = players[socket.id]
    if (roomId) {
      const room = rooms[roomId]
      if (room) {
        room.removePlayer(socket.id)
        socket.to(roomId).emit("playerLeft", {
          playerId: socket.id,
        })

        // Delete room if empty
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId]
        }
      }
    }
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Zombie Survival Server running on port ${PORT}`)
})
