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
    name: "商店街",
    sky: ["#8fd7ff", "#cdefff"],
    ground: "#ddbf8e",
    accent: "#f07f4e",
    horizon: "#f7e6bf",
    grass: "#4aa65e",
    dirt: "#8f6547",
    scenery: "shops",
    message: "商店街でも敵多め。マグカップで進路を切り開け。",
    spawnWeights: { comment: 0.38, topic: 0.18, battery: 0.12, fire: 0.20, ban: 0.12 },
  },
  {
    name: "川沿い",
    sky: ["#8ce3da", "#d7f9ef"],
    ground: "#cdbf7b",
    accent: "#23a18a",
    horizon: "#dff5eb",
    grass: "#359c72",
    dirt: "#7d6a48",
    scenery: "river",
    message: "川沿いは敵ラッシュ。マグカップでBAN板と炎上雲を掃除しろ。",
    spawnWeights: { comment: 0.28, topic: 0.12, battery: 0.10, fire: 0.28, ban: 0.22 },
  },
  {
    name: "イベント会場",
    sky: ["#ffc88a", "#ffe7bc"],
    ground: "#ce9b6d",
    accent: "#ef4e23",
    horizon: "#ffe6c8",
    grass: "#5d9d55",
    dirt: "#84513e",
    scenery: "festival",
    message: "最後はイベント会場。敵の物量をさばいて3ステージ目を突破しろ。",
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

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let index = 0; index < 4; index += 1) {
    const offset = (state.distance * (0.2 + index * 0.04)) % (canvas.width + 220);
    ctx.fillRect(canvas.width - offset, 60 + index * 24, 120, 18);
    ctx.fillRect(canvas.width - offset + 20, 50 + index * 24, 70, 18);
  }

  if (stage.scenery === "shops") {
    ctx.fillStyle = stage.accent;
    for (let index = 0; index < 8; index += 1) {
      const base = ((index * 180 - (state.distance * 0.6) % 180) + canvas.width) % (canvas.width + 200);
      const height = 80 + (index % 3) * 24;
      ctx.fillRect(base, canvas.height - 200 - height, 56, height);
      ctx.fillStyle = index % 2 === 0 ? "#ffe082" : "#ffffff";
      ctx.fillRect(base + 8, canvas.height - 208 - height, 40, 10);
      ctx.fillStyle = stage.accent;
    }
  } else if (stage.scenery === "river") {
    ctx.fillStyle = "#76c7d6";
    ctx.fillRect(0, canvas.height - 150, canvas.width, 38);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let index = 0; index < 7; index += 1) {
      const base = ((index * 150 - (state.distance * 1.1) % 150) + canvas.width) % (canvas.width + 160);
      ctx.fillRect(base, canvas.height - 136, 52, 4);
    }
    ctx.fillStyle = "#4c7a3d";
    for (let index = 0; index < 6; index += 1) {
      const base = ((index * 170 - (state.distance * 0.45) % 170) + canvas.width) % (canvas.width + 180);
      ctx.beginPath();
      ctx.arc(base, canvas.height - 185, 24 + (index % 2) * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (stage.scenery === "festival") {
    for (let index = 0; index < 10; index += 1) {
      const base = ((index * 120 - (state.distance * 0.9) % 120) + canvas.width) % (canvas.width + 140);
      ctx.fillStyle = index % 2 === 0 ? "#d9485f" : "#4456b8";
      ctx.fillRect(base, canvas.height - 210, 58, 70);
      ctx.fillStyle = "#fff4d8";
      ctx.fillRect(base + 6, canvas.height - 202, 46, 10);
    }
    ctx.strokeStyle = "#f8f0a5";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 90);
    for (let index = 0; index <= 10; index += 1) {
      const x = index * (canvas.width / 10);
      const y = 96 + Math.sin(index + state.distance * 0.02) * 8;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let index = 0; index < 18; index += 1) {
      const x = (index * 55 - state.distance * 0.5) % (canvas.width + 40);
      const y = 98 + Math.sin(index) * 8;
      ctx.fillStyle = index % 3 === 0 ? "#ffd447" : index % 3 === 1 ? "#ff6b6b" : "#5dd39e";
      ctx.beginPath();
      ctx.arc((x + canvas.width) % canvas.width, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = stage.grass;
  ctx.fillRect(0, canvas.height - 90, canvas.width, 90);
  ctx.fillStyle = stage.dirt;
  ctx.fillRect(0, canvas.height - 42, canvas.width, 42);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(object.x, y, 24, 18);
    ctx.fillStyle = "#2f2f36";
    ctx.fillRect(object.x + 3, y + 4, 18, 3);
    ctx.fillRect(object.x + 3, y + 10, 12, 3);
  } else if (object.kind === "topic") {
    ctx.fillStyle = "#ffd447";
    ctx.fillRect(object.x, y, 22, 28);
    ctx.fillStyle = "#9f6119";
    ctx.fillRect(object.x + 4, y + 6, 14, 4);
    ctx.fillRect(object.x + 4, y + 14, 10, 4);
  } else if (object.kind === "battery") {
    ctx.fillStyle = "#16b364";
    ctx.fillRect(object.x + 2, y, 20, 28);
    ctx.fillStyle = "#ecfdf3";
    ctx.fillRect(object.x + 9, y + 3, 6, 22);
    ctx.fillRect(object.x + 4, y + 11, 16, 6);
    ctx.strokeStyle = "#0b6b3a";
    ctx.lineWidth = 2;
    ctx.strokeRect(object.x + 2, y, 20, 28);
  } else if (object.kind === "fire") {
    ctx.fillStyle = "#7f1d1d";
    ctx.beginPath();
    ctx.arc(object.x + 14, y + 14, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(object.x + 14, y + 14, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fef2f2";
    ctx.fillRect(object.x + 12, y + 5, 4, 13);
    ctx.fillRect(object.x + 12, y + 20, 4, 4);
  } else if (object.kind === "ban") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(object.x, y, 42, 52);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(object.x + 4, y + 4, 34, 44);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(object.x + 18, y + 10, 6, 22);
    ctx.fillRect(object.x + 18, y + 36, 6, 6);
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
  ctx.fillStyle = "rgba(20, 20, 26, 0.82)";
  ctx.fillRect(18, 18, 390, 78);
  ctx.fillStyle = "#f9f3df";
  ctx.font = '18px "DotGothic16"';
  ctx.fillText(`STAGE ${state.stageIndex + 1}  ${stages[state.stageIndex].name}`, 34, 46);
  ctx.fillText(state.message, 34, 74);

  if (!state.running) {
    ctx.fillStyle = "rgba(15, 16, 22, 0.78)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff4d8";
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









