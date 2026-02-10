import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0909, 32, 130);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 30, 28);
camera.lookAt(0, 0, 0);

const clock = new THREE.Clock();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const worldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpV = new THREE.Vector3();

const ui = {
  lifeFill: document.getElementById("lifeFill"),
  manaFill: document.getElementById("manaFill"),
  xpFill: document.getElementById("xpFill"),
  lifeText: document.getElementById("lifeText"),
  manaText: document.getElementById("manaText"),
  xpText: document.getElementById("xpText"),
  level: document.getElementById("level"),
  kills: document.getElementById("kills"),
  gold: document.getElementById("gold"),
  objective: document.getElementById("objectiveText"),
  logEntries: document.getElementById("logEntries"),
  drops: document.getElementById("drops"),
  chatgptMode: document.getElementById("chatgptMode"),
  openaiApiKey: document.getElementById("openaiApiKey"),
  genStatus: document.getElementById("genStatus"),
  cooldowns: {
    fire: document.getElementById("cdFire"),
    spirit: document.getElementById("cdSpirit"),
    whirl: document.getElementById("cdWhirl")
  }
};

const controls = {
  w: false,
  a: false,
  s: false,
  d: false,
  fire: false,
  spirit: false,
  whirl: false,
  pointerLocked: false,
  aimPoint: new THREE.Vector3()
};

const game = {
  wave: 1,
  kills: 0,
  totalSpawned: 0,
  scoreGold: 0,
  combatLog: [],
  drops: [],
  lastSpawnAt: 0,
  spawnCooldown: 1.0,
  activeEnemies: [],
  projectiles: [],
  aoes: [],
  lootOrbs: [],
  hero: null,
  gameOver: false,
  targetKillMilestones: [12, 30, 54, 80]
};

const imageGenerator = {
  enabled: false,
  key: "",
  queue: [],
  busy: false,
  cache: new Map(),
  fallbackPalette: {
    legendary: ["#f8c15b", "#6e3b10", "#ffd889"],
    rare: ["#7db8ff", "#1d3159", "#c8e1ff"],
    magic: ["#7de0bf", "#16443e", "#d5fff1"]
  }
};

class Hero {
  constructor() {
    this.group = new THREE.Group();
    this.speed = 8;
    this.maxLife = 140;
    this.life = this.maxLife;
    this.maxMana = 120;
    this.mana = this.maxMana;
    this.level = 1;
    this.xp = 0;
    this.nextLevelXp = 140;
    this.rotationSpeed = 11;

    this.cooldowns = {
      fire: 0,
      spirit: 0,
      whirl: 0
    };

    this.setupMesh();
  }

  setupMesh() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x71605d, roughness: 0.65, metalness: 0.15 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x401515, roughness: 0.8, metalness: 0.1 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xf5a440, emissive: 0xf59f3d, emissiveIntensity: 0.25 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 1.6, 6, 10), bodyMat);
    torso.castShadow = true;
    torso.position.y = 1.4;

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.56, 14, 12), clothMat);
    hood.position.set(0, 2.6, 0.03);
    hood.castShadow = true;

    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.44), clothMat);
    shoulderL.position.set(-0.64, 2.1, 0);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.64;

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 14), glowMat);
    orb.position.set(0.56, 1.8, 0.6);

    const feet = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x241415 }));
    feet.position.y = 0.12;

    [torso, hood, shoulderL, shoulderR, orb, feet].forEach((mesh) => this.group.add(mesh));
    this.group.position.y = 0.15;
    this.group.castShadow = true;

    scene.add(this.group);
  }

  spendMana(amount) {
    if (this.mana < amount) return false;
    this.mana -= amount;
    return true;
  }

  takeDamage(amount) {
    this.life = Math.max(0, this.life - amount);
    addLog(`Hero takes ${Math.round(amount)} damage`, "#ff9990");
    if (this.life <= 0) {
      game.gameOver = true;
      ui.objective.textContent = "You have fallen. Refresh to re-enter Sanctuary.";
    }
  }

  gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.nextLevelXp) {
      this.xp -= this.nextLevelXp;
      this.level += 1;
      this.nextLevelXp = Math.floor(this.nextLevelXp * 1.38);
      this.maxLife += 22;
      this.maxMana += 16;
      this.life = this.maxLife;
      this.mana = this.maxMana;
      this.speed += 0.35;
      addLog(`Level up! Reached level ${this.level}`, "#ffe39b");
    }
  }
}

