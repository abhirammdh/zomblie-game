// Import the io function from socket.io-client
const io = require("socket.io-client")

class ZombieGame {
  constructor() {
    this.socket = io()
    this.canvas = document.getElementById("gameCanvas")
    this.ctx = this.canvas.getContext("2d")
    this.gameState = "menu"
    this.players = {}
    this.zombies = []
    this.bullets = []
    this.currentPlayer = null
    this.roomId = null
    this.currentWave = 1
    this.zombiesLeft = 0
    this.isSpectating = false

    this.weapons = {
      pistol: { damage: 25, fireRate: 300, ammo: Number.POSITIVE_INFINITY, range: 300 },
      rifle: { damage: 35, fireRate: 150, ammo: Number.POSITIVE_INFINITY, range: 400 },
      shotgun: { damage: 60, fireRate: 800, ammo: Number.POSITIVE_INFINITY, range: 200, spread: 5 },
    }

    this.currentWeapon = "pistol"
    this.lastShot = 0
    this.keys = {}
    this.mouse = { x: 0, y: 0, down: false }

    this.initializeEventListeners()
    this.initializeSocketEvents()
    this.gameLoop()
  }

  initializeEventListeners() {
    // Menu events
    document.getElementById("createRoom").addEventListener("click", () => {
      const playerName = document.getElementById("playerName").value.trim()
      if (!playerName) {
        alert("Please enter your name")
        return
      }
      this.createRoom(playerName)
    })

    document.getElementById("joinRoom").addEventListener("click", () => {
      const playerName = document.getElementById("playerName").value.trim()
      const roomId = document.getElementById("roomId").value.trim()
      if (!playerName || !roomId) {
        alert("Please enter your name and room ID")
        return
      }
      this.joinRoom(playerName, roomId)
    })

    document.getElementById("startGame").addEventListener("click", () => {
      this.socket.emit("startGame", this.roomId)
    })

    document.getElementById("leaveRoom").addEventListener("click", () => {
      this.leaveRoom()
    })

    document.getElementById("spectateBtn").addEventListener("click", () => {
      this.isSpectating = true
      this.showScreen("game")
    })

    document.getElementById("quitBtn").addEventListener("click", () => {
      this.leaveRoom()
    })

    // Game controls
    document.addEventListener("keydown", (e) => {
      this.keys[e.key.toLowerCase()] = true

      // Weapon switching
      if (e.key === "1") this.currentWeapon = "pistol"
      if (e.key === "2") this.currentWeapon = "rifle"
      if (e.key === "3") this.currentWeapon = "shotgun"

      this.updateWeaponDisplay()
    })

    document.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false
    })

    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      this.mouse.x = e.clientX - rect.left
      this.mouse.y = e.clientY - rect.top
    })

    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        // Left click
        this.mouse.down = true
        this.shoot()
      }
    })

    this.canvas.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.mouse.down = false
      }
    })
  }

  initializeSocketEvents() {
    this.socket.on("roomCreated", (data) => {
      this.roomId = data.roomId
      this.currentPlayer = data.player
      document.getElementById("currentRoomId").textContent = this.roomId
      this.showScreen("lobby")
    })

    this.socket.on("roomJoined", (data) => {
      this.roomId = data.roomId
      this.currentPlayer = data.player
      this.players = data.players
      document.getElementById("currentRoomId").textContent = this.roomId
      this.updatePlayersList()
      this.showScreen("lobby")
    })

    this.socket.on("playerJoined", (data) => {
      this.players[data.player.id] = data.player
      this.updatePlayersList()
    })

    this.socket.on("playerLeft", (data) => {
      delete this.players[data.playerId]
      this.updatePlayersList()
    })

    this.socket.on("gameStarted", (data) => {
      this.players = data.players
      this.currentWave = 1
      this.showScreen("game")
      this.gameState = "playing"
    })

    this.socket.on("gameState", (data) => {
      this.players = data.players
      this.zombies = data.zombies
      this.bullets = data.bullets
      this.currentWave = data.wave
      this.zombiesLeft = data.zombiesLeft
      this.updateGameUI()
    })

    this.socket.on("playerDied", (data) => {
      if (data.playerId === this.socket.id) {
        this.showGameOver("You Died!", "You were overwhelmed by zombies.")
      }
    })

    this.socket.on("gameWon", () => {
      this.showGameOver("Victory!", "You survived all 6 waves!")
    })

    this.socket.on("gameLost", () => {
      this.showGameOver("Game Over", "All players have been eliminated.")
    })

    this.socket.on("error", (message) => {
      alert(message)
    })
  }

  createRoom(playerName) {
    const customization = {
      uniformColor: document.getElementById("uniformColor").value,
      helmetColor: document.getElementById("helmetColor").value,
    }

    this.socket.emit("createRoom", {
      playerName,
      customization,
    })
  }

  joinRoom(playerName, roomId) {
    const customization = {
      uniformColor: document.getElementById("uniformColor").value,
      helmetColor: document.getElementById("helmetColor").value,
    }

    this.socket.emit("joinRoom", {
      playerName,
      roomId,
      customization,
    })
  }

  leaveRoom() {
    this.socket.emit("leaveRoom", this.roomId)
    this.roomId = null
    this.currentPlayer = null
    this.players = {}
    this.gameState = "menu"
    this.isSpectating = false
    this.showScreen("menu")
  }

  showScreen(screenName) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active")
    })
    document.getElementById(screenName).classList.add("active")
  }

  updatePlayersList() {
    const playersList = document.getElementById("playersList")
    playersList.innerHTML = ""

    Object.values(this.players).forEach((player) => {
      const li = document.createElement("li")
      li.textContent = `${player.name} (${player.health}/100 HP)`
      if (player.health <= 0) {
        li.style.color = "#ff4444"
      }
      playersList.appendChild(li)
    })
  }

  updateGameUI() {
    document.getElementById("currentWave").textContent = this.currentWave
    document.getElementById("zombiesLeft").textContent = this.zombiesLeft

    if (this.currentPlayer && this.players[this.socket.id]) {
      const player = this.players[this.socket.id]
      const healthPercent = (player.health / 100) * 100
      document.getElementById("healthFill").style.width = healthPercent + "%"
      document.getElementById("healthText").textContent = `${player.health}/100`
    }

    // Update players info
    const playersInfo = document.getElementById("playersInfo")
    playersInfo.innerHTML = ""
    Object.values(this.players).forEach((player) => {
      const div = document.createElement("div")
      div.className = `player-status ${player.health <= 0 ? "dead" : ""}`
      div.innerHTML = `<span>${player.name}</span><span>${player.health}/100</span>`
      playersInfo.appendChild(div)
    })
  }

  updateWeaponDisplay() {
    document.getElementById("currentWeapon").textContent =
      this.currentWeapon.charAt(0).toUpperCase() + this.currentWeapon.slice(1)
    document.getElementById("ammoCount").textContent = "∞"
  }

  shoot() {
    if (this.gameState !== "playing" || this.isSpectating) return
    if (!this.currentPlayer || this.players[this.socket.id]?.health <= 0) return

    const now = Date.now()
    const weapon = this.weapons[this.currentWeapon]

    if (now - this.lastShot < weapon.fireRate) return

    this.lastShot = now

    const player = this.players[this.socket.id]
    if (!player) return

    const angle = Math.atan2(this.mouse.y - player.y, this.mouse.x - player.x)

    if (this.currentWeapon === "shotgun") {
      // Shotgun fires multiple bullets
      for (let i = 0; i < weapon.spread; i++) {
        const spreadAngle = angle + (Math.random() - 0.5) * 0.5
        this.socket.emit("shoot", {
          x: player.x,
          y: player.y,
          angle: spreadAngle,
          weapon: this.currentWeapon,
        })
      }
    } else {
      this.socket.emit("shoot", {
        x: player.x,
        y: player.y,
        angle: angle,
        weapon: this.currentWeapon,
      })
    }
  }

  showGameOver(title, message) {
    document.getElementById("gameOverTitle").textContent = title
    document.getElementById("gameOverMessage").textContent = message
    this.showScreen("gameOver")
  }

  gameLoop() {
    this.update()
    this.render()
    requestAnimationFrame(() => this.gameLoop())
  }

  update() {
    if (this.gameState === "playing" && !this.isSpectating) {
      this.handleMovement()
    }
  }

  handleMovement() {
    if (!this.currentPlayer || !this.players[this.socket.id]) return
    if (this.players[this.socket.id].health <= 0) return

    let dx = 0,
      dy = 0

    if (this.keys["w"] || this.keys["arrowup"]) dy -= 1
    if (this.keys["s"] || this.keys["arrowdown"]) dy += 1
    if (this.keys["a"] || this.keys["arrowleft"]) dx -= 1
    if (this.keys["d"] || this.keys["arrowright"]) dx += 1

    if (dx !== 0 || dy !== 0) {
      // Normalize diagonal movement
      const length = Math.sqrt(dx * dx + dy * dy)
      dx /= length
      dy /= length

      this.socket.emit("move", { dx, dy })
    }
  }

  render() {
    if (this.gameState !== "playing") return

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw map background
    this.drawMap()

    // Draw bullets
    this.bullets.forEach((bullet) => {
      this.ctx.fillStyle = "#ffff00"
      this.ctx.beginPath()
      this.ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2)
      this.ctx.fill()
    })

    // Draw zombies
    this.zombies.forEach((zombie) => {
      this.drawZombie(zombie)
    })

    // Draw players
    Object.values(this.players).forEach((player) => {
      this.drawPlayer(player)
    })

    // Draw crosshair
    if (!this.isSpectating && this.players[this.socket.id]?.health > 0) {
      this.drawCrosshair()
    }
  }

  drawMap() {
    // Draw grass background
    this.ctx.fillStyle = "#2a4d3a"
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw some environmental details
    this.ctx.fillStyle = "#1a3d2a"
    for (let i = 0; i < 50; i++) {
      const x = (i * 137) % this.canvas.width
      const y = (i * 211) % this.canvas.height
      this.ctx.fillRect(x, y, 20, 20)
    }

    // Draw border
    this.ctx.strokeStyle = "#444"
    this.ctx.lineWidth = 4
    this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height)
  }

  drawPlayer(player) {
    this.ctx.save()
    this.ctx.translate(player.x, player.y)

    // Draw player body
    this.ctx.fillStyle = player.customization?.uniformColor || "#4a5d23"
    this.ctx.fillRect(-15, -15, 30, 30)

    // Draw helmet
    this.ctx.fillStyle = player.customization?.helmetColor || "#2d3d1a"
    this.ctx.beginPath()
    this.ctx.arc(0, -10, 12, 0, Math.PI * 2)
    this.ctx.fill()

    // Draw weapon
    this.ctx.strokeStyle = "#333"
    this.ctx.lineWidth = 3
    this.ctx.beginPath()
    this.ctx.moveTo(0, 0)
    this.ctx.lineTo(20, 0)
    this.ctx.stroke()

    // Draw health bar
    if (player.health < 100) {
      this.ctx.fillStyle = "#ff0000"
      this.ctx.fillRect(-15, -25, 30, 4)
      this.ctx.fillStyle = "#00ff00"
      this.ctx.fillRect(-15, -25, (player.health / 100) * 30, 4)
    }

    // Draw name
    this.ctx.fillStyle = "#fff"
    this.ctx.font = "12px Arial"
    this.ctx.textAlign = "center"
    this.ctx.fillText(player.name, 0, -30)

    this.ctx.restore()
  }

  drawZombie(zombie) {
    this.ctx.save()
    this.ctx.translate(zombie.x, zombie.y)

    // Draw zombie body
    this.ctx.fillStyle = "#4a4a2a"
    this.ctx.fillRect(-12, -12, 24, 24)

    // Draw zombie head
    this.ctx.fillStyle = "#6a6a3a"
    this.ctx.beginPath()
    this.ctx.arc(0, -8, 10, 0, Math.PI * 2)
    this.ctx.fill()

    // Draw eyes
    this.ctx.fillStyle = "#ff0000"
    this.ctx.fillRect(-4, -10, 2, 2)
    this.ctx.fillRect(2, -10, 2, 2)

    // Draw health bar
    if (zombie.health < 50) {
      this.ctx.fillStyle = "#ff0000"
      this.ctx.fillRect(-12, -20, 24, 3)
      this.ctx.fillStyle = "#00ff00"
      this.ctx.fillRect(-12, -20, (zombie.health / 50) * 24, 3)
    }

    this.ctx.restore()
  }

  drawCrosshair() {
    this.ctx.strokeStyle = "#fff"
    this.ctx.lineWidth = 2
    this.ctx.beginPath()
    this.ctx.moveTo(this.mouse.x - 10, this.mouse.y)
    this.ctx.lineTo(this.mouse.x + 10, this.mouse.y)
    this.ctx.moveTo(this.mouse.x, this.mouse.y - 10)
    this.ctx.lineTo(this.mouse.x, this.mouse.y + 10)
    this.ctx.stroke()
  }
}

// Initialize game when page loads
window.addEventListener("load", () => {
  new ZombieGame()
})
