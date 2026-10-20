import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/* =========================================================================
 *  MAQUETTE 3D — Étage R+1 (d'après le plan d'architecte)
 *  ------------------------------------------------------------------------
 *  Repère : X = est (droite du plan), Z = sud (bas du plan), Y = hauteur.
 *  Origine (0,0) = angle nord-ouest du bloc des chambres. Cotes en mètres.
 *  Deux modes : Survol (orbite) et Visite (1re personne, ZQSD/WASD).
 * ====================================================================== */

const H = 2.5;          // hauteur sous plafond
const T = 0.1;          // épaisseur cloisons
const EYE = 1.6;        // hauteur des yeux (visite)
const R = 0.28;         // rayon du "joueur" (collisions)
const DOOR_H = 2.10;
const SILL = 0.95, WIN_TOP = 2.2; // fenêtres

/* --------------------------- Scène de base ------------------------------ */
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#aecbe6'); // ciel
scene.fog = new THREE.Fog('#aecbe6', 35, 80);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 300);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

/* ------------------------------ Lumières -------------------------------- */
scene.add(new THREE.HemisphereLight('#eaf2fb', '#4a4436', 0.9));
const sun = new THREE.DirectionalLight('#fff6e8', 1.1);
sun.position.set(-8, 16, -6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 1, far: 60, left: -18, right: 18, top: 18, bottom: -18 });
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight('#ffffff', 0.25));

/* ----------------------------- Matériaux -------------------------------- */
const matWall  = new THREE.MeshStandardMaterial({ color: '#efe9e0', roughness: 0.95 });
const matWood  = new THREE.MeshStandardMaterial({ color: '#c9a26b', roughness: 0.85 });
const matBath  = new THREE.MeshStandardMaterial({ color: '#cdd6dd', roughness: 0.4 });
const matCorr  = new THREE.MeshStandardMaterial({ color: '#b0bec5', roughness: 0.9 });
const matDeck  = new THREE.MeshStandardMaterial({ color: '#8a6f4e', roughness: 0.95 });
const matCeil  = new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 1, side: THREE.DoubleSide });
const matSlabLo = new THREE.MeshStandardMaterial({ color: '#7d8894', roughness: 1 });
const matGlass = new THREE.MeshStandardMaterial({ color: '#9fd0e0', roughness: 0.1, transparent: true, opacity: 0.25 });
const matStair = new THREE.MeshStandardMaterial({ color: '#9a8b78', roughness: 0.9 });
const matDress = new THREE.MeshStandardMaterial({ color: '#e2d6c2', roughness: 0.7 });
const matJoint = new THREE.MeshStandardMaterial({ color: '#7a6f60', roughness: 1 });