class Enemy {
  constructor({ kind, life, speed, color, xp, damage, scale }) {
    this.kind = kind;
    this.life = life;
    this.maxLife = life;
    this.speed = speed;
    this.xp = xp;
    this.damage = damage;
    this.attackCd = 0;
    this.dead = false;

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 });
    this.mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.52 * scale, 1.1 * scale, 6, 10), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.copy(randomSpawnPoint());
    this.mesh.position.y = 0.85 * scale;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4 * scale, 12, 12), mat.clone());
    head.material.color.offsetHSL(0, 0, 0.08);
    head.position.y = 1.1 * scale;
    this.mesh.add(head);

    scene.add(this.mesh);
  }

  update(dt) {
    if (this.dead || game.gameOver) return;

    const heroPos = game.hero.group.position;
    tmpV.subVectors(heroPos, this.mesh.position);
    const dist = tmpV.length();
    if (dist > 0.001) {
      tmpV.normalize();
      this.mesh.position.addScaledVector(tmpV, this.speed * dt);
      this.mesh.lookAt(heroPos.x, this.mesh.position.y, heroPos.z);
    }

    this.attackCd -= dt;
    if (dist < 1.7 && this.attackCd <= 0) {
      game.hero.takeDamage(this.damage + game.wave * 0.8);
      this.attackCd = 1.1;
    }
  }

  hit(dmg) {
    this.life -= dmg;
    if (this.life <= 0 && !this.dead) {
      this.dead = true;
      game.kills += 1;
      game.hero.gainXp(this.xp);
      game.scoreGold += randInt(8, 17 + game.wave * 2);
      spawnLootOrb(this.mesh.position);
      createDeathBurst(this.mesh.position, this.mesh.material.color);
      scene.remove(this.mesh);
      maybeDropItem(this.mesh.position);
      checkWaveProgress();
    }
  }
}

function randomSpawnPoint() {
  const distance = randFloat(18, 35);
  const angle = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
}

function createEnvironment() {
  scene.background = new THREE.Color(0x0a0706);

  const hemi = new THREE.HemisphereLight(0x7e748a, 0x261311, 0.5);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xd5d8ff, 1.2);
  moon.position.set(-25, 44, 18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -58;
  moon.shadow.camera.right = 58;
  moon.shadow.camera.top = 58;
  moon.shadow.camera.bottom = -58;
  moon.shadow.camera.near = 2;
  moon.shadow.camera.far = 130;
  scene.add(moon);

  const lavaGlow = new THREE.PointLight(0xff6c2f, 2.4, 42, 2);
  lavaGlow.position.set(0, 1.2, 0);
  scene.add(lavaGlow);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(65, 128),
    new THREE.MeshStandardMaterial({ color: 0x282120, roughness: 0.95, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const runicRing = new THREE.Mesh(
    new THREE.RingGeometry(5.8, 6.4, 72),
    new THREE.MeshBasicMaterial({ color: 0xc7542e, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
  );
  runicRing.rotation.x = -Math.PI / 2;
  runicRing.position.y = 0.03;
  scene.add(runicRing);

  for (let i = 0; i < 90; i += 1) {
    const h = randFloat(0.5, 4.4);
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(randFloat(0.35, 1.0), h, randFloat(0.35, 1.0)),
      new THREE.MeshStandardMaterial({ color: randInt(0x2a1f1c, 0x4f3a34), roughness: 0.95 })
    );

    const p = randomSpawnPoint().multiplyScalar(randFloat(1.0, 1.9));
    if (p.length() < 10) {
      p.multiplyScalar(1.7);
    }

    pillar.position.set(p.x, h * 0.5, p.z);
    pillar.rotation.y = randFloat(0, Math.PI);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
  }
}

function spawnEnemy() {
  const roll = Math.random();
  const tier = game.wave;
  let profile;

  if (roll > 0.88) {
    profile = {
      kind: "Brute",
      life: 80 + tier * 20,
      speed: 2.1 + tier * 0.15,
      color: 0x7e3b2f,
      xp: 24 + tier * 5,
      damage: 15 + tier * 2,
      scale: 1.2
    };
  } else if (roll > 0.55) {
    profile = {
      kind: "Ghoul",
      life: 52 + tier * 10,
      speed: 3.8 + tier * 0.22,
      color: 0x516b4e,
      xp: 16 + tier * 4,
      damage: 10 + tier,
      scale: 1
    };
  } else {
    profile = {
      kind: "Imp",
      life: 34 + tier * 8,
      speed: 4.8 + tier * 0.26,
      color: 0x6e4f84,
      xp: 10 + tier * 3,
      damage: 7 + tier,
      scale: 0.84
    };
  }

  const enemy = new Enemy(profile);
  game.activeEnemies.push(enemy);
  game.totalSpawned += 1;
}

function shootFireBolt() {
  const manaCost = 8;
  if (!game.hero.spendMana(manaCost)) return;

  const dir = getAimDirection();
  const projectile = {
    type: "fire",
    damage: 22 + game.hero.level * 6,
    speed: 20,
    ttl: 1.2,
    radius: 0.28,
    mesh: new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xff8c30, emissive: 0xff5a12, emissiveIntensity: 1.5 })
    ),
    velocity: dir.multiplyScalar(20)
  };

  projectile.mesh.position.copy(game.hero.group.position).add(new THREE.Vector3(0, 1.8, 0));
  scene.add(projectile.mesh);
  game.projectiles.push(projectile);
  addLog("Cast Fire Bolt", "#ffc27f");
}

