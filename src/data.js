// All gameplay data: teams, spells, characters, wands, equipment, economy, formats.

export const TEAM = { ORDER: 'order', DEATH: 'death' };

export const TEAM_INFO = {
  order: {
    name: 'Order of the Phoenix',
    short: 'ORDER',
    color: 0xe8543a,
    css: '#e8543a',
    robe: 0x6e1d14,
    trim: 0xd9a441,
    desc: 'Defend the sites. Dispel the Cursed Relic with Finite Incantatem.',
  },
  death: {
    name: 'Death Eaters',
    short: 'DEATH EATERS',
    color: 0x49e07d,
    css: '#49e07d',
    robe: 0x14141c,
    trim: 0x2f8f57,
    desc: 'Plant the Cursed Relic at site A or B, or eliminate the Order.',
  },
};

export const otherTeam = (t) => (t === TEAM.ORDER ? TEAM.DEATH : TEAM.ORDER);

// ---------------------------------------------------------------- SPELLS ---
// kind: 'bolt' (projectile), 'lob' (arcing grenade), 'shield', 'summon'
// spread: [standing deg, moving extra deg]; falloff: [startDist, endDist, minMult]
// recoil: camera kick (rad) per cast; bloom: spread (deg) added per cast,
// decaying over ~0.6s — spamming sprays, tapping stays tight.
export const SPELLS = {
  stupefy: {
    id: 'stupefy', name: 'Stupefy', kind: 'bolt', slot: 1, icon: 'bolt',
    dmg: 27, interval: 0.26, speed: 46, mana: 8, spread: [0.35, 2.3],
    recoil: 0.016, bloom: 0.55,
    falloff: [25, 60, 0.7], hs: 2, kb: 2.4, stagger: 0.16, killReward: 300, price: 0,
    color: 0xff3b4a, glow: 0xff97a3,
    role: 'Rifle', desc: 'Rapid red stunner. Four body hits drop a full-health wizard.',
  },
  avada: {
    id: 'avada', name: 'Avada Kedavra', kind: 'bolt', slot: 2, icon: 'skull',
    dmg: 250, interval: 1.4, charge: 1.15, speed: 82, mana: 45, spread: [0.04, 5.0],
    recoil: 0.055, bloom: 0, zoom: 0.55,
    falloff: null, hs: 1, kb: 3.5, killReward: 150, price: 4750, chargeSlow: 0.55, // hs 1: it kills on ANY contact — no headshot math needed
    color: 0x37ff6e, glow: 0xa9ffc4,
    role: 'AWP', desc: 'Hold to charge — your focus narrows (scope) — release the Killing Curse. One hit.',
  },
  sectum: {
    id: 'sectum', name: 'Sectumsempra', kind: 'bolt', slot: 1, icon: 'slash',
    dmg: 22, interval: 0.3, speed: 52, mana: 9, spread: [0.3, 2.4],
    recoil: 0.02, bloom: 0.7,
    falloff: [22, 55, 0.72], hs: 2, kb: 1.4, bleed: [4, 3], killReward: 300, price: 0,
    color: 0xd9c9ff, glow: 0xffffff, exclusive: 'snape', replaces: 'stupefy',
    role: 'Rifle+', desc: 'Cutting curse, "for enemies". Victims bleed for 3s.',
  },
  expelliarmus: {
    id: 'expelliarmus', name: 'Expelliarmus', kind: 'bolt', slot: 3, icon: 'swirl',
    dmg: 6, interval: 0.95, speed: 54, mana: 18, spread: [0.4, 2.2],
    recoil: 0.012, bloom: 0.3,
    falloff: null, hs: 1, kb: 2.0, disarm: 2.0, killReward: 300, price: 0,
    color: 0xffb347, glow: 0xffe2ad,
    role: 'Utility', desc: 'Knocks the wand away: target cannot cast for 2s.',
  },
  petrificus: {
    id: 'petrificus', name: 'Petrificus Totalus', kind: 'bolt', slot: 3, icon: 'bind',
    dmg: 4, interval: 1.1, speed: 40, mana: 20, spread: [0.35, 2.0],
    recoil: 0.014, bloom: 0.4,
    falloff: null, hs: 1, freeze: 1.6, charges: 1, killReward: 300, price: 600,
    color: 0x9fb6c8, glow: 0xe2eef8,
    role: 'Body-Bind', desc: 'Full Body-Bind: target is a statue for 1.6s. A solid hit shatters the bind.',
  },
  impedimenta: {
    id: 'impedimenta', name: 'Impedimenta', kind: 'bolt', slot: 3, icon: 'slow',
    dmg: 12, interval: 0.9, speed: 50, mana: 16, spread: [0.35, 2.1],
    recoil: 0.012, bloom: 0.35,
    falloff: null, hs: 1, kb: 2.8, snare: 2.2, charges: 2, killReward: 300, price: 400,
    color: 0x58c8ff, glow: 0xc6ecff,
    role: 'Jinx', desc: 'Knockback jinx: shoves the target and SNARES them — 45% slower, no jumping, for 2.2s.',
  },
  silencio: {
    id: 'silencio', name: 'Silencio', kind: 'bolt', slot: 3, icon: 'mute',
    dmg: 4, interval: 1.0, speed: 56, mana: 18, spread: [0.3, 2.0],
    recoil: 0.012, bloom: 0.3,
    falloff: null, hs: 1, kb: 0.6, silence: 2.4, charges: 1, killReward: 300, price: 500,
    color: 0xc886ff, glow: 0xeed4ff,
    role: 'Hex', desc: 'Steals the voice: no casting, no Protego for 2.4s. They can still run — and so can you.',
  },
  serpensortia: {
    id: 'serpensortia', name: 'Serpensortia', kind: 'summon', slot: 5, icon: 'snake',
    dmg: 24, interval: 1.2, speed: 0, mana: 22, spread: [0, 0],
    charges: 1, summon: { hp: 30, speed: 7.2, life: 12, bite: 24, slow: 0.6, range: 22 }, killReward: 300, price: 550,
    color: 0x3fae5a, glow: 0x9fe8b4,
    role: 'Summon', desc: 'Conjure a serpent that hunts the nearest enemy and strikes once. Can be shot down.',
  },
  bombarda: {
    id: 'bombarda', name: 'Bombarda', kind: 'lob', slot: 4, icon: 'bomb',
    dmg: 96, radius: 5.2, interval: 1.0, speed: 17.5, mana: 26, spread: [1, 2],
    charges: 2, self: true, killReward: 300, price: 300,
    color: 0xff8a2a, glow: 0xffc890,
    role: 'HE Grenade', desc: 'Lobbed blasting charge. Area damage — hurts you too.',
  },
  lumos: {
    id: 'lumos', name: 'Lumos Maxima', kind: 'lob', slot: 5, icon: 'sun',
    dmg: 0, radius: 16, interval: 0.8, speed: 16, mana: 14, spread: [1, 2],
    charges: 2, flash: 2.6, killReward: 300, price: 200,
    color: 0xffffff, glow: 0xffffff,
    role: 'Flashbang', desc: 'Blinding burst of light. Look away!',
  },
  fumos: {
    id: 'fumos', name: 'Fumos', kind: 'lob', slot: 5, icon: 'cloud',
    dmg: 0, radius: 3.8, interval: 0.8, speed: 16, mana: 16, spread: [1, 2],
    charges: 1, smoke: 12, killReward: 300, price: 300,
    color: 0x9fb2c8, glow: 0xcfd8e6,
    role: 'Smoke', desc: 'Dense smokescreen for 12 seconds. Blocks sight lines.',
  },
  incendio: {
    id: 'incendio', name: 'Incendio', kind: 'lob', slot: 5, icon: 'flame',
    dmg: 0, radius: 3.1, interval: 0.9, speed: 16.5, mana: 20, spread: [1, 2],
    charges: 1, fire: [6, 14], self: true, killReward: 300, price: 400,
    color: 0xff5a1f, glow: 0xffae6e,
    role: 'Molotov', desc: 'Pool of cursed fire: 14 dmg/s for 6s. Denies ground.',
  },
  patronum: {
    id: 'patronum', name: 'Expecto Patronum', kind: 'lob', slot: 5, icon: 'stag',
    dmg: 0, radius: 0, interval: 0.9, speed: 15, mana: 24, spread: [1, 2],
    charges: 1, ward: [6, 4.2, 3.0], killReward: 300, price: 500,
    color: 0xcfe8ff, glow: 0xffffff,
    role: 'Ward Wall', desc: 'Conjure a silver guardian wall for 6s. Enemy spells cannot pass.',
  },
  protego: {
    id: 'protego', name: 'Protego', kind: 'shield', slot: 0, icon: 'shield',
    dmg: 0, mana: 0, drain: 13, drainHit: 0.5, speedMult: 0.55, price: 0,
    parry: 0.25, color: 0x6fb4ff, glow: 0xbfe0ff,
    role: 'Shield', desc: 'Hold RIGHT CLICK to block spells. Raise it at the last instant to REFLECT a bolt.',
  },
};