/* -------------------------- Sol extérieur ------------------------------- */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 140),
  new THREE.MeshStandardMaterial({ color: '#5c6b52', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(6, -3.2, 5);
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, '#6b7686', '#586374');
grid.position.set(6, 0.002, 5);
scene.add(grid);

/* --------------------------- Helpers ------------------------------------ */
const building = new THREE.Group();
scene.add(building);
const labels = new THREE.Group();
scene.add(labels);

const solids = [];  // AABB collisions {minX,maxX,minZ,maxZ}
const wallRuns = []; // chaque mur créé {horizontal, fixed, a0, a1} — pour les cotes auto

function mesh(w, h, d, cx, cy, cz, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  m.castShadow = true; m.receiveShadow = true;
  building.add(m);
  return m;
}
function addCollider(cx, cz, w, d) {
  solids.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
}

// Segment de mur (le long d'un axe) entre s..e, hauteur y0..y1.
function seg(horizontal, fixed, s, e, y0, y1, mat, collide) {
  const len = e - s;
  if (len <= 1e-4) return;
  const w = horizontal ? len : T;
  const d = horizontal ? T : len;
  const cx = horizontal ? (s + e) / 2 : fixed;
  const cz = horizontal ? fixed : (s + e) / 2;
  mesh(w, y1 - y0, d, cx, (y0 + y1) / 2, cz, mat);
  if (collide) addCollider(cx, cz, w, d);
}
// verre (garde-corps / vitrage), non collide ici (collision gérée à part)
function glass(horizontal, fixed, s, e, y0, y1) {
  const len = e - s; if (len <= 1e-4) return;
  const w = horizontal ? len : 0.03;
  const d = horizontal ? 0.03 : len;
  const cx = horizontal ? (s + e) / 2 : fixed;
  const cz = horizontal ? fixed : (s + e) / 2;
  mesh(w, y1 - y0, d, cx, (y0 + y1) / 2, cz, matGlass);
}

// Mur le long de Z (X fixe) dont le sommet suit le rampant : profil trapézoïdal.
function slopedSeg(x, z0, z1, y0, mat, collide) {
  if (z1 - z0 <= 1e-4) return;
  const shape = new THREE.Shape();
  shape.moveTo(z0, y0);
  shape.lineTo(z1, y0);
  shape.lineTo(z1, roofAt(z1));
  shape.lineTo(z0, roofAt(z0));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = -Math.PI / 2; // (u=Z, v=Y, épaisseur -> X)
  m.position.set(x + T / 2, 0, 0);
  m.castShadow = true; m.receiveShadow = true;
  building.add(m);
  if (collide) addCollider(x, (z0 + z1) / 2, T, z1 - z0);
}

/*
 *  addWall(x1,z1,x2,z2, opts)  — mur SOUS RAMPANT : le sommet suit la pente.
 *  Murs le long de X (Z fixe) : hauteur constante = roofAt(Z).
 *  Murs le long de Z (X fixe) : trapèzes (slopedSeg).
 *  gaps: [{at, w, type:'door'|'window'}]
 */
function addWall(x1, z1, x2, z2, opts = {}) {
  const { mat = matWall, gaps = [], collide = true } = opts;
  const horizontal = Math.abs(z2 - z1) < 1e-6;
  const a0 = horizontal ? Math.min(x1, x2) : Math.min(z1, z2);
  const a1 = horizontal ? Math.max(x1, x2) : Math.max(z1, z2);
  const fixed = horizontal ? z1 : x1;
  wallRuns.push({ horizontal, fixed, a0, a1 });

  // tronçon plein de s à e, démarrant à y0, sommet au rampant
  const solid = (s, e, y0, coll) => {
    if (horizontal) seg(true, fixed, s, e, y0, roofAt(fixed), mat, coll);
    else slopedSeg(fixed, s, e, y0, mat, coll);
  };

  const gs = gaps
    .map(g => ({ s: g.at - g.w / 2, e: g.at + g.w / 2, type: g.type || 'door' }))
    .sort((p, q) => p.s - q.s);
  let cursor = a0;
  for (const g of gs) {
    if (g.s > cursor) solid(cursor, g.s, 0, collide);
    const hMin = horizontal ? roofAt(fixed) : Math.min(roofAt(g.s), roofAt(g.e));
    if (g.type === 'window') {
      seg(horizontal, fixed, g.s, g.e, 0, SILL, mat, collide);   // allège (bloque)
      const wTop = Math.min(WIN_TOP, hMin - 0.05);               // la fenêtre s'arrête sous le rampant
      glass(horizontal, fixed, g.s, g.e, SILL, wTop);
      solid(g.s, g.e, wTop, false);                              // linteau
    } else {
      solid(g.s, g.e, DOOR_H, false);                            // linteau porte (passage libre)
    }
    cursor = Math.max(cursor, g.e);
  }
  if (cursor < a1) solid(cursor, a1, 0, collide);
}

/*
 *  dressing(x0,z0,x1,z1, front) — caisson plein de x0..x1 × z0..z1 dont le dessus
 *  suit le rampant. front ('n'|'s'|'e'|'w') = face des portes : joints tous les ~60 cm.
 */
function dressing(x0, z0, x1, z1, front) {
  const top = (z) => roofAt(z) - 0.03; // jeu sous le rampant
  const shape = new THREE.Shape();
  shape.moveTo(z0, 0);
  shape.lineTo(z1, 0);
  shape.lineTo(z1, top(z1));
  shape.lineTo(z0, top(z0));
  shape.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false }), matDress);
  m.rotation.y = -Math.PI / 2; // (u=Z, v=Y, profondeur -> X, de x1 vers x0)
  m.position.set(x1, 0, 0);
  m.castShadow = true; m.receiveShadow = true;
  building.add(m);
  addCollider((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);

  // joints verticaux entre les portes, posés sur la face avant
  const alongX = front === 'n' || front === 's';
  const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
  const n = Math.max(1, Math.round((a1 - a0) / 0.6));
  const out = { n: -1, s: 1, w: -1, e: 1 }[front] * 0.003;
  const f = { n: z0, s: z1, w: x0, e: x1 }[front] + out;
  for (let i = 1; i < n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    const h = top(alongX ? f : a) - 0.06;
    if (alongX) mesh(0.012, h - 0.08, 0.006, a, (0.08 + h) / 2, f, matJoint);
    else mesh(0.006, h - 0.08, 0.012, f, (0.08 + h) / 2, a, matJoint);
  }
}