function shootSpiritLance() {
  const manaCost = 22;
  if (!game.hero.spendMana(manaCost)) return;

  const dir = getAimDirection();
  const projectile = {
    type: "spirit",
    damage: 48 + game.hero.level * 9,
    speed: 30,
    ttl: 0.95,
    radius: 0.4,
    pierce: 2,
    mesh: new THREE.Mesh(
      new THREE.ConeGeometry(0.27, 1.4, 16),
      new THREE.MeshStandardMaterial({ color: 0x72b8ff, emissive: 0x3c77ff, emissiveIntensity: 1.25 })
    ),
    velocity: dir.multiplyScalar(30)
  };

  projectile.mesh.rotation.x = Math.PI / 2;
  projectile.mesh.position.copy(game.hero.group.position).add(new THREE.Vector3(0, 1.7, 0));
  scene.add(projectile.mesh);
  game.projectiles.push(projectile);
  addLog("Unleash Spirit Lance", "#9fc4ff");
}

function castWhirl() {
  const manaCost = 35;
  if (!game.hero.spendMana(manaCost)) return;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.1, 34),
    new THREE.MeshBasicMaterial({ color: 0xfef7e7, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(game.hero.group.position).setY(0.12);
  scene.add(ring);

  game.aoes.push({ mesh: ring, radius: 1.2, growth: 11.5, ttl: 0.64, damage: 42 + game.hero.level * 8 });
  addLog("Whirl of steel", "#fff1cd");
}

function getAimDirection() {
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(worldPlane, point);
  controls.aimPoint.copy(point);
  return point.sub(game.hero.group.position).setY(0).normalize();
}

function createDeathBurst(position, color) {
  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 10, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86 })
  );
  burst.position.copy(position);
  scene.add(burst);
  game.aoes.push({ mesh: burst, radius: 0, growth: 9, ttl: 0.3, damage: 0, visualOnly: true });
}

function spawnLootOrb(pos) {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xf7cf63, transparent: true, opacity: 0.95 })
  );
  orb.position.copy(pos).setY(0.3);
  scene.add(orb);
  game.lootOrbs.push({ mesh: orb, ttl: 10 });
}

function maybeDropItem(position) {
  const chance = Math.random();
  if (chance > 0.42) return;

  const table = [
    { name: "Crude Hatchet", tier: "magic", score: 4 },
    { name: "Cathedral Seal", tier: "magic", score: 4 },
    { name: "Hellforged Band", tier: "rare", score: 7 },
    { name: "Bonewoven Mantle", tier: "rare", score: 7 },
    { name: "The Searing Oath", tier: "legendary", score: 13 }
  ];

  const roll = Math.random();
  const item = { ...(roll > 0.95 ? table[4] : roll > 0.75 ? table[randInt(2, 3)] : table[randInt(0, 1)]) };
  item.icon = "";
  item.imageSource = "queued";
  game.drops.push(item);
  game.hero.maxLife += item.score;
  game.hero.maxMana += Math.floor(item.score * 0.6);
  game.hero.life = Math.min(game.hero.maxLife, game.hero.life + item.score);
  game.hero.mana = Math.min(game.hero.maxMana, game.hero.mana + item.score);

  if (game.drops.length > 6) game.drops.shift();
  queueItemImageGeneration(item);
  addLog(`Looted ${item.name}`, item.tier === "legendary" ? "#f9d47f" : "#d4e6ff");

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 6, 8),
    new THREE.MeshBasicMaterial({ color: item.tier === "legendary" ? 0xf9b34d : item.tier === "rare" ? 0x6ca7ff : 0x87dbc5, transparent: true, opacity: 0.65 })
  );
  beam.position.copy(position).setY(3);
  scene.add(beam);
  game.aoes.push({ mesh: beam, ttl: 1.5, growth: 0, radius: 0, visualOnly: true });
}

