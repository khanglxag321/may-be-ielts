import * as THREE from 'three';

// The approved PNG stays untouched. Only its unseen, shallow volume is inferred.
const DEPTH = .06;

function simplifyLine(points, tolerance) {
 const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
 while (stack.length) {
  const [first, last] = stack.pop(), a = points[first], b = points[last];
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  let furthest = -1, distance = tolerance * tolerance;
  for (let i = first + 1; i < last; i++) {
   const p = points[i], t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
   const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
   if (d > distance) { distance = d; furthest = i; }
  }
  if (furthest >= 0) { keep.add(furthest); stack.push([first, furthest], [furthest, last]); }
 }
 return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

function simplifyLoop(points) {
 // A short smoothing pass removes sample-grid stair steps from the side wall.
 const smooth = points.map((p, i) => {
  const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
  return [(before[0] + p[0] * 2 + after[0]) / 4, (before[1] + p[1] * 2 + after[1]) / 4];
 });
 let split = 1, distance = 0;
 for (let i = 1; i < smooth.length; i++) {
  const d = (smooth[i][0] - smooth[0][0]) ** 2 + (smooth[i][1] - smooth[0][1]) ** 2;
  if (d > distance) { distance = d; split = i; }
 }
 const first = simplifyLine(smooth.slice(0, split + 1), .65);
 const second = simplifyLine([...smooth.slice(split), smooth[0]], .65);
 return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function artworkOutline(image) {
 const sourceWidth = image.naturalWidth || image.width, sourceHeight = image.naturalHeight || image.height;
 const scale = 128 / Math.max(sourceWidth, sourceHeight);
 const width = Math.max(1, Math.round(sourceWidth * scale)), height = Math.max(1, Math.round(sourceHeight * scale));
 const canvas = document.createElement('canvas');
 canvas.width = width + 2; canvas.height = height + 2;
 const context = canvas.getContext('2d', {willReadFrequently: true});
 if (!context) throw new Error('Canvas outline unavailable');
 context.drawImage(image, 1, 1, width, height);
 const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
 const occupied = (x, y) => x >= 0 && y >= 0 && x < canvas.width && y < canvas.height && pixels[(y * canvas.width + x) * 4 + 3] >= 32;
 const edges = [], starts = new Map();
 let left = width + 1, top = height + 1, right = 1, bottom = 1;
 function edge(x, y, endX, endY, direction) {
  const item = {x, y, endX, endY, direction, used: false}, key = `${x},${y}`;
  edges.push(item);
  if (!starts.has(key)) starts.set(key, []);
  starts.get(key).push(item);
 }
 for (let y = 1; y <= height; y++) for (let x = 1; x <= width; x++) {
  if (!occupied(x, y)) continue;
  left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  // Clockwise in image space: keep occupied pixels on the right of each edge.
  if (!occupied(x, y - 1)) edge(x, y, x + 1, y, 0);
  if (!occupied(x + 1, y)) edge(x + 1, y, x + 1, y + 1, 1);
  if (!occupied(x, y + 1)) edge(x + 1, y + 1, x, y + 1, 2);
  if (!occupied(x - 1, y)) edge(x, y + 1, x, y, 3);
 }
 if (!edges.length) throw new Error('No opaque artwork');
 let largest = [], largestArea = 0;
 const turnRank = [1, 0, 3, 2];
 for (const initial of edges) {
  if (initial.used) continue;
  const points = []; let current = initial, closed = false;
  while (current && !current.used) {
   current.used = true; points.push([current.x, current.y]);
   if (current.endX === initial.x && current.endY === initial.y) { closed = true; break; }
   const direction = current.direction;
   const next = (starts.get(`${current.endX},${current.endY}`) || []).filter(candidate => !candidate.used);
   // Prefer a right turn at diagonal pixel contacts, keeping separate contours.
   next.sort((a, b) => turnRank[(a.direction - direction + 4) % 4] - turnRank[(b.direction - direction + 4) % 4]);
   current = next[0];
  }
  if (!closed || points.length < 3) continue;
  const area = Math.abs(points.reduce((sum, p, i) => {
   const next = points[(i + 1) % points.length]; return sum + p[0] * next[1] - next[0] * p[1];
  }, 0));
  if (area > largestArea) { largestArea = area; largest = points; }
 }
 if (largest.length < 3) throw new Error('No closed artwork outline');
 // One sample of padding retains antialiased edge pixels on the front artwork.
 left = Math.max(1, left - 1); top = Math.max(1, top - 1);
 right = Math.min(width + 1, right + 1); bottom = Math.min(height + 1, bottom + 1);
 const span = bottom - top, centerX = (left + right) / 2;
 return {
  points: simplifyLoop(largest).map(p => new THREE.Vector2((p[0] - centerX) / span, (bottom - p[1]) / span)),
  aspect: (right - left) / span,
  uv: [(left - 1) / width, 1 - (bottom - 1) / height, (right - 1) / width, 1 - (top - 1) / height]
 };
}

export async function loadArtworkRelief(renderer, assetUrl, {color = 0xffffff} = {}) {
 const texture = await new THREE.TextureLoader().loadAsync(String(assetUrl));
 texture.colorSpace = THREE.SRGBColorSpace;
 texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
 const model = new THREE.Group(); model.name = 'Approved_Artwork_Relief';
 let outline = null;
 try { outline = artworkOutline(texture.image); } catch { /* Keep the exact front image even if canvas reads are unavailable. */ }
 const aspect = outline?.aspect || (texture.image.naturalWidth || texture.image.width) / (texture.image.naturalHeight || texture.image.height);
 if (outline) {
  const shape = new THREE.Shape(outline.points);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: DEPTH, steps: 1, bevelEnabled: true, bevelThickness: .003, bevelSize: .002, bevelSegments: 1, curveSegments: 1});
  const volume = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color, roughness: .8, metalness: 0}));
  volume.name = 'Inferred_Shallow_Volume'; volume.castShadow = true; volume.receiveShadow = true; model.add(volume);
 }
 const front = new THREE.ShaderMaterial({
  uniforms: {artwork: {value: texture}, eyeOpen: {value: 1}, speech: {value: 0}},
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform sampler2D artwork;varying vec2 vUv;void main(){vec4 color=texture2D(artwork,vUv);if(color.a<.035)discard;gl_FragColor=color;\n#include <colorspace_fragment>\n}',
  transparent: true, depthWrite: true, side: THREE.DoubleSide, toneMapped: false
 });
 const geometry = new THREE.PlaneGeometry(aspect, 1);
 if (outline) {
  const [u0, v0, u1, v1] = outline.uv, uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
 }
 const artwork = new THREE.Mesh(geometry, front);
 artwork.name = 'Brand_Front'; artwork.position.set(0, .5, DEPTH + .004); artwork.castShadow = true;
 artwork.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: .035, side: THREE.DoubleSide});
 model.add(artwork); model.userData.artworkRelief = outline ? 'closed-silhouette' : 'plane-fallback';
 return {model, front};
}