// Dalle de sol
function floorSlab(x0, z0, x1, z1, mat, y = 0) {
  const w = x1 - x0, d = z1 - z0;
  mesh(w, 0.08, d, (x0 + x1) / 2, y - 0.04, (z0 + z1) / 2, mat);
}
// Plafond
function ceilSlab(x0, z0, x1, z1) {
  const m = mesh(x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, H + 0.03, (z0 + z1) / 2, matCeil);
  return m;
}

/* ======================================================================
 *  PLAN — coordonnées (m). Bloc chambres au nord (Z=0..RD).
 * ==================================================================== */
// Cotes relevées sur place (Chambre 2) : largeur 2,45 m, profondeur 4,00 m,
// passage entre la cloison Ch2|Ch3 et le retour du dégagement 1,45 m.
// La cloison Ch2|Ch3 a été déplacée : la Chambre 3 récupère la largeur perdue (façade 10,92 m inchangée).
// Les autres cotes sont celles du plan mises à l'échelle (en X × 2,88 / 3,12, dégagement 1,22 → 1,19).
const RD = 4.00;       // profondeur des chambres (mesurée)
const CORR = 1.19;     // largeur du dégagement (1,22 à l'échelle)
const W_C1 = 2.77, W_SDB = 1.62, W_C2 = 2.45, W_C3 = 4.08; // largeurs des pièces (total 10,92 m)
const X_c1 = W_C1;            // Chambre 1 | Salle de bain
const X_sdb = X_c1 + W_SDB;   // Salle de bain | Chambre 2
const X_c2 = X_sdb + W_C2;    // Chambre 2 | Chambre 3
const XW = X_c2 + W_C3;       // mur est / largeur intérieure
const Z_deg = RD + CORR;      // limite sud du dégagement
const X_terr = X_c2 + 1.45;   // retour est du dégagement (passage de 1,45 m mesuré)
const X_sep = X_sdb + 1.05;   // cloison du dégagement, dans l'alignement du tableau est de la porte Ch2
const DRESS = 0.5;            // profondeur des dressings
// centres des pièces (fenêtres, étiquettes)
const CX_C1 = X_c1 / 2, CX_SDB = (X_c1 + X_sdb) / 2, CX_C2 = (X_sdb + X_c2) / 2, CX_C3 = (X_c2 + XW) / 2;
const fm = (v) => v.toFixed(2).replace('.', ',');

// --- Rampant : tout l'étage est sous pente (mono-pente le long de Z) ---
// Cotes relevées sur place : 1,60 m au mur des fenêtres, 2,70 m au fond des chambres.
const H_LOW  = 1.6;  // mur des fenêtres des chambres (Z = 0)
const H_RD   = 2.7;  // fond des chambres, côté dégagement (Z = RD)
const roofAt = (z) => H_LOW + (H_RD - H_LOW) * (z / RD);
const H_HIGH = roofAt(Z_deg); // mur sud du dégagement (Z = Z_deg) ≈ 3,03 m, même pente prolongée

/* ------------------------------- SOLS ---------------------------------- */
floorSlab(0, 0, XW, RD, matWood);                 // chambres (base bois)
floorSlab(X_c1, 0, X_sdb, RD, matBath);           // salle de bain (carrelage)
floorSlab(0, RD, X_terr, Z_deg, matCorr);         // dégagement / palier