export const GRENADES = ['bombarda', 'lumos', 'fumos', 'incendio', 'patronum', 'serpensortia'];
export const SLOT3 = ['expelliarmus', 'petrificus', 'impedimenta', 'silencio'];
export const HEXES = ['expelliarmus', 'petrificus', 'impedimenta', 'silencio']; // the disable school
export const SLOT5 = ['lumos', 'fumos', 'incendio', 'patronum', 'serpensortia'];

// -------------------------------------------------------------- HIT ZONES ---
// CS 1.6-style locational damage. Head uses the spell's own hs multiplier
// (Avada kills on any contact regardless). Body-zone multipliers below keep
// Stupefy's documented 4-chest-hit kill intact.
export const HITZONES = {
  head: { name: 'Head' },               // spell.hs (2x for most bolts)
  chest: { mult: 1.0, name: 'Chest' },
  stomach: { mult: 1.15, name: 'Stomach' },
  arm: { mult: 0.85, name: 'Arm' },
  leg: { mult: 0.7, name: 'Leg' },
};

// ------------------------------------------------------------ CHARACTERS ---
// ai: bot playstyle — aggro (push vs hold), range (preferred fight distance m),
// util (grenade-usage mult), lurk (flank/slow-play bias), snipe (Avada affinity),
// team (sticks with + trades for teammates), dodge (strafe intensity mult).
export const CHARACTERS = [
  {
    id: 'harry', name: 'Harry Potter', side: 'order',
    hp: 100, speed: 5.5, power: 1.0, cast: 1.0, mana: 100, regen: 4,
    perk: 'The Disarming Hero', perkDesc: 'Expelliarmus costs 50% less mana and recovers 60% faster.',
    fav: 'lumos',
    skin: { hair: 0x1f1a14, glasses: true, scar: true, messy: true, accent: 0x8a1e1e, scarf: [0x8a1e1e, 0xd6a531], wand: { len: 0.5, color: 0x6b4226 } },
    ai: { aggro: 0.85, range: 12, util: 0.6, lurk: 0.05, snipe: 0.2, team: 0.7, dodge: 0.95, disc: 'duelist' },
    style: 'Entry duelist — first through the door, fights close, trades for teammates.',
  },
  {
    id: 'hermione', name: 'Hermione Granger', side: 'order',
    hp: 80, speed: 5.7, power: 0.95, cast: 1.18, mana: 110, regen: 5,
    perk: 'Time-Turner Focus', perkDesc: 'Recharge (R) refills mana twice as fast.',
    fav: 'impedimenta',
    skin: { hair: 0x6e4a23, bushy: true, accent: 0x8a1e1e, satchel: true, timeTurner: true, wand: { len: 0.48, color: 0x7a5a33 } },
    ai: { aggro: 0.4, range: 18, util: 1.6, lurk: 0.1, snipe: 0.3, team: 0.9, dodge: 0.7, disc: 'warden' },
    style: 'Support caster — smokes and flashes before every push, follows the pack.',
  },
  {
    id: 'ron', name: 'Ron Weasley', side: 'order',
    hp: 115, speed: 5.3, power: 0.95, cast: 0.95, mana: 90, regen: 3.5,
    perk: "Keeper's Grit", perkDesc: 'Takes 25% less damage from explosions and fire.',
    fav: 'patronum',
    skin: { hair: 0xb3502a, accent: 0x6e2230, scarf: [0x6e2230, 0xd6a531], patch: true, wand: { len: 0.46, color: 0x8a5a33 } },
    ai: { aggro: 0.35, range: 14, util: 0.7, lurk: 0.15, snipe: 0.1, team: 0.85, dodge: 0.45, disc: 'warden' },
    style: 'Site anchor — plants his feet, soaks damage, never leaves the objective.',
  },
  {
    id: 'luna', name: 'Luna Lovegood', side: 'order',
    hp: 90, speed: 5.5, power: 0.9, cast: 1.05, mana: 120, regen: 6,
    perk: 'Spectrespecs', perkDesc: '60% flash resistance. Enemy radar pings linger 2s longer.',
    fav: 'fumos',
    skin: { hair: 0xe6d8a8, long: true, accent: 0x2b4a8a, spectrespecs: true, radish: true, wand: { len: 0.5, color: 0xcbb98a } },
    ai: { aggro: 0.55, range: 16, util: 1.2, lurk: 0.65, snipe: 0.25, team: 0.2, dodge: 0.85, disc: 'phantom' },
    style: 'Wildcard — wanders strange routes alone and appears exactly where you are not looking.',
  },
  {
    id: 'snape', name: 'Severus Snape', side: 'death',
    hp: 95, speed: 5.4, power: 1.05, cast: 1.0, mana: 100, regen: 4,
    perk: 'The Half-Blood Prince', perkDesc: 'Exclusive: Sectumsempra replaces Stupefy — a bleeding bolt.',
    fav: 'silencio',
    skin: { hair: 0x101010, curtains: true, accent: 0x14181c, collar: true, buttons: true, wand: { len: 0.52, color: 0x14110d } },
    ai: { aggro: 0.3, range: 20, util: 0.9, lurk: 0.9, snipe: 0.45, team: 0.2, dodge: 0.6, disc: 'hexer' },
    style: 'Lurker — patient, silent, takes the long flank and punishes rotations.',
  },
  {
    id: 'bellatrix', name: 'Bellatrix Lestrange', side: 'death',
    hp: 75, speed: 5.7, power: 1.2, cast: 1.05, mana: 95, regen: 4,
    perk: 'Crucio', perkDesc: 'Your bolt hits slow victims by 25% for 1.2s.',
    fav: 'incendio',
    skin: { hair: 0x140d0d, wild: true, accent: 0x2a1230, corset: true, locket: true, wand: { len: 0.44, color: 0x231811 } },
    ai: { aggro: 1.0, range: 7, util: 0.5, lurk: 0.0, snipe: 0.1, team: 0.4, dodge: 1.1, disc: 'duelist' },
    style: 'Berserker — sprints straight at you cackling, point-blank, no retreat. Ever.',
  },
  {
    id: 'voldemort', name: 'Lord Voldemort', side: 'death',
    hp: 95, speed: 4.7, power: 1.3, cast: 0.95, mana: 130, regen: 5,
    perk: 'Master of Death', perkDesc: 'Avada Kedavra charges 35% faster and costs 20% less.',
    fav: 'serpensortia',
    skin: { hair: null, pale: true, slits: true, accent: 0x3a4438, noseSlits: true, clasp: true, wand: { len: 0.58, color: 0xded7c4 } },
    ai: { aggro: 0.45, range: 30, util: 0.6, lurk: 0.3, snipe: 1.0, team: 0.3, dodge: 0.5, disc: 'duelist' },
    style: 'The AWPer — holds a long angle with Avada Kedavra charged. One mistake, one kill.',
  },
  {
    id: 'draco', name: 'Draco Malfoy', side: 'death',
    hp: 90, speed: 5.5, power: 1.0, cast: 1.0, mana: 100, regen: 4,
    perk: 'Malfoy Coffers', perkDesc: '20% discount on every purchase.',
    fav: 'petrificus',
    skin: { hair: 0xeae2c8, slick: true, accent: 0x1f4d33, badge: true, ring: true, wand: { len: 0.5, color: 0x4a3b2e, grip: 0xc0c4cc } },
    ai: { aggro: 0.45, range: 16, util: 1.0, lurk: 0.4, snipe: 0.35, team: 0.6, dodge: 0.75, disc: 'phantom' },
    style: 'Baiter — fights beside teammates, bails the moment a duel turns sour.',
  },
];

