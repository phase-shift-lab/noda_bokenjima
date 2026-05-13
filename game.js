const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const scoreValue = document.getElementById("scoreValue");
const lifeValue = document.getElementById("lifeValue");
const dayValue = document.getElementById("dayValue");
const healthBar = document.getElementById("healthBar");
const hypeBar = document.getElementById("hypeBar");
const startOverlay = document.getElementById("startOverlay");
const startTitle = startOverlay?.querySelector("h1");
const startLead = startOverlay?.querySelector(".lead");
const startNote = startOverlay?.querySelector(".note");

const keys = new Set();
const playerSprite = new Image();
playerSprite.src = "./assets/noda-player.png";
let transparentPlayerSprite = null;

const bossSprites = {
  issy: loadSprite("./assets/issy-boss.svg"),
  yoshi: loadSprite("./assets/yoshi-boss.svg"),
  mirori: loadSprite("./assets/mirori-boss.svg"),
};
const ponSprite = loadSprite("./assets/pon-option.svg");

playerSprite.addEventListener("load", () => {
  transparentPlayerSprite = trimTransparentImage(playerSprite);
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
  mugBurstCount: 0,
  mugBurstResetAt: 0,
  lastSpawn: 0,
  lastTick: 0,
  message: "ゲーム開始で配信スタート",
  stageIndex: 0,
  bossesDefeated: [false, false, false],
  boss: null,
  particles: [],
  objects: [],
  projectiles: [],
  bossProjectiles: [],
  companion: {
    active: false,
    hp: 0,
    x: 0,
    y: 0,
    cooldownUntil: 0,
  },
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
    boss: {
      id: "issy",
      name: "イッシー",
      title: "格闘キック",
      hp: 12,
      color: "#d4683e",
      attackInterval: 1250,
      message: "1面ボス: イッシー。強烈な蹴りをマグカップで止めろ。",
    },
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
    boss: {
      id: "yoshi",
      name: "ヨッシー",
      title: "高速車イス",
      hp: 16,
      color: "#b22b2f",
      attackInterval: 1080,
      message: "2面ボス: ヨッシー。高速車イスと3種の神器を避けろ。",
    },
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
    boss: {
      id: "mirori",
      name: "ミロリー",
      title: "黒マスクリスナー召喚",
      hp: 22,
      color: "#171717",
      attackInterval: 1180,
      message: "3面ボス: ミロリー。異常HPと召喚をPONで受けながら削れ。",
    },
    spawnWeights: { comment: 0.22, topic: 0.10, battery: 0.08, fire: 0.34, ban: 0.26 },
  },
];

const STAGE_SEGMENT_LENGTH = 5600;
const BOSS_APPROACH_DISTANCE = 4400;

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

function loadSprite(src) {
  const image = new Image();
  image.src = src;
  return image;
}

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
  state.mugBurstCount = 0;
  state.mugBurstResetAt = 0;
  state.lastSpawn = 0;
  state.stageIndex = 0;
  state.bossesDefeated = [false, false, false];
  state.boss = null;
  state.objects = [];
  state.particles = [];
  state.projectiles = [];
  state.bossProjectiles = [];
  state.companion.active = false;
  state.companion.hp = 0;
  state.companion.cooldownUntil = 0;
  state.message = stages[0].message;
  state.player.x = 180;
  state.player.y = canvas.height - 140;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = true;
  renderHud();
}

function showStartOverlay(mode = "start") {
  if (!startOverlay) return;

  if (mode === "retry") {
    if (startTitle) startTitle.textContent = "リトライ";
    if (startLead) startLead.textContent = "配信終了。もう一度ステージ1から挑戦できます。";
    if (startNote) startNote.textContent = "操作: ← → 移動 / Space ジャンプ / Z マグカップ投げ";
    startButton.textContent = "もう一度挑戦";
  } else {
    if (startTitle) startTitle.textContent = "マナスタイン島の冒険";
    if (startLead) startLead.textContent = "小さくなった主人公で3ステージを進み、Zでマグカップを投げて障害物をどかす。";
    if (startNote) startNote.textContent = "操作: ← → 移動 / Space ジャンプ / Z マグカップ投げ";
    startButton.textContent = "ゲーム開始";
  }

  startOverlay.classList.remove("hidden");
}

function hideStartOverlay() {
  if (startOverlay) {
    startOverlay.classList.add("hidden");
  }
}