/* ---------------------- RAMPANT (toit en pente) ------------------------- */
const ceilings = [];
{
  const ang = Math.atan2(H_HIGH - H_LOW, Z_deg);
  const roofSlab = (x0, x1, z0, z1) => {
    const len = (z1 - z0) / Math.cos(ang);
    const m = mesh(x1 - x0, 0.06, len,
      (x0 + x1) / 2, (roofAt(z0) + roofAt(z1)) / 2 + 0.05, (z0 + z1) / 2, matCeil);
    m.rotation.x = -ang; // le bord côté dégagement (Z fort) est le plus haut
    return m;
  };
  ceilings.push(roofSlab(0, X_terr, 0, Z_deg));   // au-dessus chambres 1-2 + dégagement
  ceilings.push(roofSlab(X_terr, XW, 0, RD));     // au-dessus de la chambre 3 (partie est)
}

/* ------------------------- MURS EXTÉRIEURS ------------------------------ */
// Nord (fenêtres des chambres + SdB)
addWall(0, 0, XW, 0, { gaps: [
  { at: CX_C1, w: 1.4, type: 'window' },   // Chambre 1
  { at: CX_SDB, w: 0.6, type: 'window' },  // Salle de bain
  { at: CX_C2, w: 1.4, type: 'window' },   // Chambre 2
  { at: CX_C3, w: 1.6, type: 'window' },   // Chambre 3
] });
// Ouest (chambre 1 + palier)
addWall(0, 0, 0, Z_deg);
// Est (chambre 3)
addWall(XW, 0, XW, RD, { gaps: [{ at: RD / 2, w: 1.4, type: 'window' }] });
// Sud : façade le long du dégagement (vide/terrasse non conservés)
addWall(0, Z_deg, X_terr, Z_deg);
addWall(X_terr, RD, X_terr, Z_deg); // retour est du dégagement

/* ------------------------ CLOISONS INTÉRIEURES -------------------------- */
// séparations entre pièces (pleines)
addWall(X_c1, 0, X_c1, RD);
addWall(X_sdb, 0, X_sdb, RD);
addWall(X_c2, 0, X_c2, RD);        // Chambre 2 | Chambre 3
// Mur sud : Chambre 1 / SdB / Chambre 2 (dressing supprimé, Chambre 2 sur toute la profondeur)
addWall(0, RD, X_c2, RD, { gaps: [
  { at: CX_C1, w: 0.9 },              // Chambre 1
  { at: CX_SDB, w: 0.8 },             // Salle de bain
  { at: X_sdb + 0.55, w: 0.9 },       // Chambre 2
] });
// Chambre 3 : mur sud — l'ex-porte de terrasse devient une fenêtre (terrasse non conservée)
addWall(X_terr, RD, XW, RD, { gaps: [{ at: (X_terr + XW) / 2, w: 1.4, type: 'window' }] });
// (vide sur séjour, escalier et terrasse supprimés — seule l'aile chambres est conservée)

// Cloison du dégagement : porte de 0,73 m collée à la façade sud
const DOOR_SEP = 0.73;
addWall(X_sep, RD, X_sep, Z_deg, { gaps: [{ at: Z_deg - T / 2 - DOOR_SEP / 2, w: DOOR_SEP }] });
// Chambre 2 : muret de 0,50 m contre le mur sud, à droite de la porte (joue du dressing)
addWall(X_sep, RD - T / 2 - DRESS, X_sep, RD);

/* ------------------------------ DRESSINGS ------------------------------- */
// Chambre 2 : le long du mur sud, du muret à la cloison Ch2|Ch3
dressing(X_sep + T / 2, RD - T / 2 - DRESS, X_c2 - T / 2, RD - T / 2, 'n');
// Dégagement (après la cloison) : le long du mur de la Chambre 2, retour d'angle compris
dressing(X_sep + T / 2, RD + T / 2, X_c2 + T / 2 + DRESS, RD + T / 2 + DRESS, 's');
// Chambre 3 : le long de la cloison Ch2|Ch3, jusqu'à 0,70 m du mur des fenêtres
dressing(X_c2 + T / 2, 0.7, X_c2 + T / 2 + DRESS, RD + T / 2, 'e');