export const charById = (id) => CHARACTERS.find((c) => c.id === id);

// Extra bot identities reuse main character stat templates.
export const BOT_NAMES = {
  order: [
    ['Tonks', 'hermione'], ['Kingsley', 'ron'], ['Neville', 'harry'], ['Ginny', 'bellatrix'],
    ['Sirius', 'harry'], ['Lupin', 'luna'], ['Moody', 'ron'], ['Fleur', 'hermione'],
  ],
  death: [
    ['Lucius', 'draco'], ['Dolohov', 'snape'], ['Greyback', 'ron'], ['Yaxley', 'harry'],
    ['Rookwood', 'luna'], ['Avery', 'bellatrix'], ['Mulciber', 'draco'], ['Travers', 'snape'],
  ],
};

// ----------------------------------------------------------------- WANDS ---
export const WANDS = [
  { id: 'training', name: 'Training Wand', price: 0, power: 0.8, cast: 1.0, spread: 1.5, manaMult: 1.0, desc: 'School-issue practice wand. Weak, wobbly, free.' },
  { id: 'holly', name: 'Holly & Phoenix Feather', price: 1500, power: 1.0, cast: 1.05, spread: 1.0, manaMult: 1.0, desc: 'The balanced classic. Stupefy hits its 4-shot kill.' },
  { id: 'vine', name: 'Vine Wood & Dragon Heartstring', price: 2000, power: 0.95, cast: 1.15, spread: 0.55, manaMult: 1.0, desc: 'Surgical: tight spread, quick casts, slightly soft hits.' },
  { id: 'walnut', name: 'Walnut & Dragon Heartstring', price: 2300, power: 1.15, cast: 1.0, spread: 1.15, manaMult: 1.3, desc: 'Brutal damage, thirsty on mana, a bit wild.' },
  { id: 'elder', name: 'The Elder Wand', price: 4000, power: 1.28, cast: 1.08, spread: 0.7, manaMult: 0.9, desc: 'The Deathstick. Best at everything, priced like it.' },
];