function spawnObject(now) {
  const elapsed = now - state.lastSpawn;
  const interval = Math.max(900, 1600 - state.distance * 0.08);
  if (elapsed < interval) return;
  if (state.objects.filter((object) => object.kind !== "drop").length >= 7) return;

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

  const flyerCount = state.objects.filter((object) => object.kind === "flyer").length;
  if (flyerCount < 2 && Math.random() < 0.08 + state.stageIndex * 0.025) {
    kind = "flyer";
  }

  if (!state.companion.active && !state.boss && Math.random() < 0.04) {
    kind = "pon";
  }

  const isHazard = kind === "fire" || kind === "ban" || kind === "flyer";
  const baseY = canvas.height - 102;
  const elevatedChance = stage.scenery === "festival" ? 0.1 : 0.2;
  const elevated = Math.random() < elevatedChance;

  state.objects.push({
    kind,
    x: canvas.width + 40,
    y: kind === "flyer" ? 130 + Math.random() * 110 : isHazard || kind === "pon" || !elevated ? baseY : baseY - 124,
    width: kind === "ban" ? 42 : kind === "flyer" ? 42 : kind === "pon" ? 24 : 28,
    height: kind === "ban" ? 52 : kind === "flyer" ? 30 : kind === "pon" ? 36 : 28,
    vx: state.cameraSpeed + (kind === "fire" ? 0.75 : kind === "flyer" ? 1.15 : 0.45),
    bounce: Math.random() * Math.PI * 2,
    nextDropAt: now + 1200 + Math.random() * 900,
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
  } else if (kind === "pon") {
    state.companion.active = true;
    state.companion.hp = 6;
    state.hype = clamp(state.hype + 8, 0, 100);
    state.message = "PONが合流。前方で敵攻撃を受け止める。";
    beep(580, 0.08, "triangle");
    beep(920, 0.12, "square");
    emitParticles(object.x, object.y, "#7dd3fc", 16);
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
    state.companion.active = false;
    state.companion.hp = 0;
    state.companion.cooldownUntil = 0;
    state.message = "仕切り直し。配信はまだ終わらない。";
    beep(120, 0.25, "square", 0.035);
    if (state.life <= 0) {
      state.running = false;
      state.message = "配信終了。また日を改めよう。";
      showStartOverlay("retry");
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

function companionCollider() {
  if (!state.companion.active) return null;
  const player = state.player;
  const width = 22;
  const height = 36;
  state.companion.x = clamp(player.x + player.facing * 50, 30, canvas.width - 50);
  state.companion.y = player.y + 18 + Math.sin(performance.now() * 0.008) * 5;
  return {
    x: state.companion.x,
    y: state.companion.y,
    width,
    height,
  };
}

function absorbWithPon(hitbox, color = "#7dd3fc") {
  const shield = companionCollider();
  if (!shield || !rectsOverlap(shield, hitbox)) return false;

  const now = performance.now();
  if (now >= state.companion.cooldownUntil) {
    state.companion.hp -= 1;
    state.companion.cooldownUntil = now + 220;
    state.message = "PONが前で受け止めた。";
    emitParticles(shield.x + shield.width / 2, shield.y + shield.height / 2, color, 10);
    beep(310, 0.05, "square", 0.025);
    if (state.companion.hp <= 0) {
      state.companion.active = false;
      state.message = "PONが弾き飛ばされた。";
      emitParticles(shield.x, shield.y, "#fca5a5", 16);
    }
  }
  return true;
}

function throwMug() {
  const now = performance.now();
  if (now < state.throwCooldownUntil || !state.running) return;

  if (now >= state.mugBurstResetAt) {
    state.mugBurstCount = 0;
  }

  if (state.mugBurstCount >= 3) {
    state.throwCooldownUntil = now + 820;
    state.mugBurstCount = 0;
    state.mugBurstResetAt = now + 820;
    state.message = "マグカップは3連投まで。少し間を置け。";
    beep(150, 0.06, "square", 0.02);
    return;
  }

  const player = state.player;
  state.throwCooldownUntil = now + 170;
  state.mugBurstCount += 1;
  state.mugBurstResetAt = now + 1100;
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

  player.onGround = false;
  if (player.y >= floorY) {
    player.y = floorY;
    player.vy = 0;
    player.onGround = true;
  }
}

function updateObjects() {
  const player = state.player;
  const now = performance.now();

  state.objects.forEach((object) => {
    object.x -= object.vx ?? state.cameraSpeed;
    object.bounce += 0.08;

    if (object.kind === "drop") {
      object.y += object.vy;
      object.vy += 0.28;
      object.renderY = object.y;
    } else if (object.kind === "flyer") {
      object.renderY = object.y + Math.sin(object.bounce) * 10;
      const dropCount = state.objects.filter((candidate) => candidate.kind === "drop").length;
      if (dropCount < 7 && now >= object.nextDropAt) {
        object.nextDropAt = now + 1400 + Math.random() * 900;
        state.objects.push({
          kind: "drop",
          x: object.x + 14,
          y: object.renderY + 22,
          width: 18,
          height: 22,
          vx: state.cameraSpeed * 0.35,
          vy: 2.4,
          bounce: 0,
        });
      }
    } else if (object.kind === "comment" || object.kind === "topic" || object.kind === "battery" || object.kind === "pon") {
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

    if ((object.kind === "fire" || object.kind === "ban" || object.kind === "drop" || object.kind === "flyer") && absorbWithPon(collider, "#bfdbfe")) {
      object.hit = true;
      return;
    }

    if (rectsOverlap(player, collider)) {
      if (object.kind === "comment" || object.kind === "topic" || object.kind === "battery" || object.kind === "pon") {
        applyPickup(object.kind, object);
        object.hit = true;
      } else {
        applyDamage(object.kind === "ban" ? "ban" : "fire", object);
        object.hit = true;
      }
    }
  });

  state.objects = state.objects.filter((object) => object.x > -80 && object.y < canvas.height + 80 && !object.hit);
}

function updateProjectiles() {
  state.projectiles.forEach((projectile) => {
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    projectile.vy += 0.42;
    projectile.rotation += 0.2 * Math.sign(projectile.vx);

    state.objects.forEach((object) => {
      if (object.hit || (object.kind !== "fire" && object.kind !== "ban" && object.kind !== "flyer" && object.kind !== "drop")) return;

      const collider = {
        x: object.x,
        y: object.renderY ?? object.y,
        width: object.width,
        height: object.height,
      };

      if (rectsOverlap(projectile, collider)) {
        object.hit = true;
        projectile.hit = true;
        state.score += object.kind === "ban" ? 260 : object.kind === "flyer" ? 220 : 180;
        state.hype = clamp(state.hype + 6, 0, 100);
        state.message =
          object.kind === "ban"
            ? "マグカップ命中。BAN板をどかした。"
            : object.kind === "flyer"
              ? "マグカップ命中。空中敵を落とした。"
              : "マグカップ命中。危険物を散らした。";
        emitParticles(projectile.x, projectile.y, "#9ae4ff", 8);
        emitParticles(object.x, collider.y, "#f3f0e8", 6);
        beep(700, 0.05, "square", 0.025);
      }
    });

    if (state.boss && !state.boss.defeated) {
      const bossHitbox = {
        x: state.boss.x,
        y: state.boss.y,
        width: state.boss.width,
        height: state.boss.height,
      };

      if (rectsOverlap(projectile, bossHitbox)) {
        state.boss.hp -= 1;
        projectile.hit = true;
        state.score += 120;
        state.hype = clamp(state.hype + 2, 0, 100);
        state.message = `${state.boss.name}に命中。残りHP ${Math.max(0, state.boss.hp)}。`;
        emitParticles(projectile.x, projectile.y, "#fde68a", 12);
        beep(760, 0.05, "square", 0.025);

        if (state.boss.hp <= 0) {
          defeatBoss();
        }
      }
    }
  });

  state.projectiles = state.projectiles.filter(
    (projectile) =>
      !projectile.hit &&
      projectile.x > -40 &&
      projectile.x < canvas.width + 40 &&
      projectile.y < canvas.height + 40,
  );
}

function bossSpawnDistance(index) {
  return index * STAGE_SEGMENT_LENGTH + BOSS_APPROACH_DISTANCE;
}

function spawnBoss(index) {
  const config = stages[index].boss;
  state.boss = {
    ...config,
    stageIndex: index,
    hp: config.hp,
    maxHp: config.hp,
    x: canvas.width + 60,
    y: canvas.height - 186,
    width: 88,
    height: 114,
    vx: -1.8 - index * 0.35,
    defeated: false,
    nextAttackAt: performance.now() + 900,
    attackStep: 0,
  };
  state.message = config.message;
  state.objects = state.objects.filter((object) => object.kind === "pon" || object.kind === "battery");
  beep(170, 0.12, "sawtooth", 0.03);
}

function defeatBoss() {
  if (!state.boss) return;
  const stageIndex = state.boss.stageIndex;
  state.bossesDefeated[stageIndex] = true;
  state.score += 1200 + stageIndex * 600;
  state.hype = clamp(state.hype + 18, 0, 100);
  state.message = `${state.boss.name}撃破。次のエリアへ進める。`;
  emitParticles(state.boss.x + 30, state.boss.y + 35, "#fef08a", 30);
  beep(860, 0.08, "square", 0.03);
  beep(1120, 0.14, "triangle", 0.025);
  state.boss = null;
  state.bossProjectiles = [];
}

function updateBoss(now) {
  const stageIndex = state.stageIndex;
  if (!state.boss && !state.bossesDefeated[stageIndex] && state.distance >= bossSpawnDistance(stageIndex)) {
    spawnBoss(stageIndex);
  }

  if (state.boss) {
    const boss = state.boss;
    const targetX = canvas.width - 150;
    if (boss.x > targetX) {
      boss.x += boss.vx;
    } else {
      boss.x += Math.sin(now * 0.004 + boss.stageIndex) * 0.7;
    }

    if (now >= boss.nextAttackAt) {
      bossAttack(boss, now);
      boss.nextAttackAt = now + boss.attackInterval;
      boss.attackStep += 1;
    }

    const player = state.player;
    if (rectsOverlap(player, boss)) {
      applyDamage("ban", boss);
    }
  }

  state.bossProjectiles.forEach((shot) => {
    shot.x += shot.vx;
    shot.y += shot.vy;
    shot.vy += shot.gravity ?? 0;
    shot.life -= 1;

    const hitbox = {
      x: shot.x,
      y: shot.y,
      width: shot.width,
      height: shot.height,
    };

    if (absorbWithPon(hitbox, shot.color)) {
      shot.hit = true;
      return;
    }

    if (rectsOverlap(state.player, hitbox)) {
      applyDamage(shot.kind === "kick" ? "ban" : "fire", hitbox);
      shot.hit = true;
    }
  });

  state.bossProjectiles = state.bossProjectiles.filter(
    (shot) => !shot.hit && shot.life > 0 && shot.x > -120 && shot.x < canvas.width + 160 && shot.y < canvas.height + 80,
  );
}

function bossAttack(boss, now) {
  if (boss.id === "issy") {
    state.bossProjectiles.push({
      kind: "kick",
      x: boss.x - 24,
      y: boss.y + 54,
      width: 44,
      height: 18,
      vx: -7.4,
      vy: 0,
      life: 70,
      color: "#f97316",
    });
    state.message = "イッシーの蹴り。PONかジャンプでしのげ。";
  } else if (boss.id === "yoshi") {
    const relics = [
      { kind: "relic-can", y: boss.y + 20, vy: -1.5, color: "#dbeafe" },
      { kind: "relic-rod", y: boss.y + 42, vy: 0, color: "#fca5a5" },
      { kind: "relic-card", y: boss.y + 64, vy: 1.2, color: "#fde68a" },
    ];
    relics.forEach((relic, index) => {
      state.bossProjectiles.push({
        ...relic,
        x: boss.x - 18,
        width: 24,
        height: 24,
        vx: -5.7 - index * 0.8,
        gravity: 0.04,
        life: 110,
      });
    });
    boss.x = clamp(boss.x - 18, canvas.width - 220, canvas.width - 110);
    state.message = "ヨッシーが3種の神器をばらまいた。";
  } else if (boss.id === "mirori") {
    state.bossProjectiles.push({
      kind: "double-punch",
      x: boss.x - 34,
      y: boss.y + 24,
      width: 34,
      height: 20,
      vx: -4.8,
      vy: 0,
      life: 72,
      color: "#c4b5fd",
    });
    state.bossProjectiles.push({
      kind: "double-punch",
      x: boss.x - 34,
      y: boss.y + 58,
      width: 34,
      height: 20,
      vx: -4.8,
      vy: 0,
      life: 72,
      color: "#c4b5fd",
    });

    if (boss.attackStep % 3 === 0) {
      for (let index = 0; index < 1; index += 1) {
        state.objects.push({
          kind: "ban",
          x: canvas.width + 40 + index * 42,
          y: canvas.height - 102,
          width: 34,
          height: 42,
          vx: state.cameraSpeed + 0.9 + index * 0.2,
          bounce: 0,
        });
      }
    }
    state.message = "ミロリーのWパンチ。隙にマグカップを当てろ。";
  }
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
  const rawStageIndex = Math.min(stages.length - 1, Math.floor(state.distance / STAGE_SEGMENT_LENGTH));
  const stageIndex =
    rawStageIndex > state.stageIndex && !state.bossesDefeated[state.stageIndex] ? state.stageIndex : rawStageIndex;
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
  }

  drawPreBossCourse();

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

function drawPreBossCourse() {
  const stageStart = state.stageIndex * STAGE_SEGMENT_LENGTH;
  const localDistance = state.distance - stageStart;
  const bossDistance = bossSpawnDistance(state.stageIndex) - stageStart;
  const progress = clamp(localDistance / bossDistance, 0, 1);
  const floorTop = canvas.height - 92;

  if (state.stageIndex === 0) {
    drawStage1BossRoad(floorTop);
  } else if (state.stageIndex === 1) {
    drawStage2BossRoad(floorTop);
  } else {
    drawStage3BossRoad(floorTop);
  }

  if (progress > 0.7 || state.boss) {
    const gateX = canvas.width - 128 - Math.max(0, (progress - 0.7) * 220);
    drawBossGate(gateX, floorTop - 104, state.stageIndex);
  }
}

function drawStage1BossRoad(floorTop) {
  for (let index = 0; index < 4; index += 1) {
    const lane = (index * 420 - state.distance * 0.64) % (canvas.width + 360);
    const x = (lane + canvas.width + 360) % (canvas.width + 360) - 170;
    drawGroundLandmark(x, floorTop - 26, index % 2 === 0);
  }
}

function drawStage2BossRoad(floorTop) {
  for (let index = 0; index < 5; index += 1) {
    const lane = (index * 360 - state.distance * 0.78) % (canvas.width + 340);
    const x = (lane + canvas.width + 340) % (canvas.width + 340) - 160;
    drawWheelchairLane(x, floorTop - 12, index % 2 === 0);
  }
}

function drawStage3BossRoad(floorTop) {
  for (let index = 0; index < 6; index += 1) {
    const lane = (index * 300 - state.distance * 0.7) % (canvas.width + 320);
    const x = (lane + canvas.width + 320) % (canvas.width + 320) - 150;
    drawMaskedCrowdMarker(x, floorTop - 46, index % 3);
  }
}

function drawGroundLandmark(x, y, isPipe) {
  if (isPipe) {
    drawPipe(x, y - 34, 88, 62);
    return;
  }
  drawBrickSteps(x, y + 8, 3);
}

function drawWheelchairLane(x, y, hasRelic) {
  ctx.fillStyle = "#9bd6ff";
  ctx.fillRect(x, y + 8, 142, 10);
  ctx.fillStyle = "#1d4ed8";
  ctx.fillRect(x + 8, y + 12, 126, 3);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 36);
  ctx.lineTo(x + 92, y);
  ctx.lineTo(x + 128, y);
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(x + 98, y - 28, 36, 24);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 98, y - 28, 36, 24);
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(x + 110, y - 16, 5, 0, Math.PI * 2);
  ctx.arc(x + 124, y - 16, 5, 0, Math.PI * 2);
  ctx.fill();

  if (hasRelic) {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x + 16, y - 18, 18, 18);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(x + 40, y - 18, 18, 18);
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(x + 64, y - 18, 18, 18);
  }
}

function drawMaskedCrowdMarker(x, y, variant) {
  ctx.fillStyle = "rgba(17, 24, 39, 0.88)";
  for (let index = 0; index < 4; index += 1) {
    const px = x + index * 24;
    const height = 30 + ((index + variant) % 3) * 8;
    ctx.fillRect(px, y + 44 - height, 18, height);
    ctx.beginPath();
    ctx.arc(px + 9, y + 38 - height, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(px + 4, y + 36 - height, 10, 3);
    ctx.fillStyle = "rgba(17, 24, 39, 0.88)";
  }

  ctx.fillStyle = variant === 0 ? "#ef4444" : "#facc15";
  ctx.fillRect(x + 108, y + 4, 12, 56);
  ctx.fillRect(x + 94, y + 4, 40, 18);
  ctx.fillStyle = "#111827";
  ctx.font = '14px "DotGothic16"';
  ctx.fillText("NG", x + 102, y + 19);
}

function drawQuestionBlock(x, y, hasMark) {
  ctx.fillStyle = "#f7b33d";
  ctx.fillRect(x, y, 34, 34);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(x + 4, y + 4, 26, 10);
  ctx.strokeStyle = "#91572c";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, 32, 32);
  if (hasMark) {
    ctx.fillStyle = "#7a3f1d";
    ctx.font = '24px "DotGothic16"';
    ctx.fillText("?", x + 9, y + 25);
  }
}

function drawBrickSteps(x, floorY, steps) {
  for (let col = 0; col < steps; col += 1) {
    for (let row = 0; row <= col; row += 1) {
      const bx = x + col * 28;
      const by = floorY - row * 24;
      ctx.fillStyle = "#c66d49";
      ctx.fillRect(bx, by, 26, 22);
      ctx.fillStyle = "#ef916c";
      ctx.fillRect(bx + 3, by + 3, 20, 6);
      ctx.strokeStyle = "#7d3f2a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, 26, 22);
    }
  }
}

function drawCoinMarker(x, y) {
  ctx.fillStyle = "#ffd94a";
  ctx.beginPath();
  ctx.ellipse(x, y, 9, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b7791f";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff2a8";
  ctx.fillRect(x - 2, y - 8, 3, 16);
}

function drawBossGate(x, y, stageIndex = 0) {
  ctx.fillStyle = stageIndex === 1 ? "#1e40af" : stageIndex === 2 ? "#111827" : "#26335f";
  ctx.fillRect(x, y, 18, 104);
  ctx.fillRect(x + 72, y, 18, 104);
  ctx.fillRect(x, y, 90, 18);
  ctx.fillStyle = stageIndex === 1 ? "#93c5fd" : stageIndex === 2 ? "#ef4444" : "#ffcf4a";
  ctx.fillRect(x + 20, y + 24, 50, 12);
  ctx.fillStyle = "#f8fafc";
  ctx.font = '16px "DotGothic16"';
  ctx.fillText("BOSS", x + 22, y + 54);
}

function renderPlayer() {
  const player = state.player;
  const blink = performance.now() < state.invincibleUntil && Math.floor(performance.now() / 80) % 2 === 0;
  if (blink) return;

  const sprite = transparentPlayerSprite || (playerSprite.complete && playerSprite.naturalWidth > 0 ? playerSprite : null);

  if (sprite) {
    const drawHeight = 104;
    const drawWidth = drawHeight * (sprite.width / sprite.height);
    const drawX = player.x + player.width / 2 - drawWidth / 2;
    const drawY = player.y + player.height - drawHeight;

    ctx.save();
    if (player.facing === -1) {
      ctx.translate(drawX + drawWidth / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -drawWidth / 2, drawY, drawWidth, drawHeight);
    } else {
      ctx.drawImage(sprite, drawX, drawY, drawWidth, drawHeight);
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
  const isItem = object.kind === "comment" || object.kind === "topic" || object.kind === "battery" || object.kind === "pon";
  const isEnemy = object.kind === "fire" || object.kind === "ban" || object.kind === "flyer" || object.kind === "drop";

  if (isItem) {
    ctx.save();
    ctx.strokeStyle = object.kind === "pon" ? "#38bdf8" : object.kind === "battery" ? "#22c55e" : "#facc15";
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(object.x + object.width / 2, y + object.height / 2, Math.max(object.width, object.height) * 0.65, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (isEnemy) {
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.95;
    ctx.strokeRect(object.x - 3, y - 3, object.width + 6, object.height + 6);
    ctx.fillStyle = "#ef4444";
    ctx.font = '18px "DotGothic16"';
    ctx.fillText("!", object.x + object.width / 2 - 4, y - 7);
    ctx.restore();
  }

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
    ctx.fillRect(object.x + 6, y + 8, 12, 2);
    ctx.fillRect(object.x + 6, y + 13, 9, 2);
    ctx.beginPath();
    ctx.moveTo(object.x + 10, y + 19);
    ctx.lineTo(object.x + 14, y + 16);
    ctx.lineTo(object.x + 16, y + 20);
    ctx.fill();
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
    ctx.fillStyle = "#064e3b";
    ctx.font = '11px "DotGothic16"';
    ctx.fillText("HP", object.x + 5, y + 16);
  } else if (object.kind === "pon") {
    drawPonSprite(object.x - 2, y - 2, 0.58, false);
  } else if (object.kind === "flyer") {
    ctx.fillStyle = "#5b4acb";
    ctx.beginPath();
    ctx.ellipse(object.x + 21, y + 15, 22, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a78bfa";
    ctx.beginPath();
    ctx.ellipse(object.x + 8, y + 10, 15, 8, -0.4, 0, Math.PI * 2);
    ctx.ellipse(object.x + 34, y + 10, 15, 8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(object.x + 16, y + 12, 4, 0, Math.PI * 2);
    ctx.arc(object.x + 28, y + 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.fillRect(object.x + 15, y + 12, 3, 3);
    ctx.fillRect(object.x + 27, y + 12, 3, 3);
  } else if (object.kind === "drop") {
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(object.x + 9, y);
    ctx.lineTo(object.x + 18, y + 18);
    ctx.lineTo(object.x + 9, y + 22);
    ctx.lineTo(object.x, y + 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7f1d1d";
    ctx.fillRect(object.x + 7, y + 5, 4, 8);
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
    ctx.fillStyle = "#4b1d1d";
    ctx.fillRect(object.x + 17, y + 8, 8, 42);
    ctx.fillStyle = "#111827";
    ctx.fillRect(object.x, y, 42, 30);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.strokeRect(object.x + 1.5, y + 1.5, 39, 27);
    ctx.fillStyle = "#fef2f2";
    ctx.font = '14px "DotGothic16"';
    ctx.fillText("NG", object.x + 9, y + 20);
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

function renderBossProjectile(shot) {
  ctx.save();
  ctx.fillStyle = shot.color ?? "#fca5a5";
  if (shot.kind === "kick") {
    ctx.fillRect(shot.x, shot.y + 6, shot.width, 10);
    ctx.beginPath();
    ctx.arc(shot.x, shot.y + 11, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (shot.kind === "double-punch") {
    ctx.fillRect(shot.x, shot.y, shot.width, shot.height);
    ctx.fillStyle = "#111827";
    ctx.fillRect(shot.x + 4, shot.y + 4, 8, 4);
  } else {
    ctx.beginPath();
    ctx.arc(shot.x + shot.width / 2, shot.y + shot.height / 2, shot.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(shot.x + 7, shot.y + 7, 10, 3);
  }
  ctx.restore();
}

function renderCompanion() {
  const shield = companionCollider();
  if (!shield) return;

  drawPonSprite(shield.x - 5, shield.y - 6, 0.72, true);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 3;
  ctx.strokeRect(shield.x - 4, shield.y - 4, shield.width + 8, shield.height + 8);
}

function drawPonSprite(x, y, scale = 1, active = false) {
  if (ponSprite.complete && ponSprite.naturalWidth > 0) {
    const width = 52 * scale;
    const height = 66 * scale;
    ctx.drawImage(ponSprite, x, y, width, height);
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  ctx.beginPath();
  ctx.ellipse(22, 52, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = active ? "#e0f2fe" : "#f8fafc";
  ctx.beginPath();
  ctx.ellipse(23, 30, 19, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dbeafe";
  ctx.beginPath();
  ctx.ellipse(23, 34, 15, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(16, 24, 3, 0, Math.PI * 2);
  ctx.arc(30, 24, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(17, 23, 1.1, 0, Math.PI * 2);
  ctx.arc(31, 23, 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#0ea5e9";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(23, 30, 11, 0.15, Math.PI - 0.15);
  ctx.stroke();

  ctx.fillStyle = "#0ea5e9";
  ctx.fillRect(12, 5, 22, 6);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(15, 0, 16, 8);

  ctx.fillStyle = "#1d4ed8";
  ctx.font = '12px "DotGothic16"';
  ctx.fillText("PON", 10, 61);
  ctx.restore();
}

function renderBoss() {
  if (!state.boss) return;
  const boss = state.boss;
  const sprite = bossSprites[boss.id];

  ctx.save();
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    drawBossSpriteImage(boss, sprite);
  } else if (boss.id === "issy") {
    drawIssyBoss(boss);
  } else if (boss.id === "yoshi") {
    drawYoshiBoss(boss);
  } else if (boss.id === "mirori") {
    drawMiroriBoss(boss);
  }

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(canvas.width - 260, 20, 220, 18);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(canvas.width - 260, 20, 220 * (boss.hp / boss.maxHp), 18);
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 3;
  ctx.strokeRect(canvas.width - 260, 20, 220, 18);
  ctx.fillStyle = "#1f2937";
  ctx.font = '16px "DotGothic16"';
  ctx.fillText(`${boss.name} ${boss.title}`, canvas.width - 260, 58);
  ctx.restore();
}

function drawBossSpriteImage(boss, sprite) {
  drawBossShadow(boss);
  const drawWidth = boss.id === "mirori" ? 122 : boss.id === "yoshi" ? 128 : 110;
  const drawHeight = boss.id === "mirori" ? 132 : boss.id === "yoshi" ? 118 : 126;
  const drawX = boss.x + boss.width / 2 - drawWidth / 2;
  const drawY = boss.y + boss.height - drawHeight;

  ctx.drawImage(sprite, drawX, drawY, drawWidth, drawHeight);

  if (boss.id === "issy") {
    const kickPulse = Math.sin(performance.now() * 0.014) > 0 ? 8 : 0;
    ctx.fillStyle = "rgba(255, 164, 86, 0.42)";
    ctx.fillRect(drawX - 18 - kickPulse, drawY + 88, 44 + kickPulse, 12);
  }
}

function drawBossShadow(boss) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(boss.x + boss.width / 2, boss.y + boss.height + 4, 42, 9, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawIssyBoss(boss) {
  const x = boss.x;
  const y = boss.y;
  drawBossShadow(boss);

  ctx.fillStyle = "#f0b48c";
  ctx.fillRect(x + 22, y + 36, 34, 42);
  ctx.fillStyle = "#d96f53";
  ctx.fillRect(x + 12, y + 38, 14, 34);
  ctx.fillRect(x + 52, y + 38, 14, 34);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x + 22, y + 74, 18, 18);
  ctx.fillRect(x + 45, y + 74, 18, 18);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x + 8, y + 88, 32, 8);
  ctx.fillRect(x + 44, y + 88, 34, 8);

  ctx.fillStyle = "#f0b48c";
  ctx.beginPath();
  ctx.arc(x + 39, y + 23, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.ellipse(x + 39, y + 8, 25, 13, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 17, y + 8, 44, 12);
  ctx.fillStyle = "#334155";
  ctx.fillRect(x + 24, y + 22, 12, 3);
  ctx.fillRect(x + 42, y + 22, 12, 3);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x + 29, y + 21, 4, 3);
  ctx.fillRect(x + 47, y + 21, 4, 3);
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(x + 33, y + 52, 9, 18);
  ctx.fillRect(x + 46, y + 52, 8, 18);

  ctx.fillStyle = "#ef7d4d";
  ctx.fillRect(x - 12, y + 61, 44, 12);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x - 20, y + 67, 18, 8);
}

function drawYoshiBoss(boss) {
  const x = boss.x;
  const y = boss.y;
  drawBossShadow(boss);

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x + 18, y + 83, 15, 0, Math.PI * 2);
  ctx.arc(x + 59, y + 83, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 18, y + 68);
  ctx.lineTo(x + 58, y + 68);
  ctx.lineTo(x + 66, y + 44);
  ctx.stroke();

  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 20, y + 44, 42, 30);
  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(x + 31, y + 44, 16, 30);
  ctx.fillStyle = "#f0b48c";
  ctx.beginPath();
  ctx.arc(x + 42, y + 28, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 24, y + 14, 34, 12);
  ctx.fillStyle = "#334155";
  ctx.fillRect(x + 30, y + 30, 24, 4);

  ctx.strokeStyle = "#6b7280";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 60);
  ctx.lineTo(x - 10, y + 54);
  ctx.stroke();
  ctx.fillStyle = "#d1d5db";
  ctx.beginPath();
  ctx.arc(x - 12, y + 54, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMiroriBoss(boss) {
  const x = boss.x;
  const y = boss.y;
  drawBossShadow(boss);

  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 18, y + 35, 42, 48);
  ctx.fillStyle = "#37d64f";
  ctx.font = '18px "DotGothic16"';
  ctx.fillText("KICK", x + 19, y + 61);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 16, y + 78, 16, 18);
  ctx.fillRect(x + 48, y + 78, 16, 18);

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(x + 39, y + 22, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0b48c";
  ctx.beginPath();
  ctx.ellipse(x + 39, y + 24, 16, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 23, y + 12, 32, 26);
  ctx.fillStyle = "#f0b48c";
  ctx.fillRect(x + 33, y + 21, 12, 8);
  ctx.strokeStyle = "#d6b56d";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 20, y + 13, 17, 16);
  ctx.strokeRect(x + 42, y + 13, 17, 16);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(x + 35, y + 34, 11, 3);

  const punch = Math.sin(performance.now() * 0.012) > 0 ? 10 : 0;
  ctx.fillStyle = "#111827";
  ctx.fillRect(x - 18 - punch, y + 43, 42, 13);
  ctx.fillRect(x + 55 + punch, y + 43, 42, 13);
  ctx.fillStyle = "#f0b48c";
  ctx.beginPath();
  ctx.arc(x - 23 - punch, y + 49, 9, 0, Math.PI * 2);
  ctx.arc(x + 101 + punch, y + 49, 9, 0, Math.PI * 2);
  ctx.fill();
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
    ctx.fillText(state.life <= 0 ? "配信終了" : "マナスタイン島の冒険", canvas.width / 2, canvas.height / 2 - 40);
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
    if (!state.boss) {
      state.distance += state.cameraSpeed;
    }
    updateStage();
    updatePlayer();
    if (!state.boss) {
      spawnObject(now);
    }
    updateBoss(now);
    updateObjects();
    updateProjectiles();
    updateParticles();
    state.hype = clamp(state.hype - 0.004 * delta, 0, 100);

    if (state.stageIndex >= 2 && state.distance >= STAGE_SEGMENT_LENGTH * stages.length && state.hype >= 63 && state.bossesDefeated[2]) {
      state.running = false;
      state.message = "大成功。島の空気を完全につかんだ。";
    }
  }

  renderBackground();
  state.objects.forEach(renderObject);
  state.projectiles.forEach(renderProjectile);
  state.bossProjectiles.forEach(renderBossProjectile);
  renderBoss();
  renderCompanion();
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
  hideStartOverlay();
  resetGame();
});

resetGame();
state.running = false;
showStartOverlay("start");
requestAnimationFrame(loop);