/* ------------------------------- LABELS --------------------------------- */
function makeLabel(text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const pad = 20, font = 44;
  ctx.font = `600 ${font}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  c.width = w + pad * 2; c.height = font + pad * 2;
  ctx.font = `600 ${font}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(20,24,29,0.82)';
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(c.width, 0, c.width, c.height, r);
  ctx.arcTo(c.width, c.height, 0, c.height, r); ctx.arcTo(0, c.height, 0, 0, r);
  ctx.arcTo(0, 0, c.width, 0, r); ctx.closePath(); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const k = 0.006;
  spr.scale.set(c.width * k, c.height * k, 1);
  return spr;
}
function addLabel(text, x, z, color = '#ffe9c2', y = 1.5) {
  const spr = makeLabel(text, color);
  spr.position.set(x, y, z);
  labels.add(spr);
}
addLabel('Chambre 1', CX_C1, RD / 2);
addLabel('Salle de bain', CX_SDB, RD / 2, '#cfe3ee');
addLabel('Chambre 2', CX_C2, RD / 2);
addLabel('Chambre 3', CX_C3, RD / 2);
addLabel('Dégagement', X_terr / 2, RD + CORR / 2, '#d7e0e6');

// surfaces (m²) — placées sous le nom de chaque pièce
function addArea(text, x, z) {
  const spr = makeLabel(text, '#a7e0b0');
  spr.scale.multiplyScalar(0.62);
  spr.position.set(x, 1.05, z);
  labels.add(spr);
}
const m2 = (a, b) => `${fm(a * b)} m²`;
addArea(m2(W_C1, RD), CX_C1, RD / 2);
addArea(m2(W_SDB, RD), CX_SDB, RD / 2);
addArea(m2(W_C2, RD), CX_C2, RD / 2);
addArea(m2(W_C3, RD), CX_C3, RD / 2);
addArea(m2(X_sep, CORR), X_terr / 2, RD + CORR / 2); // dégagement (jusqu'à la cloison)
addLabel('Dressing', (X_sep + X_terr) / 2, RD + CORR / 2, '#e6d3b3');
addArea(m2(X_terr - X_sep, CORR), (X_sep + X_terr) / 2, RD + CORR / 2);

/* ------------------------------- COTES ---------------------------------- */
const cotes = new THREE.Group();
scene.add(cotes);
function addCote(text, x, z, y = 1.0) {
  const spr = makeLabel(text, '#ffd27f');
  spr.scale.multiplyScalar(0.62);
  spr.position.set(x, y, z);
  cotes.add(spr);
}
// largeurs des pièces (le long du mur nord)
addCote(`${fm(W_C1)} m`, CX_C1, 0.28);
addCote(`${fm(W_SDB)} m`, CX_SDB, 0.28);
addCote(`${fm(W_C2)} m`, CX_C2, 0.28);
addCote(`${fm(W_C3)} m`, CX_C3, 0.28);
// profondeur des chambres + largeur dégagement
addCote(`${fm(RD)} m`, XW + 0.4, RD / 2);
addCote(`${fm(CORR)} m`, 1.3, RD + CORR / 2, 0.9);

// cotes automatiques : longueur + HAUTEUR de chaque mur, affichées en son milieu
for (const w of wallRuns) {
  const len = w.a1 - w.a0;
  if (len < 0.6) continue; // on ignore les tronçons minuscules
  const h0 = roofAt(w.horizontal ? w.fixed : w.a0);
  const h1 = roofAt(w.horizontal ? w.fixed : w.a1);
  const hTxt = Math.abs(h1 - h0) < 0.01
    ? `h ${fm(h0)} m`
    : `h ${fm(Math.min(h0, h1))}→${fm(Math.max(h0, h1))} m`;
  addCote(`${fm(len)} m · ${hTxt}`,
    w.horizontal ? (w.a0 + w.a1) / 2 : w.fixed,
    w.horizontal ? w.fixed : (w.a0 + w.a1) / 2, 0.5);
}

/* ======================================================================
 *  CONTRÔLES : Survol (Orbite) + Visite (1re personne)
 * ==================================================================== */
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.maxPolarAngle = Math.PI / 2 - 0.02;
orbit.target.set(XW / 2, 1, 4);

const ORBIT_POS = new THREE.Vector3(XW / 2, 19, -3);

const fp = new PointerLockControls(camera, renderer.domElement);
const FP_START = new THREE.Vector3(2.2, EYE, RD + CORR / 2);
const FP_LOOK = new THREE.Vector3(X_terr, EYE, RD + CORR / 2 + 0.02); // regard vers l'est, dans l'axe du dégagement

let mode = 'orbit';
const move = { f: false, b: false, l: false, r: false, run: false };