export const wandById = (id) => WANDS.find((w) => w.id === id);

// ------------------------------------------------------------- EQUIPMENT ---
export const EQUIPMENT = [
  { id: 'potion', name: 'Healing Potion', price: 350, action: 'potion', max: 1, icon: 'potion', desc: 'Restores 50 HP over 2.5s.' },
  { id: 'broom', name: 'Broomstick', price: 400, action: 'broom', max: 2, icon: 'broom', desc: 'Hold to FLY for up to 2.2s: steer where you look, Space climbs, Ctrl dives. Two mounts.' },
  { id: 'cloak', name: 'Invisibility Cloak', price: 400, action: 'cloak', max: 1, icon: 'cloak', desc: 'Vanish for 6s. Casting breaks it.' },
  { id: 'apparate', name: 'Apparition Charm', price: 500, action: 'apparate', max: 1, icon: 'blink', desc: 'Blink 8m in the direction you face. Once per round.' },
  { id: 'finite', name: 'Finite Incantatem', price: 250, action: 'finite', max: 2, icon: 'ward', desc: 'Dispel your afflictions: fire, bleeding, slows, blinds.' },
  { id: 'vest', name: 'Dragonhide Vest', price: 650, action: null, max: 1, icon: 'vest', desc: 'Armor: takes 30% of every spell hit until it absorbs 60 damage. Survive and you keep it.' },
  { id: 'felix', name: 'Felix Felicis', price: 800, action: null, max: 1, icon: 'luck', desc: 'Liquid luck: the next killing blow leaves you at 1 HP instead. One sip, one miracle.' },
  { id: 'portkey', name: 'Emergency Portkey', price: 450, action: 'portkey', max: 1, icon: 'portkey', desc: 'Channel 1.4s (interrupted by damage), then snap back to your spawn. One use.' },
];

