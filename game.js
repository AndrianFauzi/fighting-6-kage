/* ============================================================
   6 KAGE — Fighting Game
   game.js  |  Vanilla JS, Canvas 2D
   ============================================================ */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────
const GRAVITY        = 0.55;
const GROUND_RATIO   = 0.78;   // ground line at 78 % of canvas height
const PLAYER_W       = 52;
const PLAYER_H       = 72;
const ATTACK_RANGE   = 78;     // px from player edge
const ATTACK_FRAMES  = 18;     // how many frames the hitbox is active
const HURT_FRAMES    = 14;     // invincibility / stagger frames
const ATTACK_CD      = 26;     // cooldown frames between attacks
const KB_X           = 8;      // knockback horizontal force
const KB_Y           = -5;     // knockback vertical force
const COUNTDOWN_F    = 100;    // frames before "FIGHT!" ends
const ROUND_END_MS   = 1800;   // ms before next round starts
const WINS_NEEDED    = 2;      // best of 3

// Pre-baked star field (ratio coords, generated once)
const STARS = Array.from({ length: 24 }, () => ({
  rx: Math.random(),
  ry: Math.random() * 0.55,
  r:  Math.random() * 1.4 + 0.5
}));

// ─── CHARACTER DEFINITIONS ────────────────────────────────────
const CHARACTERS = [
  {
    id: 'kodok',
    name: 'Pangeran Kodok',
    sub:  'Frog Prince',
    hp: 90, speed: 4.5, jumpF: -15.5, atk: 14,
    col: '#2ECC40', acc: '#A8FF78', drk: '#145A1C',
    special: null,
    desc: 'High jump · Medium damage'
  },
  {
    id: 'kerbau',
    name: 'Pangeran Kerbau',
    sub:  'Buffalo Prince',
    hp: 150, speed: 2.4, jumpF: -11, atk: 28,
    col: '#8B5E3C', acc: '#C49A6C', drk: '#3E1A06',
    special: null,
    desc: 'Slow · High HP · Big damage'
  },
  {
    id: 'bulu',
    name: 'Pangeran Bulu',
    sub:  'Feather Prince',
    hp: 68, speed: 7.8, jumpF: -14, atk: 8,
    col: '#FF6EB4', acc: '#FFD6EC', drk: '#8B1A5E',
    special: null,
    desc: 'Ultra fast · Fragile'
  },
  {
    id: 'bensin',
    name: 'Pangeran Bensin',
    sub:  'Gasoline Prince',
    hp: 100, speed: 4.4, jumpF: -14, atk: 11,
    col: '#FF5500', acc: '#FFD600', drk: '#7A2200',
    special: 'burn',
    desc: 'Burns enemies over time'
  },
  {
    id: 'cabo',
    name: 'Pangeran Cabo',
    sub:  'Street Prince',
    hp: 100, speed: 5.0, jumpF: -14.5, atk: 15,
    col: '#9B59B6', acc: '#E74C3C', drk: '#4A235A',
    special: null,
    desc: 'Balanced · Street fighter'
  },
  {
    id: 'galon',
    name: 'Pangeran Galon',
    sub:  'Gallon Prince',
    hp: 130, speed: 2.9, jumpF: -12, atk: 11,
    col: '#2980B9', acc: '#85C1E9', drk: '#154360',
    special: 'regen',
    desc: 'Tanky · Slowly regens HP'
  }
];

// ─── GAME STATE ───────────────────────────────────────────────
let canvas, ctx;
let gameState  = 'select';   // 'select' | 'playing' | 'gameOver'
let p1Choice   = null;
let p2Choice   = null;
let p1Wins     = 0;
let p2Wins     = 0;
let roundNum   = 1;
let roundPhase = 'countdown'; // 'countdown' | 'fight' | 'end'
let roundTimer = 0;
let players    = [];
let effects    = [];
let animTick   = 0;
let loopRunning = false;

// ─── PLAYER FACTORY ───────────────────────────────────────────
function mkPlayer(char, num) {
  const isLeft = (num === 1);
  return {
    char, num,
    x: 0, y: 0,           // set on startRound
    vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_H,
    maxHp: char.hp,
    hp:    char.hp,
    onGround: true,
    facing: isLeft ? 1 : -1,   // 1 = right, -1 = left
    state: 'idle',             // idle|walk|jump|attack|hurt|dead
    atkTimer: 0,
    hurtTimer: 0,
    atkCd: 0,
    burnTimer: 0,
    regenTimer: 0,
    walkCycle: 0,
    anim: 0,
    // live key states
    keys: { left:false, right:false, jump:false, attack:false },
    // queued one-shot actions
    qJump: false,
    qAtk:  false
  };
}

