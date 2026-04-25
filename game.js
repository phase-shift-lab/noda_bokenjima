const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const muteButton = document.getElementById("muteButton");
const scoreValue = document.getElementById("scoreValue");
const lifeValue = document.getElementById("lifeValue");
const dayValue = document.getElementById("dayValue");
const healthBar = document.getElementById("healthBar");
const hypeBar = document.getElementById("hypeBar");

const keys = new Set();
const playerSprite = new Image();
playerSprite.src = "./assets/noda-player.png";

const state = {
  running: false,
  muted: false,
  score: 0,
  life: 5,
  health: 100,
  hype: 65,
  day: 1,
  distance: 0,
  cameraSpeed: 2.8,
  gravity: 0.7,
  invincibleUntil: 0,
  waveCooldownUntil: 0,
  lastSpawn: 0,
  lastTick: 0,
  message: "ゲーム開始で配信スタート",
  stageIndex: 0,
  particles: [],
  objects: [],
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
    message: "商店街でウォームアップ。動く敵はZでどかしながら進め。",
  },
  {
    name: "川沿い",
    sky: ["#8ce3da", "#d7f9ef"],
    ground: "#cdbf7b",
    accent: "#23a18a",
    message: "川沿いは見通しが良い。BAN板と走る敵をまとめてさばけ。",
  },
  {
    name: "イベント会場",
    sky: ["#ffc88a", "#ffe7bc"],
    ground: "#ce9b6d",
    accent: "#ef4e23",
    message: "最後は人だかり。熱量80以上で完走すると大成功。",
  },
];