export const equipById = (id) => EQUIPMENT.find((e) => e.id === id);

// --------------------------------------------------------------- ECONOMY ---
export const ECON = {
  start: 800, cap: 16000,
  winElim: 3250, winTime: 3250, winDefuse: 3250, winRelic: 3500,
  lossBase: 1400, lossStep: 500, lossMax: 3400, plantedLossBonus: 800,
  plant: 300, defuse: 300,
};

// ------------------------------------------------------------------ BOTS ---
// The bot brain is tuned along four human axes (0..100 each):
//   reflex — how fast they notice→turn→fire; aim — flick/settle/tracking error;
//   sense — vision cone/range, hearing, memory; iq — tactics, utility, saves.
// Presets are points in that space; "custom" exposes the sliders directly.
export const DIFFICULTIES = [
  { id: 'easy', name: 'Rookie', axes: { reflex: 10, aim: 8, sense: 18, iq: 12 },
    desc: 'Half-second reactions, wide sprays, tunnel vision. Learn the maps in peace.' },
  { id: 'normal', name: 'Regular', axes: { reflex: 38, aim: 34, sense: 42, iq: 38 },
    desc: 'Human reflexes (~350ms), loose tracking, basic teamwork. A fair scrim.' },
  { id: 'hard', name: 'Veteran', axes: { reflex: 62, aim: 58, sense: 64, iq: 64 },
    desc: 'Sharp ~250ms reactions, counter-strafing, trades kills, plays the economy.' },
  { id: 'expert', name: 'Expert', axes: { reflex: 82, aim: 78, sense: 82, iq: 84 },
    desc: 'Tournament reflexes, tight tracking, shields on reaction, full utility.' },
  { id: 'legend', name: 'Legend', axes: { reflex: 97, aim: 95, sense: 97, iq: 97 },
    desc: 'Inhuman: 170ms flicks, eyes in the back of their hood. You will be punished.' },
];

