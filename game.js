const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const scoreValue = document.getElementById("scoreValue");
const lifeValue = document.getElementById("lifeValue");
const dayValue = document.getElementById("dayValue");
const healthBar = document.getElementById("healthBar");
const hypeBar = document.getElementById("hypeBar");
const startOverlay = document.getElementById("startOverlay");

const keys = new Set();
const playerSprite = new Image();
playerSprite.src = "./assets/noda-player.png";
let trimmedPlayerSprite = null;

playerSprite.addEventListener("load", () => {
  trimmedPlayerSprite = trimTransparentImage(playerSprite);
});

const state = {
  running: false,
  muted: false,
  score: 0,
  life: 4,
  health: 100,
  hype: 56,
  day: 1,
  distance: 0,
  cameraSpeed: 3.0,
  gravity: 0.7,
  invincibleUntil: 0,
  throwCooldownUntil: 0,
  lastSpawn: 0,
  lastTick: 0,
  message: "ゲーム開始で配信スタート",
  stageIndex: 0,
  particles: [],
  objects: [],
  projectiles: [],
  player: {
    x: 180,
    y: 0,
    width: 34,
    height: 68,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
  },
};

const stages = [
  {
    name: "はじまりの原っぱ",
    sky: ["#76cbff", "#d5f5ff"],
    ground: "#86d95d",
    accent: "#f16f45",
    horizon: "#e9ffff",
    grass: "#49bb53",
    dirt: "#7f5a3a",
    scenery: "meadow",
    message: "明るい草原ステージ。放物線マグカップで進路を作れ。",
    spawnWeights: { comment: 0.38, topic: 0.18, battery: 0.12, fire: 0.20, ban: 0.12 },
  },
  {
    name: "ふわ雲パーク",
    sky: ["#8ad5ff", "#eefcff"],
    ground: "#8fe070",
    accent: "#2dc493",
    horizon: "#f6ffff",
    grass: "#4ebd65",
    dirt: "#7e6041",
    scenery: "cloud",
    message: "空が近い中盤。マグカップの軌道で高低差をさばけ。",
    spawnWeights: { comment: 0.28, topic: 0.12, battery: 0.10, fire: 0.28, ban: 0.22 },
  },
  {
    name: "きらめきサンセット",
    sky: ["#8aafff", "#ffe9c7"],
    ground: "#7fd05e",
    accent: "#ff8d33",
    horizon: "#fff6dd",
    grass: "#57b75a",
    dirt: "#7b5636",
    scenery: "sunset",
    message: "夕焼けの終盤。明るい景色でも敵は濃いめ、投げ続けて押し切れ。",
    spawnWeights: { comment: 0.22, topic: 0.10, battery: 0.08, fire: 0.34, ban: 0.26 },
  },
];

const tips = [
  "コメント玉はスコアと熱量を上げる。",
  "ネタ札は高得点。場の空気を読んで拾え。",
  "充電パックで体力回復。",
  "Zのマグカップで敵をどんどん倒せる。",
  "熱量が低いとスコアの伸びが鈍る。",
];

const audioCtx = (() => {
  try {
    return new (window.AudioContext || window.webkitAudioContext)();
  } catch (error) {
    return null;
  }
})();