const tips = [
  "コメント玉はスコアと熱量を上げる。",
  "ネタ札は高得点。場の空気を読んで拾え。",
  "充電パックで体力回復。",
  "Zのツッコミ波は動く敵や障害物を消せる。",
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

function resetGame() {
  state.running = true;
  state.score = 0;
  state.life = 5;
  state.health = 100;
  state.hype = 65;
  state.day = 1;
  state.distance = 0;
  state.cameraSpeed = 2.8;
  state.invincibleUntil = 0;
  state.waveCooldownUntil = 0;
  state.lastSpawn = 0;
  state.stageIndex = 0;
  state.objects = [];
  state.particles = [];
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
  const interval = Math.max(820, 1800 - state.distance * 0.08);
  if (elapsed < interval) return;

  state.lastSpawn = now;
  const rng = Math.random();
  let kind = "comment";

  if (rng < 0.38) kind = "comment";
  else if (rng < 0.58) kind = "topic";
  else if (rng < 0.74) kind = "battery";
  else if (rng < 0.88) kind = "runner";
  else if (rng < 0.95) kind = "fire";
  else kind = "ban";

  const isHazard = kind === "fire" || kind === "ban" || kind === "runner";
  const baseY = canvas.height - 102;
  const elevated = Math.random() < 0.28;

  state.objects.push({
    kind,
    x: canvas.width + 40,
    y: isHazard || !elevated ? baseY : baseY - 124,
    width: kind === "ban" ? 42 : kind === "runner" ? 38 : 28,
    height: kind === "ban" ? 52 : kind === "runner" ? 36 : 28,
    vx: kind === "runner" ? state.cameraSpeed + 1.9 + Math.random() * 0.6 : state.cameraSpeed + 0.7,
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
  state.health -= kind === "ban" ? 16 : kind === "runner" ? 14 : 10;
  state.hype = clamp(state.hype - 6, 0, 100);

  if (kind === "ban") {
    state.message = "BAN板に接触。流れが悪い。";
  } else if (kind === "runner") {
    state.message = "走る敵にぶつかった。体勢を立て直せ。";
  } else {
    state.message = "炎上雲に飲まれた。";
  }

  beep(180, 0.16, "sawtooth", 0.03);
  emitParticles(object.x, object.y, kind === "runner" ? "#ff7b4a" : "#ef4e23", 14);

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

function fireWave() {
  const now = performance.now();
  if (now < state.waveCooldownUntil || !state.running) return;

  state.waveCooldownUntil = now + 350;
  beep(260, 0.08, "square", 0.03);
  beep(420, 0.12, "triangle", 0.025);
  emitParticles(state.player.x + 36, state.player.y + 24, "#9ae4ff", 12);

  state.objects = state.objects.filter((object) => {
    const inRange = object.x > state.player.x - 30 && object.x < state.player.x + 320;
    const affected = inRange && (object.kind === "fire" || object.kind === "ban" || object.kind === "runner");
    if (affected) {
      state.score += object.kind === "runner" ? 240 : 180;
      state.hype = clamp(state.hype + 7, 0, 100);
      emitParticles(object.x, object.y, object.kind === "runner" ? "#ffb36a" : "#9ae4ff", 10);
    }
    return !affected;
  });
  state.message = "ツッコミ波で前方の敵を切り返した。";
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
    object.bounce += object.kind === "runner" ? 0.18 : 0.08;

    if (object.kind === "comment" || object.kind === "topic" || object.kind === "battery") {
      object.renderY = object.y + Math.sin(object.bounce) * 6;
    } else if (object.kind === "runner") {
      object.renderY = object.y + Math.sin(object.bounce * 1.6) * 3;
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
  const nextDay = 1 + Math.floor(state.distance / 3200);
  if (nextDay !== state.day) {
    state.day = nextDay;
    state.message = tips[(state.day - 1) % tips.length];
    beep(820, 0.06);
    beep(980, 0.1);
  }

  state.stageIndex = Math.min(stages.length - 1, Math.floor((state.day - 1) / 2));
  state.cameraSpeed = 2.8 + Math.min(1.1, state.day * 0.08);
}

function renderBackground() {
  const stage = stages[state.stageIndex];
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, stage.sky[0]);
  gradient.addColorStop(0.55, stage.sky[1]);
  gradient.addColorStop(0.551, "#f1dfb7");
  gradient.addColorStop(1, stage.ground);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let index = 0; index < 4; index += 1) {
    const offset = (state.distance * (0.2 + index * 0.04)) % (canvas.width + 200);
    ctx.fillRect(canvas.width - offset, 60 + index * 24, 120, 18);
    ctx.fillRect(canvas.width - offset + 20, 50 + index * 24, 70, 18);
  }

  ctx.fillStyle = stage.accent;
  for (let index = 0; index < 8; index += 1) {
    const base = ((index * 180 - (state.distance * 0.6) % 180) + canvas.width) % (canvas.width + 200);
    const height = 80 + (index % 3) * 24;
    ctx.fillRect(base, canvas.height - 200 - height, 56, height);
    ctx.fillRect(base + 8, canvas.height - 208 - height, 40, 10);
  }

  ctx.fillStyle = "#4aa65e";
  ctx.fillRect(0, canvas.height - 90, canvas.width, 90);
  ctx.fillStyle = "#8f6547";
  ctx.fillRect(0, canvas.height - 42, canvas.width, 42);
}

function getPlayerAnimation() {
  const player = state.player;
  const moving = Math.abs(player.vx) > 0.7;
  const grounded = player.onGround;
  const time = performance.now() * 0.018;
  const walkCycle = moving && grounded ? Math.sin(time) : 0;
  const bob = moving && grounded ? Math.abs(Math.sin(time)) * 5 : 0;
  const tilt = moving && grounded ? walkCycle * 0.03 : 0;
  return { moving, grounded, walkCycle, bob, tilt };
}

function renderPlayer() {
  const player = state.player;
  const blink = performance.now() < state.invincibleUntil && Math.floor(performance.now() / 80) % 2 === 0;
  if (blink) return;

  const animation = getPlayerAnimation();

  if (playerSprite.complete && playerSprite.naturalWidth > 0) {
    const drawWidth = 152;
    const drawHeight = 212;
    const drawX = player.x - 54;
    const drawY = player.y - 128 + animation.bob;

    ctx.save();
    ctx.translate(drawX + drawWidth / 2, drawY + drawHeight / 2);
    ctx.scale(player.facing, 1);
    ctx.rotate(animation.tilt * player.facing);
    ctx.drawImage(playerSprite, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  } else {
    const stride = animation.walkCycle * 5;
    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2 + animation.bob);
    ctx.scale(player.facing, 1);
    ctx.rotate(animation.tilt);
    ctx.fillStyle = "#1f2027";
    ctx.fillRect(-12, -16, 24, 42);
    ctx.fillStyle = "#eb6f90";
    ctx.fillRect(-16, -2, 32, 24);
    ctx.fillStyle = "#ffd7bf";
    ctx.fillRect(-14, -34, 28, 20);
    ctx.fillStyle = "#1f2027";
    ctx.fillRect(-14, -40, 28, 8);
    ctx.fillStyle = "#1f2027";
    ctx.fillRect(-22, -2 + stride * 0.2, 8, 24);
    ctx.fillRect(14, -2 - stride * 0.2, 8, 24);
    ctx.fillRect(-12, 22 - stride, 8, 24);
    ctx.fillRect(4, 22 + stride, 8, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(6, -28, 4, 4);
    ctx.fillRect(-10, -28, 4, 4);
    ctx.restore();
  }

  if (performance.now() < state.waveCooldownUntil) {
    ctx.strokeStyle = "rgba(154, 228, 255, 0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x + 26, player.y + 24, 42, -0.4, 0.4);
    ctx.stroke();
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
    ctx.fillStyle = "#21a96c";
    ctx.fillRect(object.x, y, 18, 28);
    ctx.fillStyle = "#eafbf1";
    ctx.fillRect(object.x + 5, y + 2, 8, 3);
    ctx.fillRect(object.x + 4, y + 10, 10, 8);
  } else if (object.kind === "runner") {
    ctx.fillStyle = "#5b2f14";
    ctx.fillRect(object.x + 6, y + 12, 24, 14);
    ctx.fillStyle = "#f6c55f";
    ctx.fillRect(object.x + 12, y + 4, 12, 12);
    ctx.fillStyle = "#1c1f2b";
    ctx.fillRect(object.x + 22, y + 7, 3, 3);
    ctx.fillRect(object.x + 2, y + 28, 8, 6);
    ctx.fillRect(object.x + 14, y + 30, 8, 6);
    ctx.fillRect(object.x + 28, y + 28, 8, 6);
    ctx.fillStyle = "#ff7b4a";
    ctx.fillRect(object.x, y + 18, 6, 8);
  } else if (object.kind === "fire") {
    ctx.fillStyle = "#ef4e23";
    ctx.beginPath();
    ctx.arc(object.x + 14, y + 14, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd447";
    ctx.beginPath();
    ctx.arc(object.x + 14, y + 14, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (object.kind === "ban") {
    ctx.fillStyle = "#1c1f2b";
    ctx.fillRect(object.x, y, 42, 52);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(object.x + 6, y + 8, 30, 8);
    ctx.fillRect(object.x + 6, y + 22, 30, 8);
    ctx.fillRect(object.x + 6, y + 36, 30, 8);
  }
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
  ctx.fillRect(18, 18, 300, 70);
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
    ctx.fillText("コメントを拾い、走る敵と炎上をかわして熱量80以上を目指せ", canvas.width / 2, canvas.height / 2 + 52);
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
    updateParticles();
    state.hype = clamp(state.hype - 0.004 * delta, 0, 100);

    if (state.day >= 4 && state.hype >= 55) {
      state.running = false;
      state.message = "大成功。島の空気を完全につかんだ。";
    }
  }

  renderBackground();
  state.objects.forEach(renderObject);
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

  if (event.code === "KeyZ") {
    fireWave();
    return;
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
  resetGame();
});

muteButton.addEventListener("click", () => {
  state.muted = !state.muted;
  muteButton.textContent = state.muted ? "SE: OFF" : "SE: ON";
});

resetGame();
state.running = false;
requestAnimationFrame(loop);