// ─── INPUT ────────────────────────────────────────────────────
// Keyboard bindings: P1 = WASD + G,  P2 = Arrow keys + L
const KB_MAP = {
  'a':          { pi:0, k:'left'   },
  'd':          { pi:0, k:'right'  },
  'w':          { pi:0, k:'jump'   },
  'g':          { pi:0, k:'attack' },
  'ArrowLeft':  { pi:1, k:'left'   },
  'ArrowRight': { pi:1, k:'right'  },
  'ArrowUp':    { pi:1, k:'jump'   },
  'l':          { pi:1, k:'attack' }
};

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const m = KB_MAP[e.key];
    if (!m || !players[m.pi]) return;
    const p = players[m.pi];
    if (m.k === 'jump'   && !p.keys.jump)   p.qJump = true;
    if (m.k === 'attack' && !p.keys.attack) p.qAtk  = true;
    p.keys[m.k] = true;
    e.preventDefault();
  });
  document.addEventListener('keyup', e => {
    const m = KB_MAP[e.key];
    if (m && players[m.pi]) players[m.pi].keys[m.k] = false;
  });
}

function setupTouchControls() {
  document.querySelectorAll('.ctrl-btn').forEach(btn => {
    const pi = parseInt(btn.dataset.player, 10);
    const k  = btn.dataset.key;
    if (isNaN(pi) || !k) return;

    const press = e => {
      e.preventDefault();
      if (!players[pi]) return;
      const p = players[pi];
      if (k === 'jump'   && !p.keys.jump)   p.qJump = true;
      if (k === 'attack' && !p.keys.attack) p.qAtk  = true;
      p.keys[k] = true;
      btn.classList.add('pressed');
    };
    const release = e => {
      e.preventDefault();
      if (players[pi]) players[pi].keys[k] = false;
      btn.classList.remove('pressed');
    };

    btn.addEventListener('touchstart',  press,   { passive:false });
    btn.addEventListener('touchend',    release, { passive:false });
    btn.addEventListener('touchcancel', release, { passive:false });
    btn.addEventListener('mousedown',   press);
    btn.addEventListener('mouseup',     release);
    btn.addEventListener('mouseleave',  release);
  });
}

// ─── CANVAS RESIZE ────────────────────────────────────────────
function resizeCanvas() {
  const gs  = document.getElementById('game-screen');
  const hud = document.querySelector('.game-hud');
  const ctr = document.querySelector('.controls-container');
  const aw  = gs.clientWidth;
  const ah  = gs.clientHeight - (hud ? hud.offsetHeight : 52)
                               - (ctr ? ctr.offsetHeight : 96);
  if (canvas.width !== aw || canvas.height !== ah) {
    canvas.width  = aw;
    canvas.height = Math.max(ah, 120);
    // Clamp players to new ground on resize
    if (players.length) {
      const gy = groundY();
      players.forEach(p => { if (p.y > gy + 40) p.y = gy; });
    }
  }
}

function groundY() { return canvas.height * GROUND_RATIO; }

// ─── PHYSICS UPDATE ───────────────────────────────────────────
function updatePlayer(p, opp) {
  if (p.state === 'dead') return;

  // Tick timers
  if (p.atkTimer  > 0) p.atkTimer--;
  if (p.hurtTimer > 0) p.hurtTimer--;
  if (p.atkCd     > 0) p.atkCd--;
  p.anim++;

  // ── Special: Galon HP regen ──────────────────────────────
  if (p.char.special === 'regen' && p.hp < p.maxHp) {
    p.regenTimer++;
    if (p.regenTimer >= 90) {   // every 1.5 s
      p.hp = Math.min(p.maxHp, p.hp + 1);
      p.regenTimer = 0;
      spawnEffect(p.x + p.w / 2, p.y - p.h / 2, 'regen');
    }
  }

  // ── Special: Burn damage ─────────────────────────────────
  if (p.burnTimer > 0) {
    p.burnTimer--;
    if (p.burnTimer % 30 === 0) {
      applyDamage(p, 3, 0, 0);
      spawnEffect(p.x + p.w / 2, p.y - p.h + 5, 'burn');
    }
  }

  // ── Determine visible state ──────────────────────────────
  if      (p.hurtTimer > 0)  p.state = 'hurt';
  else if (p.atkTimer  > 0)  p.state = 'attack';
  else if (!p.onGround)       p.state = 'jump';
  else if (p.keys.left || p.keys.right) {
    p.state = 'walk';
    p.walkCycle = Math.floor(p.anim / 8) % 4;
  } else {
    p.state = 'idle';
  }

  // ── Movement (blocked during hurt stagger) ───────────────
  if (p.hurtTimer === 0) {
    if      (p.keys.left)  { p.vx = -p.char.speed; p.facing = -1; }
    else if (p.keys.right) { p.vx =  p.char.speed; p.facing =  1; }
    else                    p.vx *= 0.72;   // friction
  }

  // ── Jump ─────────────────────────────────────────────────
  if (p.qJump && p.onGround && p.hurtTimer === 0) {
    p.vy = p.char.jumpF;
    p.onGround = false;
    playSound('jump');
  }
  p.qJump = false;

  // ── Attack ───────────────────────────────────────────────
  if (p.qAtk && p.atkTimer === 0 && p.atkCd === 0 && p.hurtTimer === 0) {
    p.atkTimer = ATTACK_FRAMES;
    p.atkCd    = ATTACK_CD;
    checkHit(p, opp);
    playSound('swing');
  }
  p.qAtk = false;

  // ── Gravity & integrate ───────────────────────────────────
  p.vy += GRAVITY;
  p.x  += p.vx;
  p.y  += p.vy;

  // ── Ground collision ─────────────────────────────────────
  const gy = groundY();
  if (p.y >= gy) {
    p.y = gy;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }

  // ── Wall boundaries ───────────────────────────────────────
  if (p.x < 4)                      { p.x = 4;                      p.vx = 0; }
  if (p.x + p.w > canvas.width - 4) { p.x = canvas.width - 4 - p.w; p.vx = 0; }

  refreshHpBar(p);
}