function setOrbit() {
  mode = 'orbit';
  fp.unlock();
  orbit.enabled = true;
  camera.position.copy(ORBIT_POS);
  orbit.target.set(XW / 2, 1, 4);
  orbit.update();
  labels.visible = document.getElementById('toggle-labels').checked;
  cotes.visible = document.getElementById('toggle-cotes').checked;
  document.getElementById('mode-orbit').classList.add('active');
  document.getElementById('mode-fp').classList.remove('active');
  document.getElementById('crosshair').classList.add('hidden');
  document.getElementById('lock-overlay').classList.add('hidden');
  document.getElementById('hint').innerHTML =
    '<b>Survol</b> — clic gauche : orbite · molette : zoom · clic droit : déplace';
}
function setFP() {
  mode = 'fp';
  orbit.enabled = false;
  camera.position.copy(FP_START);
  camera.lookAt(FP_LOOK);
  labels.visible = false; // étiquettes masquées en visite (repères de survol)
  cotes.visible = false;
  document.getElementById('mode-orbit').classList.remove('active');
  document.getElementById('mode-fp').classList.add('active');
  document.getElementById('lock-overlay').classList.remove('hidden');
  document.getElementById('hint').innerHTML =
    '<b>Visite</b> — ZQSD/WASD/flèches · souris : regarder · Maj : courir · Échap : sortir';
}

document.getElementById('mode-orbit').addEventListener('click', setOrbit);
document.getElementById('mode-fp').addEventListener('click', setFP);

document.getElementById('lock-overlay').addEventListener('click', () => {
  if (mode === 'fp') fp.lock();
});
fp.addEventListener('lock', () => {
  document.getElementById('lock-overlay').classList.add('hidden');
  document.getElementById('crosshair').classList.remove('hidden');
});
fp.addEventListener('unlock', () => {
  document.getElementById('crosshair').classList.add('hidden');
  if (mode === 'fp') document.getElementById('lock-overlay').classList.remove('hidden');
});

addEventListener('keydown', (e) => keyEvent(e, true));
addEventListener('keyup', (e) => keyEvent(e, false));
function keyEvent(e, down) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': move.f = down; break;    // Z sur AZERTY
    case 'KeyS': case 'ArrowDown': move.b = down; break;
    case 'KeyA': case 'ArrowLeft': move.l = down; break;  // Q sur AZERTY
    case 'KeyD': case 'ArrowRight': move.r = down; break;
    case 'ShiftLeft': case 'ShiftRight': move.run = down; break;
  }
}

// collision : le point (x,z) au rayon R touche-t-il un solide ?
function hits(x, z) {
  for (const b of solids) {
    if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R) return true;
  }
  return false;
}

/* -------------------------- Toggles interface --------------------------- */
document.getElementById('toggle-ceiling').addEventListener('change', (e) => {
  ceilings.forEach(c => (c.visible = e.target.checked));
});
document.getElementById('toggle-ceiling').checked = false;
ceilings.forEach(c => (c.visible = false));
document.getElementById('toggle-labels').addEventListener('change', (e) => (labels.visible = e.target.checked));
document.getElementById('toggle-cotes').addEventListener('change', (e) => (cotes.visible = e.target.checked));
document.getElementById('toggle-grid').addEventListener('change', (e) => (grid.visible = e.target.checked));

/* ------------------------------ Boucle ---------------------------------- */
const clock = new THREE.Clock();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (mode === 'orbit') {
    orbit.update();
  } else if (fp.isLocked) {
    const speed = (move.run ? 6 : 3) * dt;
    const obj = fp.getObject();
    const ox = obj.position.x, oz = obj.position.z;
    const fwd = (move.f ? 1 : 0) - (move.b ? 1 : 0);
    const str = (move.r ? 1 : 0) - (move.l ? 1 : 0);
    if (fwd) fp.moveForward(fwd * speed);
    if (str) fp.moveRight(str * speed);
    const nx = obj.position.x, nz = obj.position.z;
    // collision axis-séparée
    obj.position.set(ox, EYE, oz);
    if (!hits(nx, oz)) obj.position.x = nx;
    if (!hits(obj.position.x, nz)) obj.position.z = nz;
    obj.position.y = EYE;
  }
  renderer.render(scene, camera);
}

setOrbit();
animate();