function setGeneratorStatus(message, color = "#a0d2ff") {
  ui.genStatus.textContent = message;
  ui.genStatus.style.color = color;
}

function queueItemImageGeneration(item) {
  imageGenerator.queue.push(item);
  processImageQueue();
}

async function processImageQueue() {
  if (imageGenerator.busy || imageGenerator.queue.length === 0) return;
  imageGenerator.busy = true;

  const item = imageGenerator.queue.shift();
  const key = `${item.tier}:${item.name}`;

  try {
    if (imageGenerator.cache.has(key)) {
      item.icon = imageGenerator.cache.get(key);
      item.imageSource = "cache";
      return;
    }

    if (imageGenerator.enabled && imageGenerator.key) {
      setGeneratorStatus(`Generating ${item.name} via ChatGPT image API...`, "#ffd79e");
      const image = await requestChatGPTItemImage(item);
      item.icon = image;
      item.imageSource = "chatgpt";
      imageGenerator.cache.set(key, image);
      setGeneratorStatus(`Generated art for ${item.name}.`, "#9ee6a0");
    } else {
      item.icon = generateLocalItemIcon(item);
      item.imageSource = "free-local";
      imageGenerator.cache.set(key, item.icon);
      setGeneratorStatus("Using free local icon generator (enable ChatGPT mode to use API).", "#c7d5e8");
    }
  } catch (error) {
    item.icon = generateLocalItemIcon(item);
    item.imageSource = "free-fallback";
    imageGenerator.cache.set(key, item.icon);
    setGeneratorStatus(`ChatGPT image failed: ${error.message}. Using free fallback icon.`, "#ffb5a3");
  } finally {
    imageGenerator.busy = false;
    if (imageGenerator.queue.length > 0) processImageQueue();
  }
}