// ─── COMBAT ───────────────────────────────────────────────────
function checkHit(attacker, defender) {
  if (defender.state === 'dead') return;

  // Attack hitbox extends from attacker's front edge
  const aLeft  = attacker.facing === 1
    ? attacker.x + attacker.w
    : attacker.x - ATTACK_RANGE;
  const aRight = aLeft + ATTACK_RANGE;

  const dLeft  = defender.x;
  const dRight = defender.x + defender.w;

  const hitH = aLeft < dRight && aRight > dLeft;
  const hitV = Math.abs(
    (attacker.y - attacker.h / 2) - (defender.y - defender.h / 2)
  ) < 90;

  if (hitH && hitV) {
    const kbx = attacker.facing * KB_X;
    applyDamage(defender, attacker.char.atk, kbx, KB_Y);

    if (attacker.char.special === 'burn') {
      defender.burnTimer = 180;   // 3 s burn
    }
    spawnEffect(
      defender.x + defender.w / 2,
      defender.y - defender.h * 0.5,
      'hit'
    );
    playSound('hit');
  }
}

function applyDamage(p, dmg, kbx, kby) {
  if (p.state === 'dead' || p.hurtTimer > 0) return;
  p.hp -= dmg;
  p.hurtTimer = HURT_FRAMES;
  p.vx = kbx;
  p.vy = kby;
  p.onGround = false;

  if (p.hp <= 0) {
    p.hp    = 0;
    p.state = 'dead';
    endRound();
  }
  refreshHpBar(p);
}

// ─── HP BAR DOM UPDATE ────────────────────────────────────────
function refreshHpBar(p) {
  const id  = p.num === 1 ? 'p1-hp' : 'p2-hp';
  const bar = document.getElementById(id);
  if (!bar) return;
  const pct = Math.max(0, (p.hp / p.maxHp) * 100);
  bar.style.width = pct + '%';
  if      (pct > 50) bar.style.background = 'linear-gradient(90deg,#27ae60,#2ecc71)';
  else if (pct > 25) bar.style.background = 'linear-gradient(90deg,#d35400,#f39c12)';
  else               bar.style.background = 'linear-gradient(90deg,#922b21,#e74c3c)';
}

// ─── VISUAL EFFECTS ───────────────────────────────────────────
function spawnEffect(x, y, type) {
  effects.push({ x, y, type, life: 28, max: 28 });
}

function tickEffects() {
  for (let i = effects.length - 1; i >= 0; i--) {
    if (--effects[i].life <= 0) effects.splice(i, 1);
  }
}

// ─── BACKGROUND DRAW ──────────────────────────────────────────
function drawBg(gy) {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0,   '#0d0d22');
  sky.addColorStop(0.6, '#131330');
  sky.addColorStop(1,   '#1a2050');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  STARS.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.rx * canvas.width, s.ry * canvas.height, s.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Ground
  const gnd = ctx.createLinearGradient(0, gy, 0, canvas.height);
  gnd.addColorStop(0,   '#2d5a27');
  gnd.addColorStop(0.4, '#183814');
  gnd.addColorStop(1,   '#0a1a08');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, gy, canvas.width, canvas.height - gy);

  // Ground highlight line
  ctx.fillStyle = '#4a8c42';
  ctx.fillRect(0, gy, canvas.width, 3);

  // Torches
  drawTorches(gy);
}