// Map the four 0..100 axes onto every concrete brain parameter.
export function aiProfile(axes) {
  const f = (k) => Math.min(100, Math.max(0, axes?.[k] ?? 50)) / 100;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rf = f('reflex'), am = f('aim'), se = f('sense'), iq = f('iq');
  return {
    axes: { reflex: rf * 100, aim: am * 100, sense: se * 100, iq: iq * 100 },
    // --- reflexes: the notice → orient → fire pipeline ---
    reactMean: lerp(0.62, 0.17, rf),   // s from recognition to first cast
    reactStd: lerp(0.20, 0.045, rf),   // human variance
    surprise: lerp(2.3, 1.25, rf),     // shot from behind: how much longer to process
    shieldReact: lerp(1.1, 0.26, rf),  // s to raise Protego against an incoming bolt
    turnSpeed: lerp(230, 720, rf),     // deg/s max camera swing
    // --- aim: a hand, not an aimbot ---
    settle: lerp(0.8, 0.15, am),       // s for the flick overshoot to decay
    flick: lerp(0.5, 0.1, am),         // overshoot fraction of the initial snap
    trackErr: lerp(3.6, 0.4, am),      // deg of wandering tracking error
    leadErr: lerp(0.55, 0.08, am),     // misjudgement of projectile lead
    headBias: lerp(0.1, 0.5, am),      // how often they go for the head
    counterStrafe: am > 0.45,          // stop to shoot accurately
    // --- senses: seeing and hearing like a person ---
    fovDot: lerp(0.42, 0.12, se),      // cos of half-FOV (~130° → ~166°)
    sightDist: lerp(38, 92, se),
    noticeMul: lerp(0.55, 2.6, se),    // recognition speed multiplier
    hear: lerp(10, 36, se),            // hearing radius baseline (m)
    cloakEye: lerp(2.5, 5.5, se),      // distance at which a cloak shimmer registers
    memoryT: lerp(3.5, 7.5, se),       // how long a "last seen there" stays actionable
    // --- tactics ---
    iq,
    util: lerp(0.12, 0.95, iq),
    strafe: lerp(0.3, 1.15, (rf + am) / 2),
  };
}