async function requestChatGPTItemImage(item) {
  const prompt = `Diablo-style game item icon, centered, dramatic fantasy lighting, dark background, highly detailed digital painting of ${item.tier} item named ${item.name}, game-ready square icon`;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${imageGenerator.key}`
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "512x512"
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Missing image payload");
  return `data:image/png;base64,${b64}`;
}

function generateLocalItemIcon(item) {
  const [bright, mid, accent] = imageGenerator.fallbackPalette[item.tier] ?? imageGenerator.fallbackPalette.magic;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 96;
  canvasEl.height = 96;
  const ctx = canvasEl.getContext("2d");

  const gradient = ctx.createRadialGradient(40, 30, 4, 50, 52, 60);
  gradient.addColorStop(0, bright);
  gradient.addColorStop(0.62, mid);
  gradient.addColorStop(1, "#080808");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, 90, 90);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "bold 42px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.name.charAt(0).toUpperCase(), 48, 52);

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(6, 71, 84, 18);
  ctx.fillStyle = "#f7eee3";
  ctx.font = "bold 9px sans-serif";
  ctx.fillText(item.tier.toUpperCase(), 48, 80);
  return canvasEl.toDataURL("image/png");
}

function updateHero(dt) {
  const move = new THREE.Vector3(
    (controls.d ? 1 : 0) - (controls.a ? 1 : 0),
    0,
    (controls.s ? 1 : 0) - (controls.w ? 1 : 0)
  );

  if (move.lengthSq() > 0) {
    move.normalize();
    game.hero.group.position.addScaledVector(move, game.hero.speed * dt);
  }

  getAimDirection();
  const desiredYaw = Math.atan2(controls.aimPoint.x - game.hero.group.position.x, controls.aimPoint.z - game.hero.group.position.z);
  game.hero.group.rotation.y = THREE.MathUtils.damp(game.hero.group.rotation.y, desiredYaw, game.hero.rotationSpeed, dt);

  const camTarget = game.hero.group.position.clone().add(new THREE.Vector3(0, 23, 22));
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 5.4));
  camera.lookAt(game.hero.group.position);

  game.hero.mana = Math.min(game.hero.maxMana, game.hero.mana + dt * (8 + game.hero.level * 0.7));
  game.hero.cooldowns.fire = Math.max(0, game.hero.cooldowns.fire - dt);
  game.hero.cooldowns.spirit = Math.max(0, game.hero.cooldowns.spirit - dt);
  game.hero.cooldowns.whirl = Math.max(0, game.hero.cooldowns.whirl - dt);

  if (controls.fire && game.hero.cooldowns.fire <= 0) {
    shootFireBolt();
    game.hero.cooldowns.fire = 0.2;
  }

  if (controls.spirit && game.hero.cooldowns.spirit <= 0) {
    shootSpiritLance();
    game.hero.cooldowns.spirit = 0.65;
  }

  if (controls.whirl && game.hero.cooldowns.whirl <= 0) {
    castWhirl();
    game.hero.cooldowns.whirl = 9;
  }

  controls.whirl = false;
}

function updateProjectiles(dt) {
  for (let i = game.projectiles.length - 1; i >= 0; i -= 1) {
    const p = game.projectiles[i];
    p.ttl -= dt;
    p.mesh.position.addScaledVector(p.velocity, dt);

    let hitsThisFrame = 0;
    for (const enemy of game.activeEnemies) {
      if (enemy.dead) continue;
      const d = enemy.mesh.position.distanceTo(p.mesh.position);
      if (d < 0.8 + p.radius) {
        enemy.hit(p.damage);
        hitsThisFrame += 1;
        if (p.type === "fire") {
          p.ttl = -1;
        } else if (p.type === "spirit") {
          p.pierce -= 1;
          if (p.pierce < 0) p.ttl = -1;
        }
      }
    }

    if (hitsThisFrame > 0) {
      p.mesh.scale.multiplyScalar(0.94);
    }

    if (p.ttl <= 0) {
      scene.remove(p.mesh);
      game.projectiles.splice(i, 1);
    }
  }
}

function updateAoes(dt) {
  for (let i = game.aoes.length - 1; i >= 0; i -= 1) {
    const a = game.aoes[i];
    a.ttl -= dt;

    if (a.growth) {
      a.radius += a.growth * dt;
      a.mesh.scale.setScalar(1 + a.radius);
    }

    a.mesh.material.opacity = Math.max(0, a.ttl * 1.8);

    if (!a.visualOnly && a.damage > 0) {
      for (const enemy of game.activeEnemies) {
        if (enemy.dead) continue;
        const dist = enemy.mesh.position.distanceTo(a.mesh.position);
        if (dist < a.radius + 1.0) {
          enemy.hit(a.damage * dt * 2.2);
        }
      }
    }

    if (a.ttl <= 0) {
      scene.remove(a.mesh);
      game.aoes.splice(i, 1);
    }
  }
}

function updateLoot(dt) {
  for (let i = game.lootOrbs.length - 1; i >= 0; i -= 1) {
    const orb = game.lootOrbs[i];
    orb.ttl -= dt;
    orb.mesh.rotation.y += dt * 2;
    orb.mesh.position.y = 0.3 + Math.sin(performance.now() * 0.005 + i) * 0.06;

    if (orb.mesh.position.distanceTo(game.hero.group.position) < 2.1) {
      game.scoreGold += randInt(4, 12);
      scene.remove(orb.mesh);
      game.lootOrbs.splice(i, 1);
      continue;
    }

    if (orb.ttl <= 0) {
      scene.remove(orb.mesh);
      game.lootOrbs.splice(i, 1);
    }
  }
}

function spawnLoop(time) {
  const alive = game.activeEnemies.filter((e) => !e.dead).length;
  const cap = 7 + game.wave * 2;

  if (alive < cap && time - game.lastSpawnAt > game.spawnCooldown) {
    spawnEnemy();
    game.lastSpawnAt = time;
    game.spawnCooldown = Math.max(0.24, 1.05 - game.wave * 0.08);
  }
}

function checkWaveProgress() {
  const nextMilestone = game.targetKillMilestones[game.wave - 1] ?? (game.wave * 35);
  if (game.kills >= nextMilestone) {
    game.wave += 1;
    addLog(`Wave ${game.wave} begins. Demons grow stronger.`, "#ffb98d");
    ui.objective.textContent = `Wave ${game.wave}: eliminate corrupted fiends and survive escalating pressure.`;
  }
}

function updateEnemies(dt) {
  for (let i = game.activeEnemies.length - 1; i >= 0; i -= 1) {
    const e = game.activeEnemies[i];
    if (e.dead) {
      game.activeEnemies.splice(i, 1);
      continue;
    }
    e.update(dt);
  }
}

function addLog(text, color = "#f3e7d0") {
  game.combatLog.push({ text, color });
  if (game.combatLog.length > 8) game.combatLog.shift();
}

function refreshUI() {
  const h = game.hero;
  ui.lifeFill.style.width = `${(h.life / h.maxLife) * 100}%`;
  ui.manaFill.style.width = `${(h.mana / h.maxMana) * 100}%`;
  ui.xpFill.style.width = `${(h.xp / h.nextLevelXp) * 100}%`;

  ui.lifeText.textContent = `${Math.round(h.life)} / ${Math.round(h.maxLife)}`;
  ui.manaText.textContent = `${Math.round(h.mana)} / ${Math.round(h.maxMana)}`;
  ui.xpText.textContent = `${Math.round(h.xp)} / ${h.nextLevelXp}`;
  ui.level.textContent = `${h.level}`;
  ui.kills.textContent = `${game.kills}`;
  ui.gold.textContent = `${game.scoreGold}`;

  ui.logEntries.innerHTML = game.combatLog
    .map((entry) => `<li style="color:${entry.color}">${entry.text}</li>`)
    .join("");

  ui.drops.innerHTML = game.drops
    .slice()
    .reverse()
    .map((item) => `
      <div class="drop ${item.tier}">
        <img src="${item.icon || generateLocalItemIcon(item)}" alt="${item.name} icon" />
        <div class="meta">
          <span>${item.name}</span>
          <small>${item.tier.toUpperCase()} · ${item.imageSource || "pending"}</small>
        </div>
      </div>
    `)
    .join("");

  for (const [key, el] of Object.entries(ui.cooldowns)) {
    const cd = game.hero.cooldowns[key];
    if (cd <= 0) {
      el.textContent = "Ready";
      el.classList.add("ready");
    } else {
      el.textContent = `${cd.toFixed(1)}s`;
      el.classList.remove("ready");
    }
  }
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function initInput() {
  ui.chatgptMode.addEventListener("change", () => {
    imageGenerator.enabled = ui.chatgptMode.checked;
    setGeneratorStatus(
      imageGenerator.enabled
        ? "ChatGPT image mode enabled. New loot will request OpenAI image generations."
        : "ChatGPT image mode disabled. Using free local icon generator.",
      imageGenerator.enabled ? "#9ee6a0" : "#c7d5e8"
    );
  });

  ui.openaiApiKey.addEventListener("input", () => {
    imageGenerator.key = ui.openaiApiKey.value.trim();
    if (!imageGenerator.key) {
      setGeneratorStatus("No API key set. Free local generation remains active.", "#ffd79e");
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener("mousemove", (ev) => {
    pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  });

  window.addEventListener("contextmenu", (ev) => ev.preventDefault());

  window.addEventListener("mousedown", (ev) => {
    if (ev.button === 0) controls.fire = true;
    if (ev.button === 2) controls.spirit = true;
  });

  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 0) controls.fire = false;
    if (ev.button === 2) controls.spirit = false;
  });

  window.addEventListener("keydown", (ev) => {
    const k = ev.key.toLowerCase();
    if (k in controls) controls[k] = true;
    if (ev.code === "Space") {
      controls.whirl = true;
      ev.preventDefault();
    }
  });

  window.addEventListener("keyup", (ev) => {
    const k = ev.key.toLowerCase();
    if (k in controls) controls[k] = false;
  });
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;

  if (!game.gameOver) {
    updateHero(dt);
    spawnLoop(elapsed);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateAoes(dt);
    updateLoot(dt);
  }

  refreshUI();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function start() {
  createEnvironment();
  game.hero = new Hero();
  initInput();

  pointer.x = 0;
  pointer.y = 0;

  addLog("Entered The Fallen Cathedral", "#ead8bd");
  addLog("Hold LMB to cast Fire Bolt", "#ffc27f");
  addLog("Hold RMB for Spirit Lance · Space for Whirl", "#a9cbff");
  ui.objective.textContent = "Wave 1: clear cultists and gather infernal loot.";

  animate();
}

start();