function beep(freq, duration, type = "square", volume = 0.02) {
  if (!audioCtx || state.muted) return;
  const now = audioCtx.currentTime;
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function trimTransparentImage(image) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0);

  const imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const { data, width, height } = imageData;
  const queue = [];
  const visited = new Uint8Array(width * height);

  function isCheckerLike(index) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3];
    if (a === 0) return true;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const neutral = max - min < 18;
    const nearWhite = r > 236 && g > 236 && b > 236;
    const nearGray = r > 218 && g > 218 && b > 218 && r < 242 && g < 242 && b < 242;
    return neutral && (nearWhite || nearGray);
  }

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pos = y * width + x;
    if (visited[pos]) return;
    visited[pos] = 1;
    queue.push(pos);
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length > 0) {
    const pos = queue.shift();
    const x = pos % width;
    const y = Math.floor(pos / width);
    const index = pos * 4;
    if (!isCheckerLike(index)) continue;

    data[index + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  sourceCtx.putImageData(imageData, 0, 0);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return image;

  const padding = 3;
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropWidth = Math.min(width - cropX, maxX - minX + 1 + padding * 2);
  const cropHeight = Math.min(height - cropY, maxY - minY + 1 + padding * 2);

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = cropWidth;
  trimmedCanvas.height = cropHeight;
  const trimmedCtx = trimmedCanvas.getContext("2d");
  trimmedCtx.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return trimmedCanvas;
}

function resetGame() {
  state.running = true;
  state.score = 0;
  state.life = 4;
  state.health = 100;
  state.hype = 56;
  state.day = 1;
  state.distance = 0;
  state.cameraSpeed = 3.0;
  state.invincibleUntil = 0;
  state.throwCooldownUntil = 0;
  state.lastSpawn = 0;
  state.stageIndex = 0;
  state.objects = [];
  state.particles = [];
  state.projectiles = [];
  state.message = stages[0].message;
  state.player.x = 180;
  state.player.y = canvas.height - 140;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = true;
  renderHud();
}

function spawnObject(now) {
  const elapsed = now - state.lastSpawn;
  const interval = Math.max(560, 1320 - state.distance * 0.11);
  if (elapsed < interval) return;

  state.lastSpawn = now;
  const stage = stages[state.stageIndex];
  const rng = Math.random();
  const weights = stage.spawnWeights;
  let edge = weights.comment;
  let kind = "comment";

  if (rng < edge) {
    kind = "comment";
  } else if (rng < (edge += weights.topic)) {
    kind = "topic";
  } else if (rng < (edge += weights.battery)) {
    kind = "battery";
  } else if (rng < (edge += weights.fire)) {
    kind = "fire";
  } else {
    kind = "ban";
  }

  const isHazard = kind === "fire" || kind === "ban";
  const baseY = canvas.height - 102;
  const elevatedChance = stage.scenery === "festival" ? 0.1 : 0.2;
  const elevated = Math.random() < elevatedChance;

  state.objects.push({
    kind,
    x: canvas.width + 40,
    y: isHazard || !elevated ? baseY : baseY - 124,
    width: kind === "ban" ? 42 : 28,
    height: kind === "ban" ? 52 : 28,
    vx: state.cameraSpeed + (kind === "fire" ? 0.75 : 0.45),
    bounce: Math.random() * Math.PI * 2,
  });
}

function emitParticles(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 1.1) * 4,
      size: 4 + Math.random() * 4,
      life: 25 + Math.random() * 25,
      color,
    });
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyPickup(kind, object) {
  if (kind === "comment") {
    state.score += 120 + Math.floor(state.hype * 0.6);
    state.hype = clamp(state.hype + 5, 0, 100);
    state.message = "コメントが流れた。空気があたたまる。";
    beep(740, 0.08);
    emitParticles(object.x, object.y, "#ffffff", 8);
  } else if (kind === "topic") {
    state.score += 380;
    state.hype = clamp(state.hype + 10, 0, 100);
    state.message = "ネタ回収成功。話が転がり出した。";
    beep(520, 0.07);
    beep(860, 0.11);
    emitParticles(object.x, object.y, "#ffd447", 12);
  } else if (kind === "battery") {
    state.health = clamp(state.health + 45, 0, 100);
    state.hype = clamp(state.hype + 6, 0, 100);
    state.message = "充電完了。まだ歩ける。";
    beep(390, 0.16, "triangle");
    emitParticles(object.x, object.y, "#21a96c", 10);
  }
}