// --------------------------------------------------------- DISCIPLINES ---
// A "build" picked per match: one passive school of magic. Bots pick the one
// matching their playstyle; the human picks in match setup.
export const DISCIPLINES = [
  {
    id: 'duelist', name: 'Duelist', icon: 'bolt',
    boltSpeed: 1.12, parryBonus: 0.08,
    desc: 'Your bolts fly 12% faster and the Protego parry window is wider. Win the duel.',
  },
  {
    id: 'hexer', name: 'Hexer', icon: 'flame',
    dotMult: 1.3,
    desc: 'Your burns, bleeds and slows tick 30% harder and last 30% longer. Let them wither.',
  },
  {
    id: 'warden', name: 'Warden', icon: 'shield',
    drainMult: 0.65, wardMult: 1.3, blastResist: 0.85,
    desc: 'Protego drains 35% less mana, your Patronum wall is 30% larger, and blasts/fire hurt you 15% less.',
  },
  {
    id: 'phantom', name: 'Phantom', icon: 'blink',
    speedMult: 1.08, equipDiscount: 0.75,
    desc: '+8% move speed and equipment costs 25% less. Be where they least expect.',
  },
];

export const disciplineById = (id) => DISCIPLINES.find((d) => d.id === id) || null;

// --------------------------------------------------------- MATCH FORMATS ---
export const FORMATS = [
  { id: 'mr8', name: 'Short — first to 8', winTarget: 8, halftimeAfter: 8, maxRounds: 15, tie: false },
  { id: 'mr15', name: 'Full — first to 16 (15:15 tie allowed)', winTarget: 16, halftimeAfter: 15, maxRounds: 30, tie: true },
];

export const ROUND = {
  freeze: 5, time: 105, buyWindow: 20, fuse: 35, plantTime: 3.2, defuseTime: 6,
  endPause: 6, dmTime: 300, dmRespawn: 2.5,
};

export const MAP_LIST = [
  // classics
  { id: 'dust2', name: 'Dust II', group: 'classic', desc: 'The classic. Long A, Mid Doors, B Tunnels.' },
  { id: 'dust', name: 'Dust', group: 'classic', desc: 'Underpass, the bridge, sweeping sand courtyards.' },
  { id: 'inferno', name: 'Inferno', group: 'classic', desc: 'Banana, Apartments, tight Mediterranean streets.' },
  { id: 'aztec', name: 'Aztec', group: 'classic', desc: 'Jungle stone, the rope bridge, water ditch.' },
  { id: 'mirage', name: 'Mirage', group: 'classic', desc: 'Palace, Apartments, the Window room. Blue doors, noon sun.' },
  { id: 'nuke', name: 'Nuke', group: 'classic', desc: 'Indoor silo hall, sunken B bunker, vents, the yard.' },
  // hogwarts
  { id: 'hall', name: 'The Great Hall', group: 'hogwarts', desc: 'House tables, side galleries, the dais — under an enchanted ceiling.' },
  { id: 'dungeons', name: 'The Dungeons', group: 'hogwarts', desc: 'Torch-lit corridors around the Potions classroom.' },
  { id: 'astronomy', name: 'Astronomy Tower', group: 'hogwarts', desc: 'A moonlit courtyard, cloisters, and the tower platform.' },
  { id: 'quidditch', name: 'Quidditch Pitch', group: 'hogwarts', desc: 'Open grass, team stands, golden hoops. Bring a broom.' },
  { id: 'hogsmeade', name: 'Hogsmeade', group: 'hogwarts', desc: 'A snowed-in high street, shop interiors, back alleys.' },
  { id: 'chamber', name: 'Chamber of Secrets', group: 'hogwarts', desc: 'Serpent pillars, a flooded channel, the statue dais.' },
  // the wider wizarding world
  { id: 'diagon', name: 'Diagon Alley', group: 'world', desc: 'The crooked shopping street: Ollivanders, the joke shop, dark Knockturn Alley.' },
  { id: 'gringotts', name: 'Gringotts', group: 'world', desc: 'Marble bank hall over deep vaults. Mind the dragon below.' },
  { id: 'ministry', name: 'Ministry Atrium', group: 'world', desc: 'The Fountain of Magical Brethren, floo fireplaces, the lift lobby.' },
];