function drawTorches(gy) {
  [0.14, 0.5, 0.86].forEach(rx => {
    const tx = rx * canvas.width;
    const ty = gy - 38;
    const fl = Math.sin(animTick * 0.12) * 3;

    // Pole
    ctx.fillStyle = '#7a5c1a';
    ctx.fillRect(tx - 3, ty, 6, 38);

    // Outer flame
    ctx.fillStyle = `rgba(255,${80 + fl * 6},0,0.85)`;
    ctx.beginPath();
    ctx.ellipse(tx, ty - 8 + fl, 7, 11 + fl, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner flame
    ctx.fillStyle = `rgba(255,230,50,0.75)`;
    ctx.beginPath();
    ctx.ellipse(tx, ty - 5 + fl, 3.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glow
    const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 22);
    glow.addColorStop(0,   'rgba(255,120,0,0.22)');
    glow.addColorStop(1,   'rgba(255,120,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tx, ty, 22, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ─── PLAYER DRAW ──────────────────────────────────────────────
function drawPlayer(p) {
  const cx = p.x + p.w / 2;
  const cy = p.y;

  ctx.save();

  // Hurt flash
  if (p.hurtTimer > 0 && Math.floor(p.hurtTimer / 3) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  // Dead: tip over
  if (p.state === 'dead') {
    ctx.translate(cx, cy);
    ctx.rotate(p.facing * Math.PI / 2);
    ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.45);
    drawCharacter(p);
    ctx.restore();
    return;
  }

  // Walk bob
  let bob = 0;
  if (p.state === 'walk') bob = Math.sin(p.anim * 0.4) * 2;

  ctx.translate(cx, cy + bob);
  if (p.facing === -1) ctx.scale(-1, 1);

  drawCharacter(p);

  // Attack arc flash
  if (p.atkTimer > 0) {
    const pct = p.atkTimer / ATTACK_FRAMES;
    ctx.save();
    ctx.globalAlpha = pct * 0.75;
    ctx.strokeStyle = p.char.acc;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(p.w / 2, -p.h / 2, ATTACK_RANGE * 0.5, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // Player label tag
  ctx.save();
  ctx.font = 'bold 9px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cx - 18, p.y - p.h - 16, 36, 13);
  ctx.fillStyle = '#fff';
  ctx.fillText('P' + p.num, cx, p.y - p.h - 6);
  ctx.restore();
}

// Dispatch to per-character drawing function
function drawCharacter(p) {
  const fn = CHAR_DRAW[p.char.id];
  if (fn) fn(p);
  else    drawFallback(p);
}

// ─── CHARACTER ART FUNCTIONS ─────────────────────────────────
// All draw centered at (0,0) = bottom-center, up = negative Y.
// p.h is the full height. p.facing is already handled by ctx.scale.

const CHAR_DRAW = {

  // ── Kodok (Frog Prince) ──────────────────────────────────
  kodok(p) {
    const H = p.h;

    // Rear legs
    ctx.fillStyle = p.char.col;
    ctx.beginPath(); ctx.ellipse(-17, -H*0.15, 8, 14, -0.4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 17, -H*0.15, 8, 14,  0.4, 0, Math.PI*2); ctx.fill();

    // Body (round)
    ctx.fillStyle = p.char.col;
    ctx.beginPath(); ctx.ellipse(0, -H*0.42, 22, 24, 0, 0, Math.PI*2); ctx.fill();

    // Belly
    ctx.fillStyle = '#CCFFCC';
    ctx.beginPath(); ctx.ellipse(0, -H*0.36, 14, 17, 0, 0, Math.PI*2); ctx.fill();

    // Head
    ctx.fillStyle = p.char.col;
    ctx.beginPath(); ctx.ellipse(0, -H*0.72, 18, 17, 0, 0, Math.PI*2); ctx.fill();

    // Eyes (bulging)
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.ellipse(-10, -H*0.77, 9, 9, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 10, -H*0.77, 9, 9, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(-10, -H*0.77, 5, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 10, -H*0.77, 5, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(-8, -H*0.80, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 12, -H*0.80, 2, 0, Math.PI*2); ctx.fill();

    // Crown
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(-10, -H*0.88); ctx.lineTo(-10, -H*0.80);
    ctx.lineTo(-5,  -H*0.84); ctx.lineTo(0,   -H*0.80);
    ctx.lineTo(5,   -H*0.84); ctx.lineTo(10,  -H*0.80);
    ctx.lineTo(10,  -H*0.88); ctx.closePath(); ctx.fill();

    // Arms (attack pose)
    ctx.fillStyle = p.char.col;
    if (p.atkTimer > 0) {
      ctx.beginPath(); ctx.ellipse(28, -H*0.55, 11, 8, 0, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(22, -H*0.52, 7, 6, 0.3, 0, Math.PI*2); ctx.fill();
    }
  },

  // ── Kerbau (Buffalo Prince) ──────────────────────────────
  kerbau(p) {
    const H = p.h;

    // Thick legs
    ctx.fillStyle = p.char.drk;
    ctx.fillRect(-20, -H*0.22, 14, H*0.22);
    ctx.fillRect(  6, -H*0.22, 14, H*0.22);

    // Body (massive)
    ctx.fillStyle = p.char.col;
    ctx.beginPath(); ctx.ellipse(0, -H*0.42, 26, 28, 0, 0, Math.PI*2); ctx.fill();

    // Head
    ctx.fillStyle = p.char.acc;
    ctx.beginPath(); ctx.ellipse(4, -H*0.72, 19, 17, 0, 0, Math.PI*2); ctx.fill();

    // Horns
    ctx.fillStyle = '#EDE0C4';
    ctx.beginPath();
    ctx.moveTo(-8, -H*0.83); ctx.lineTo(-22, -H*0.97); ctx.lineTo(-4, -H*0.86); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, -H*0.83); ctx.lineTo(30,  -H*0.97); ctx.lineTo(20, -H*0.86); ctx.closePath(); ctx.fill();

    // Eyes (red anger)
    ctx.fillStyle = '#CC0000';
    ctx.beginPath(); ctx.ellipse(-2, -H*0.73, 4, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -H*0.73, 4, 4, 0, 0, Math.PI*2); ctx.fill();

    // Snout + ring
    ctx.fillStyle = p.char.col;
    ctx.beginPath(); ctx.ellipse(8, -H*0.65, 10, 8, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(8, -H*0.63, 5, 0, Math.PI*2); ctx.stroke();

    // Arm / attack
    ctx.fillStyle = p.char.col;
    if (p.atkTimer > 0) {
      ctx.beginPath(); ctx.ellipse(30, -H*0.55, 14, 10, 0, 0, Math.PI*2); ctx.fill();
    }
  },

  // ── Bulu (Feather Prince) ────────────────────────────────
  bulu(p) {
    const H = p.h;
    const sway = Math.sin(animTick * 0.18) * 3;

    // Left wing feathers
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(-16 + i*2, -H*0.48 + i*5);
      ctx.rotate(-0.5 + i*0.12);
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // Right wing feathers
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(16 - i*2, -H*0.48 + i*5);
      ctx.rotate(0.5 - i*0.12);
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Slim body
    ctx.fillStyle = p.char.col;
    ctx.beginPath(); ctx.ellipse(0, -H*0.42, 13, 21, 0, 0, Math.PI*2); ctx.fill();

    // Head
    ctx.beginPath(); ctx.ellipse(0, -H*0.73, 12, 12, 0, 0, Math.PI*2); ctx.fill();

    // Crest feathers
    ctx.fillStyle = '#FF1493';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i*6, -H*0.82);
      ctx.lineTo(i*4 + sway, -H*0.97 + Math.abs(i)*3);
      ctx.lineTo(i*8,        -H*0.87);
      ctx.closePath(); ctx.fill();
    }

    // Eyes
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-4, -H*0.74, 3, 3.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 5, -H*0.74, 3, 3.5, 0, 0, Math.PI*2); ctx.fill();

    // Attack: speed lines
    if (p.atkTimer > 0) {
      ctx.strokeStyle = p.char.acc;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(16, -H*0.62 + i*10);
        ctx.lineTo(38, -H*0.62 + i*10);
        ctx.stroke();
      }
    }
  },

  // ── Bensin (Gasoline Prince) ─────────────────────────────
  bensin(p) {
    const H  = p.h;
    const fl = Math.sin(animTick * 0.14) * 3;

    // Floor fire aura
    ctx.fillStyle = 'rgba(255,80,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, -H*0.08, 22, 10, 0, 0, Math.PI*2); ctx.fill();

    // Body
    ctx.fillStyle = p.char.drk;
    ctx.beginPath(); ctx.ellipse(0, -H*0.40, 19, 25, 0, 0, Math.PI*2); ctx.fill();

    // Flame stripes on body
    ctx.fillStyle = p.char.col;
    ctx.beginPath();
    ctx.moveTo(-4, -H*0.58); ctx.lineTo(0, -H*0.72); ctx.lineTo(4, -H*0.58); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-11, -H*0.48); ctx.lineTo(-7, -H*0.60); ctx.lineTo(-3, -H*0.48); ctx.closePath(); ctx.fill();

    // Head
    ctx.fillStyle = '#2c1208';
    ctx.beginPath(); ctx.ellipse(0, -H*0.72, 14, 14, 0, 0, Math.PI*2); ctx.fill();

    // Flame hair
    ctx.fillStyle = p.char.col;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i*5, -H*0.82);
      ctx.lineTo(i*3.5 + fl,    -H*0.97 + Math.abs(i)*2);
      ctx.lineTo(i*7   - fl*0.4, -H*0.86);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#FFD600';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i*5, -H*0.84);
      ctx.lineTo(i*3 + fl*0.6, -H*0.95);
      ctx.lineTo(i*7 - fl*0.6, -H*0.88);
      ctx.closePath(); ctx.fill();
    }

    // Glowing eyes
    ctx.fillStyle = '#FFD600';
    ctx.beginPath(); ctx.ellipse(-5, -H*0.73, 4.5, 4.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 6, -H*0.73, 4.5, 4.5, 0, 0, Math.PI*2); ctx.fill();

    // Attack: fireball
    if (p.atkTimer > 0) {
      const a = p.atkTimer / ATTACK_FRAMES;
      ctx.fillStyle = `rgba(255,${80 + a*140},0,${a})`;
      ctx.beginPath(); ctx.ellipse(32, -H*0.52, 17, 11, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(255,230,0,${a*0.7})`;
      ctx.beginPath(); ctx.ellipse(32, -H*0.52, 9, 6, 0, 0, Math.PI*2); ctx.fill();
    }
  },

  // ── Cabo (Street Prince) ─────────────────────────────────
  cabo(p) {
    const H = p.h;

    // Legs
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-18, -H*0.22, 13, H*0.22);
    ctx.fillRect(  5, -H*0.22, 13, H*0.22);

    // Body / tank top
    ctx.fillStyle = p.char.drk;
    ctx.beginPath(); ctx.ellipse(0, -H*0.42, 20, 25, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = p.char.acc;  // red tank top
    ctx.beginPath(); ctx.ellipse(0, -H*0.46, 14, 18, 0, 0, Math.PI*2); ctx.fill();

    // Tattoo lines
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, -H*0.55); ctx.lineTo(-4, -H*0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 5, -H*0.55); ctx.lineTo( 9, -H*0.40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -H*0.42); ctx.lineTo( 6, -H*0.38); ctx.stroke();

    // Head (skin tone)
    ctx.fillStyle = '#C8844A';
    ctx.beginPath(); ctx.ellipse(2, -H*0.73, 14, 14, 0, 0, Math.PI*2); ctx.fill();

    // Mohawk
    ctx.fillStyle = p.char.col;
    ctx.beginPath();
    ctx.moveTo(-4, -H*0.83); ctx.lineTo(0, -H*0.98); ctx.lineTo(4, -H*0.83); ctx.closePath(); ctx.fill();

    // Face tattoo
    ctx.strokeStyle = 'rgba(180,100,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, -H*0.76); ctx.lineTo(-5, -H*0.72); ctx.stroke();

    // Eyes (narrow)
    ctx.fillStyle = '#111';
    ctx.fillRect(-7, -H*0.76, 5, 3);
    ctx.fillRect( 4, -H*0.76, 5, 3);

    // Attack: punch + impact star
    if (p.atkTimer > 0) {
      ctx.fillStyle = '#C8844A';
      ctx.beginPath(); ctx.ellipse(30, -H*0.55, 13, 9, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
      for (let a = 0; a < Math.PI*2; a += Math.PI/4) {
        ctx.beginPath();
        ctx.moveTo(30 + Math.cos(a)*6,  -H*0.55 + Math.sin(a)*6);
        ctx.lineTo(30 + Math.cos(a)*14, -H*0.55 + Math.sin(a)*14);
        ctx.stroke();
      }
    }
  },

  // ── Galon (Gallon Prince) ────────────────────────────────
  galon(p) {
    const H  = p.h;
    const bub = Math.sin(animTick * 0.06);

    // Barrel body
    ctx.fillStyle = p.char.col;
    ctx.beginPath(); ctx.ellipse(0, -H*0.37, 25, 28, 0, 0, Math.PI*2); ctx.fill();

    // Water inside (semi-transparent)
    ctx.fillStyle = 'rgba(120,210,255,0.38)';
    ctx.beginPath(); ctx.ellipse(0, -H*0.37, 19, 22, 0, 0, Math.PI*2); ctx.fill();

    // Barrel rings
    ctx.strokeStyle = p.char.drk; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -H*0.27, 25, 6, 0, 0, Math.PI*2);  ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -H*0.48, 25, 6, 0, 0, Math.PI*2);  ctx.stroke();

    // Side handle
    ctx.strokeStyle = p.char.drk; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(27, -H*0.45, 11, -Math.PI/2, Math.PI/2); ctx.stroke();

    // Neck
    ctx.fillStyle = p.char.acc;
    ctx.fillRect(-8, -H*0.72, 16, 8);

    // Cap / head
    ctx.fillStyle = p.char.drk;
    ctx.beginPath(); ctx.ellipse(0, -H*0.74, 13, 10, 0, 0, Math.PI*2); ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.ellipse(-5, -H*0.75, 5, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 6, -H*0.75, 5, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = p.char.drk;
    ctx.beginPath(); ctx.ellipse(-5, -H*0.75, 2.5, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 6, -H*0.75, 2.5, 3, 0, 0, Math.PI*2); ctx.fill();

    // Bubbles
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(-7, -H*0.38 + bub*5, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 5, -H*0.48 + bub*4, 2.5, 0, Math.PI*2); ctx.fill();

    // Attack: water splash
    if (p.atkTimer > 0) {
      const a = p.atkTimer / ATTACK_FRAMES;
      ctx.fillStyle = `rgba(80,180,255,${a})`;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(24 + i*9, -H*0.42 + Math.sin(i*1.2)*7, 6, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
};

function drawFallback(p) {
  ctx.fillStyle = p.char.col;
  ctx.fillRect(-p.w/2, -p.h, p.w, p.h);
}

// ─── EFFECTS DRAW ─────────────────────────────────────────────
function drawEffects() {
  effects.forEach(e => {
    const t = e.life / e.max;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalAlpha = t;

    if (e.type === 'hit') {
      const s = 1 + (1 - t) * 0.6;
      // Burst ring
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth   = 2.5;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 5 * s,  Math.sin(a) * 5 * s);
        ctx.lineTo(Math.cos(a) * 20 * s, Math.sin(a) * 20 * s);
        ctx.stroke();
      }
      ctx.fillStyle = '#FF4500';
      ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, Math.PI * 2); ctx.fill();
    }

    if (e.type === 'burn') {
      ctx.fillStyle = '#FF6600';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFD600';
      ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    if (e.type === 'regen') {
      ctx.fillStyle = '#00E676';
      ctx.font = `bold ${Math.floor(13 * (0.8 + t * 0.4))}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('+HP', 0, 0);
    }

    ctx.restore();
  });
}

// ─── OVERLAY (countdown / announcements) ──────────────────────
function drawOverlay(gy) {
  if (roundPhase !== 'countdown') return;

  const prog  = roundTimer / COUNTDOWN_F;
  const alpha = Math.max(0, 1 - prog * 2);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const fs = Math.floor(canvas.width * 0.06);
  ctx.textAlign = 'center';

  ctx.font      = `bold ${fs}px Arial`;
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`ROUND ${roundNum}`, canvas.width / 2, canvas.height * 0.38);

  const count = Math.ceil((COUNTDOWN_F - roundTimer) / (COUNTDOWN_F / 4));
  if (count > 0) {
    ctx.font      = `bold ${Math.floor(fs * 1.7)}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(String(count), canvas.width / 2, canvas.height * 0.58);
  } else {
    ctx.font      = `bold ${Math.floor(fs * 1.5)}px Arial`;
    ctx.fillStyle = '#00E676';
    ctx.fillText('FIGHT!', canvas.width / 2, canvas.height * 0.58);
  }

  ctx.restore();
}

// ─── ROUND MANAGEMENT ─────────────────────────────────────────
function startRound() {
  resizeCanvas();
  const gy = groundY();

  players[0].x = canvas.width * 0.22;
  players[0].y = gy;
  players[0].facing = 1;

  players[1].x = canvas.width * 0.78 - PLAYER_W;
  players[1].y = gy;
  players[1].facing = -1;

  players.forEach(p => {
    p.vx = p.vy = 0;
    p.hp = p.maxHp;
    p.state     = 'idle';
    p.onGround  = true;
    p.atkTimer  = 0;
    p.hurtTimer = 0;
    p.atkCd     = 0;
    p.burnTimer = 0;
    p.regenTimer = 0;
    p.qJump = p.qAtk = false;
    p.keys  = { left:false, right:false, jump:false, attack:false };
    refreshHpBar(p);
  });

  effects    = [];
  roundTimer = 0;
  roundPhase = 'countdown';
}

function endRound() {
  if (roundPhase === 'end') return;  // prevent double trigger
  roundPhase = 'end';

  // Determine this round's winner
  const p1Dead = players[0].hp <= 0;
  if (p1Dead) p2Wins++; else p1Wins++;

  document.getElementById('p1-wins').textContent = p1Wins;
  document.getElementById('p2-wins').textContent = p2Wins;

  if (p1Wins >= WINS_NEEDED || p2Wins >= WINS_NEEDED) {
    const winnerIdx = p1Wins >= WINS_NEEDED ? 0 : 1;
    setTimeout(() => showEndScreen(winnerIdx), ROUND_END_MS);
  } else {
    roundNum++;
    document.getElementById('round-label').textContent = `Round ${roundNum}`;
    setTimeout(startRound, ROUND_END_MS);
  }
}

function showEndScreen(wi) {
  const winner = players[wi];

  document.getElementById('winner-announce').textContent =
    `${winner.char.sub} Wins!`;
  document.getElementById('final-score').textContent =
    `${p1Wins}  —  ${p2Wins}`;

  // Render winner on small canvas
  const wc  = document.getElementById('winner-canvas');
  const wctx = wc.getContext('2d');
  wctx.clearRect(0, 0, wc.width, wc.height);
  wctx.save();
  wctx.translate(60, 112);
  // Draw using a fake player proxy
  const proxy = Object.create(winner);
  proxy.h = 88; proxy.w = 56; proxy.atkTimer = 0;
  proxy.anim = animTick; proxy.facing = 1;
  // Temporarily redirect ctx
  const realCtx = ctx;
  ctx = wctx;
  drawCharacter(proxy);
  ctx = realCtx;
  wctx.restore();

  gameState = 'gameOver';
  showScreen('end-screen');
}

// ─── GAME LOOP ────────────────────────────────────────────────
function gameLoop() {
  requestAnimationFrame(gameLoop);
  animTick++;

  if (gameState !== 'playing') return;

  resizeCanvas();
  const gy = groundY();

  drawBg(gy);

  if (roundPhase === 'countdown') {
    roundTimer++;
    if (roundTimer >= COUNTDOWN_F) roundPhase = 'fight';
  }

  if (roundPhase === 'fight') {
    updatePlayer(players[0], players[1]);
    updatePlayer(players[1], players[0]);
    tickEffects();

    // Simple push-apart so players don't overlap
    const overlap = (players[0].x + players[0].w) - players[1].x;
    if (overlap > 0 && players[0].x < players[1].x) {
      const half = overlap / 2;
      players[0].x -= half;
      players[1].x += half;
    }
  }

  players.forEach(drawPlayer);
  drawEffects();
  drawOverlay(gy);
}

// ─── SOUND (Web Audio API, no files needed) ───────────────────
let _audioCtx = null;
function getACtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) {}
  }
  return _audioCtx;
}

function playSound(type) {
  const ac = getACtx();
  if (!ac) return;
  try {
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    const t = ac.currentTime;

    switch (type) {
      case 'swing':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
        break;
      case 'hit':
        osc.type = 'square';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        gain.gain.setValueAtTime(0.38, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.18);
        break;
      case 'jump':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(380, t + 0.1);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
        break;
    }
  } catch (e) {}
}

// ─── SCREEN MANAGEMENT ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── CHARACTER SELECT ─────────────────────────────────────────
function buildCharSelect() {
  ['p1-grid', 'p2-grid'].forEach((gridId, pi) => {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';

    CHARACTERS.forEach((ch, ci) => {
      const card = document.createElement('div');
      card.className = 'char-card';

      // Mini canvas preview
      const mc    = document.createElement('canvas');
      mc.width    = 56;
      mc.height   = 64;
      const mctx  = mc.getContext('2d');
      mctx.save();
      mctx.translate(28, 62);
      // Draw preview using a proxy player object
      const proxy = {
        char: ch, num: pi+1,
        h: 56, w: 44,
        atkTimer: 0, hurtTimer: 0,
        state: 'idle', facing: 1,
        anim: 0, walkCycle: 0,
        burnTimer: 0, regenTimer: 0
      };
      const realCtx = ctx;
      ctx = mctx;
      drawCharacter(proxy);
      ctx = realCtx;
      mctx.restore();

      const nameEl = document.createElement('div');
      nameEl.className = 'char-card-name';
      nameEl.textContent = ch.sub;

      card.appendChild(mc);
      card.appendChild(nameEl);

      const pick = e => {
        e.preventDefault();
        selectChar(pi, ci);
      };
      card.addEventListener('click',      pick);
      card.addEventListener('touchstart', pick, { passive: false });

      grid.appendChild(card);
    });
  });
}

function selectChar(pi, ci) {
  if (pi === 0) p1Choice = ci;
  else          p2Choice = ci;

  const gridId = pi === 0 ? 'p1-grid' : 'p2-grid';
  document.getElementById(gridId)
    .querySelectorAll('.char-card')
    .forEach((c, i) => c.classList.toggle('selected', i === ci));

  document.getElementById(pi === 0 ? 'p1-info' : 'p2-info').textContent =
    CHARACTERS[ci].name;

  document.getElementById('start-btn').disabled =
    (p1Choice === null || p2Choice === null);
}

// ─── START GAME ───────────────────────────────────────────────
function startGame() {
  if (p1Choice === null || p2Choice === null) return;

  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');

  showScreen('game-screen');

  // Small defer so the screen is visible before measuring
  requestAnimationFrame(() => {
    resizeCanvas();
    const gy = groundY();

    players = [
      mkPlayer(CHARACTERS[p1Choice], 1),
      mkPlayer(CHARACTERS[p2Choice], 2)
    ];

    // Position
    players[0].x = canvas.width * 0.22;
    players[0].y = gy;
    players[1].x = canvas.width * 0.78 - PLAYER_W;
    players[1].y = gy;

    // HUD labels
    document.getElementById('p1-name').textContent = CHARACTERS[p1Choice].sub;
    document.getElementById('p2-name').textContent = CHARACTERS[p2Choice].sub;

    // Reset scores
    p1Wins = p2Wins = 0;
    roundNum = 1;
    document.getElementById('p1-wins').textContent  = '0';
    document.getElementById('p2-wins').textContent  = '0';
    document.getElementById('round-label').textContent = 'Round 1';

    gameState  = 'playing';
    effects    = [];
    roundTimer = 0;
    roundPhase = 'countdown';

    players.forEach(refreshHpBar);

    // Resume AudioContext on first user interaction
    getACtx();
  });
}

// ─── INIT ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
  // The ctx reference starts null; buildCharSelect needs to draw previews
  // so we create a throwaway canvas just for that pass
  const tmp = document.createElement('canvas');
  ctx = tmp.getContext('2d');

  buildCharSelect();

  setupKeyboard();
  setupTouchControls();

  document.getElementById('start-btn').addEventListener('click', startGame);

  document.getElementById('rematch-btn').addEventListener('click', () => {
    // Same characters, reset scores
    p1Wins = p2Wins = 0;
    roundNum = 1;
    document.getElementById('p1-wins').textContent  = '0';
    document.getElementById('p2-wins').textContent  = '0';
    document.getElementById('round-label').textContent = 'Round 1';

    players = [
      mkPlayer(CHARACTERS[p1Choice], 1),
      mkPlayer(CHARACTERS[p2Choice], 2)
    ];
    gameState = 'playing';
    showScreen('game-screen');

    requestAnimationFrame(() => { startRound(); });
  });

  document.getElementById('menu-btn').addEventListener('click', () => {
    p1Choice = p2Choice = null;
    gameState = 'select';
    showScreen('select-screen');
    buildCharSelect();
    document.getElementById('start-btn').disabled = true;
  });

  window.addEventListener('resize', () => {
    if (canvas && gameState === 'playing') resizeCanvas();
  });

  // Kick off the render loop once
  requestAnimationFrame(gameLoop);
});