function applyDamage(kind, object) {
  const now = performance.now();
  if (now < state.invincibleUntil) return;

  state.invincibleUntil = now + 2200;
  state.health -= kind === "ban" ? 18 : 11;
  state.hype = clamp(state.hype - 6, 0, 100);
  state.message = kind === "ban" ? "BAN板に接触。流れが悪い。" : "炎上雲に飲まれた。";
  beep(180, 0.16, "sawtooth", 0.03);
  emitParticles(object.x, object.y, "#ef4e23", 14);

  if (state.health <= 0) {
    state.life -= 1;
    state.health = 100;
    state.hype = clamp(state.hype - 4, 0, 100);
    state.message = "仕切り直し。配信はまだ終わらない。";
    beep(120, 0.25, "square", 0.035);
    if (state.life <= 0) {
      state.running = false;
      state.message = "配信終了。また日を改めよう。";
    }
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function throwMug() {
  const now = performance.now();
  if (now < state.throwCooldownUntil || !state.running) return;

  const player = state.player;
  state.throwCooldownUntil = now + 150;
  state.projectiles.push({
    x: player.x + (player.facing === 1 ? 36 : -6),
    y: player.y + 20,
    vx: player.facing === 1 ? 8.8 : -8.8,
    vy: -7.2,
    width: 22,
    height: 10,
    rotation: 0,
  });

  state.message = "マグカップを投げた。";
  beep(240, 0.05, "square", 0.03);
  beep(510, 0.08, "triangle", 0.02);
}

function updatePlayer() {
  const player = state.player;
  const floorY = canvas.height - 140;

  if (keys.has("ArrowLeft")) {
    player.vx = -4.2;
    player.facing = -1;
  } else if (keys.has("ArrowRight")) {
    player.vx = 4.8;
    player.facing = 1;
  } else {
    player.vx *= 0.74;
  }

  if ((keys.has(" ") || keys.has("Space")) && player.onGround) {
    player.vy = -13.8;
    player.onGround = false;
    beep(610, 0.08, "square");
  }

  if (keys.has("KeyZ")) {
    throwMug();
  }

  player.vy += state.gravity;
  player.x = clamp(player.x + player.vx, 60, canvas.width - 120);
  player.y += player.vy;

  if (player.y >= floorY) {
    player.y = floorY;
    player.vy = 0;
    player.onGround = true;
  }
}

function updateObjects() {
  const player = state.player;

  state.objects.forEach((object) => {
    object.x -= object.vx;
    object.bounce += 0.08;

    if (object.kind === "comment" || object.kind === "topic" || object.kind === "battery") {
      object.renderY = object.y + Math.sin(object.bounce) * 6;
    } else {
      object.renderY = object.y;
    }

    const collider = {
      x: object.x,
      y: object.renderY,
      width: object.width,
      height: object.height,
    };

    if (rectsOverlap(player, collider)) {
      if (object.kind === "comment" || object.kind === "topic" || object.kind === "battery") {
        applyPickup(object.kind, object);
        object.hit = true;
      } else {
        applyDamage(object.kind, object);
        object.hit = true;
      }
    }
  });

  state.objects = state.objects.filter((object) => object.x > -80 && !object.hit);
}

function updateProjectiles() {
  state.projectiles.forEach((projectile) => {
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    projectile.vy += 0.42;
    projectile.rotation += 0.2 * Math.sign(projectile.vx);

    state.objects.forEach((object) => {
      if (object.hit || (object.kind !== "fire" && object.kind !== "ban")) return;

      const collider = {
        x: object.x,
        y: object.renderY ?? object.y,
        width: object.width,
        height: object.height,
      };

      if (rectsOverlap(projectile, collider)) {
        object.hit = true;
        projectile.hit = true;
        state.score += object.kind === "ban" ? 260 : 180;
        state.hype = clamp(state.hype + 6, 0, 100);
        state.message = object.kind === "ban" ? "マグカップ命中。BAN板をどかした。" : "マグカップ命中。炎上雲を散らした。";
        emitParticles(projectile.x, projectile.y, "#9ae4ff", 8);
        emitParticles(object.x, collider.y, "#f3f0e8", 6);
        beep(700, 0.05, "square", 0.025);
      }
    });
  });

  state.projectiles = state.projectiles.filter(
    (projectile) =>
      !projectile.hit &&
      projectile.x > -40 &&
      projectile.x < canvas.width + 40 &&
      projectile.y < canvas.height + 40,
  );
}

function updateParticles() {
  state.particles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.08;
    particle.life -= 1;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function updateStage() {
  const segmentLength = 2600;
  const stageIndex = Math.min(stages.length - 1, Math.floor(state.distance / segmentLength));
  if (stageIndex !== state.stageIndex) {
    state.stageIndex = stageIndex;
    state.message = stages[stageIndex].message;
    beep(860, 0.08);
    beep(1020, 0.12);
  }

  state.day = state.stageIndex + 1;
  state.cameraSpeed = 3.0 + state.stageIndex * 0.38 + Math.min(0.45, state.distance / 10000);
}

function renderBackground() {
  const stage = stages[state.stageIndex];
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, stage.sky[0]);
  gradient.addColorStop(0.55, stage.sky[1]);
  gradient.addColorStop(0.551, stage.horizon);
  gradient.addColorStop(1, stage.ground);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  for (let index = 0; index < 6; index += 1) {
    const offset = (state.distance * (0.16 + index * 0.03)) % (canvas.width + 260);
    const x = canvas.width - offset;
    const y = 54 + index * 34 + Math.sin(index + state.distance * 0.002) * 8;
    drawCloud(x, y, 1 + (index % 2) * 0.2);
  }

  ctx.fillStyle = "rgba(169, 234, 255, 0.9)";
  for (let index = 0; index < 5; index += 1) {
    const x = ((index * 250 - state.distance * 0.18) + canvas.width + 180) % (canvas.width + 240) - 120;
    const width = 220 + (index % 2) * 60;
    const height = 80 + (index % 3) * 24;
    ctx.beginPath();
    ctx.ellipse(x, canvas.height - 185, width * 0.55, height * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(133, 237, 181, 0.95)";
  for (let index = 0; index < 6; index += 1) {
    const x = ((index * 190 - state.distance * 0.32) + canvas.width + 160) % (canvas.width + 220) - 80;
    const radius = 54 + (index % 3) * 14;
    ctx.beginPath();
    ctx.ellipse(x, canvas.height - 165, radius, radius * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  if (stage.scenery === "meadow") {
    for (let index = 0; index < 3; index += 1) {
      const x = ((index * 340 - state.distance * 0.55) + canvas.width + 320) % (canvas.width + 380) - 140;
      drawPipe(x, canvas.height - 126, 106, 86);
    }
    for (let index = 0; index < 4; index += 1) {
      const x = ((index * 210 - state.distance * 0.75) + canvas.width + 240) % (canvas.width + 260) - 90;
      drawBlockColumn(x, canvas.height - 248, 3 + (index % 2));
    }
  } else if (stage.scenery === "cloud") {
    for (let index = 0; index < 5; index += 1) {
      const x = ((index * 170 - state.distance * 0.6) + canvas.width + 210) % (canvas.width + 240) - 80;
      drawFloatingIsland(x, canvas.height - 258 - (index % 2) * 24, 0.85 + (index % 3) * 0.08);
    }
    for (let index = 0; index < 4; index += 1) {
      const x = ((index * 280 - state.distance * 0.44) + canvas.width + 310) % (canvas.width + 330) - 110;
      drawPipe(x, canvas.height - 142, 88, 96);
    }
  } else if (stage.scenery === "sunset") {
    ctx.fillStyle = "rgba(255, 255, 208, 0.9)";
    ctx.beginPath();
    ctx.arc(canvas.width - 118, 96, 46, 0, Math.PI * 2);
    ctx.fill();

    for (let index = 0; index < 5; index += 1) {
      const x = ((index * 210 - state.distance * 0.52) + canvas.width + 260) % (canvas.width + 300) - 110;
      drawTree(x, canvas.height - 158, 0.95 + (index % 2) * 0.14);
    }
    for (let index = 0; index < 4; index += 1) {
      const x = ((index * 250 - state.distance * 0.82) + canvas.width + 290) % (canvas.width + 310) - 100;
      drawBlockColumn(x, canvas.height - 236, 4);
    }
  }

  ctx.fillStyle = "#3a7bd5";
  ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
  for (let index = 0; index < canvas.width / 26 + 2; index += 1) {
    const x = index * 26 - (state.distance * 0.8) % 26;
    ctx.fillStyle = index % 2 === 0 ? "#244ca8" : "#2d63cd";
    ctx.beginPath();
    ctx.moveTo(x, canvas.height);
    ctx.lineTo(x + 13, canvas.height - 18);
    ctx.lineTo(x + 26, canvas.height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = stage.grass;
  ctx.fillRect(0, canvas.height - 92, canvas.width, 20);
  for (let x = 0; x < canvas.width; x += 22) {
    ctx.fillStyle = x % 44 === 0 ? "#66d96c" : "#43b84d";
    ctx.beginPath();
    ctx.arc(x + 11, canvas.height - 82, 14, Math.PI, 0);
    ctx.fill();
  }

  ctx.fillStyle = stage.dirt;
  ctx.fillRect(0, canvas.height - 72, canvas.width, 22);
  ctx.fillStyle = "#6b4b2f";
  ctx.fillRect(0, canvas.height - 50, canvas.width, 18);

  for (let x = 0; x < canvas.width; x += 34) {
    ctx.fillStyle = x % 68 === 0 ? "#9b6d45" : "#855d3a";
    ctx.fillRect(x, canvas.height - 70, 32, 16);
  }
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 16, 28, Math.PI * 0.9, Math.PI * 1.95);
  ctx.arc(28, 10, 24, Math.PI, Math.PI * 2);
  ctx.arc(56, 18, 20, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPipe(x, y, width, height) {
  ctx.fillStyle = "#31cf57";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#26ab46";
  ctx.fillRect(x + 8, y + 8, width - 16, height - 8);
  ctx.fillStyle = "#54eb76";
  ctx.fillRect(x - 8, y - 18, width + 16, 24);
  ctx.fillStyle = "#1f8a39";
  ctx.fillRect(x - 8, y - 18, width + 16, 4);
  ctx.fillRect(x + width * 0.32, y + 8, 8, height - 8);
}

function drawBlockColumn(x, y, count) {
  for (let index = 0; index < count; index += 1) {
    const blockX = x + index * 40;
    ctx.fillStyle = "#cf6e4a";
    ctx.fillRect(blockX, y, 38, 38);
    ctx.fillStyle = "#f1936a";
    ctx.fillRect(blockX + 2, y + 2, 34, 16);
    ctx.strokeStyle = "#87452d";
    ctx.lineWidth = 2;
    ctx.strokeRect(blockX + 1, y + 1, 36, 36);
    ctx.beginPath();
    ctx.moveTo(blockX + 19, y + 2);
    ctx.lineTo(blockX + 19, y + 36);
    ctx.moveTo(blockX + 2, y + 19);
    ctx.lineTo(blockX + 36, y + 19);
    ctx.stroke();
  }
}

function drawFloatingIsland(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#64d76f";
  ctx.beginPath();
  ctx.ellipse(0, 0, 58, 26, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#48b85d";
  ctx.beginPath();
  ctx.ellipse(-20, -10, 24, 16, 0, Math.PI, Math.PI * 2);
  ctx.ellipse(12, -12, 30, 18, 0, Math.PI, Math.PI * 2);
  ctx.ellipse(38, -6, 18, 14, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8f6748";
  ctx.beginPath();
  ctx.moveTo(-42, 8);
  ctx.lineTo(42, 8);
  ctx.lineTo(18, 42);
  ctx.lineTo(-14, 42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTree(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#8e6342";
  ctx.fillRect(-10, -6, 20, 72);
  ctx.fillRect(-4, -18, 8, 18);
  ctx.fillStyle = "#4fd56b";
  const buds = [
    [-30, -12, 24],
    [-8, -28, 28],
    [18, -16, 24],
    [34, -8, 18],
    [2, -4, 26],
  ];
  buds.forEach(([bx, by, radius]) => {
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function renderPlayer() {
  const player = state.player;
  const blink = performance.now() < state.invincibleUntil && Math.floor(performance.now() / 80) % 2 === 0;
  if (blink) return;

  if (trimmedPlayerSprite) {
    const drawWidth = 70;
    const drawHeight = 96;
    const drawX = player.x - 18;
    const drawY = player.y - 28;

    ctx.save();
    if (player.facing === -1) {
      ctx.translate(drawX + drawWidth / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(trimmedPlayerSprite, -drawWidth / 2, drawY, drawWidth, drawHeight);
    } else {
      ctx.drawImage(trimmedPlayerSprite, drawX, drawY, drawWidth, drawHeight);
    }
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    ctx.scale(player.facing, 1);
    ctx.fillStyle = "#1f2027";
    ctx.fillRect(-12, -16, 24, 42);
    ctx.fillStyle = "#eb6f90";
    ctx.fillRect(-16, -2, 32, 24);
    ctx.fillStyle = "#ffd7bf";
    ctx.fillRect(-14, -34, 28, 20);
    ctx.fillStyle = "#1f2027";
    ctx.fillRect(-14, -40, 28, 8);
    ctx.fillStyle = "#1f2027";
    ctx.fillRect(-20, -2, 8, 24);
    ctx.fillRect(12, -2, 8, 24);
    ctx.fillRect(-10, 22, 8, 24);
    ctx.fillRect(2, 22, 8, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(6, -28, 4, 4);
    ctx.fillRect(-10, -28, 4, 4);
    ctx.restore();
  }

  if (performance.now() < state.throwCooldownUntil) {
    ctx.fillStyle = "rgba(255, 248, 227, 0.9)";
    ctx.fillRect(player.x + 18, player.y + 16, 10, 6);
  }
}

function renderObject(object) {
  const y = object.renderY ?? object.y;
  if (object.kind === "comment") {
    ctx.fillStyle = "#ffd44d";
    ctx.beginPath();
    ctx.arc(object.x + 12, y + 12, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff1a8";
    ctx.beginPath();
    ctx.arc(object.x + 10, y + 10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b67519";
    ctx.fillRect(object.x + 11, y + 4, 2, 16);
    ctx.fillRect(object.x + 6, y + 11, 12, 2);
  } else if (object.kind === "topic") {
    ctx.fillStyle = "#ff7ad8";
    ctx.beginPath();
    ctx.moveTo(object.x + 11, y);
    ctx.lineTo(object.x + 22, y + 10);
    ctx.lineTo(object.x + 16, y + 28);
    ctx.lineTo(object.x + 6, y + 28);
    ctx.lineTo(object.x, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd3ff";
    ctx.fillRect(object.x + 9, y + 5, 4, 14);
  } else if (object.kind === "battery") {
    ctx.fillStyle = "#6dea8f";
    ctx.beginPath();
    ctx.arc(object.x + 12, y + 12, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(object.x + 10, y + 4, 4, 16);
    ctx.fillRect(object.x + 4, y + 10, 16, 4);
  } else if (object.kind === "fire") {
    ctx.fillStyle = "#7d3a12";
    ctx.beginPath();
    ctx.arc(object.x + 14, y + 14, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff8c42";
    ctx.beginPath();
    ctx.moveTo(object.x + 14, y + 4);
    ctx.quadraticCurveTo(object.x + 22, y + 14, object.x + 14, y + 24);
    ctx.quadraticCurveTo(object.x + 6, y + 14, object.x + 14, y + 4);
    ctx.fill();
    ctx.fillStyle = "#fff2bd";
    ctx.beginPath();
    ctx.moveTo(object.x + 14, y + 9);
    ctx.quadraticCurveTo(object.x + 18, y + 14, object.x + 14, y + 19);
    ctx.quadraticCurveTo(object.x + 10, y + 14, object.x + 14, y + 9);
    ctx.fill();
  } else if (object.kind === "ban") {
    ctx.fillStyle = "#7b4c2e";
    ctx.fillRect(object.x + 16, y + 6, 10, 44);
    ctx.fillStyle = "#ffe7a8";
    ctx.fillRect(object.x, y, 42, 30);
    ctx.strokeStyle = "#7b4c2e";
    ctx.lineWidth = 3;
    ctx.strokeRect(object.x + 1.5, y + 1.5, 39, 27);
    ctx.fillStyle = "#d83a3a";
    ctx.fillRect(object.x + 18, y + 6, 6, 18);
    ctx.fillRect(object.x + 12, y + 12, 18, 6);
  }
}

function renderProjectile(projectile) {
  ctx.save();
  ctx.translate(projectile.x + projectile.width / 2, projectile.y + projectile.height / 2);
  ctx.rotate(projectile.rotation);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-10, -8, 16, 14);
  ctx.strokeStyle = "#3f3f46";
  ctx.lineWidth = 2;
  ctx.strokeRect(-10, -8, 16, 14);
  ctx.beginPath();
  ctx.arc(7, -1, 5, -1.1, 1.1);
  ctx.stroke();
  ctx.fillStyle = "#6f4e37";
  ctx.fillRect(-8, -3, 12, 7);

  ctx.restore();
}

function renderParticles() {
  state.particles.forEach((particle) => {
    ctx.globalAlpha = particle.life / 50;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
}

function renderOverlay() {
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.fillRect(18, 18, 420, 82);
  ctx.strokeStyle = "rgba(29, 35, 64, 0.82)";
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, 420, 82);
  ctx.fillStyle = "#24396b";
  ctx.font = '18px "DotGothic16"';
  ctx.fillText(`STAGE ${state.stageIndex + 1}  ${stages[state.stageIndex].name}`, 34, 46);
  ctx.fillText(state.message, 34, 74);

  if (!state.running) {
    ctx.fillStyle = "rgba(25, 53, 102, 0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fffef9";
    ctx.textAlign = "center";
    ctx.font = '44px "DotGothic16"';
    ctx.fillText(state.life <= 0 ? "配信終了" : "野田草履の冒険島", canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = '24px "DotGothic16"';
    const line = state.life <= 0 ? "もう一度ボタンで再挑戦" : "開始ボタンで配信スタート";
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + 8);
    ctx.fillText("3ステージを抜けて熱量63以上で完走を目指せ", canvas.width / 2, canvas.height / 2 + 52);
    ctx.textAlign = "left";
  }
}

function renderHud() {
  scoreValue.textContent = String(state.score);
  lifeValue.textContent = String(state.life);
  dayValue.textContent = String(state.day);
  healthBar.style.width = `${state.health}%`;
  hypeBar.style.width = `${state.hype}%`;
}

function loop(now) {
  const delta = now - state.lastTick;
  state.lastTick = now;

  if (state.running) {
    state.distance += state.cameraSpeed;
    updateStage();
    updatePlayer();
    spawnObject(now);
    updateObjects();
    updateProjectiles();
    updateParticles();
    state.hype = clamp(state.hype - 0.004 * delta, 0, 100);

    if (state.stageIndex >= 2 && state.distance >= 7800 && state.hype >= 63) {
      state.running = false;
      state.message = "大成功。島の空気を完全につかんだ。";
    }
  }

  renderBackground();
  state.objects.forEach(renderObject);
  state.projectiles.forEach(renderProjectile);
  renderPlayer();
  renderParticles();
  renderOverlay();
  renderHud();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", " ", "Space", "KeyZ"].includes(event.code)) {
    event.preventDefault();
  }

  keys.add(event.key);
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
  keys.delete(event.code);
});

startButton.addEventListener("click", async () => {
  if (audioCtx && audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  startOverlay.classList.add("hidden");
  resetGame();
});

resetGame();
state.running = false;
if (startOverlay) {
  startOverlay.classList.remove("hidden");
}
requestAnimationFrame(loop);









