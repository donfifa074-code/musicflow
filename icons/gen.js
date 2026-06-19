const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const outputDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

[192, 512].forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;

  // Background gradient circle
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, '#6c5ce7');
  grad.addColorStop(1, '#a29bfe');

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Music note
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const s = size / 512;

  // Note body (ellipse)
  ctx.beginPath();
  ctx.ellipse(cx - 30*s, cy + 50*s, 45*s, 30*s, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Stem
  ctx.fillRect(cx + 10*s, cy - 80*s, 10*s, 130*s);

  // Flag
  ctx.beginPath();
  ctx.moveTo(cx + 20*s, cy - 80*s);
  ctx.quadraticCurveTo(cx + 80*s, cy - 50*s, cx + 60*s, cy - 20*s);
  ctx.quadraticCurveTo(cx + 40*s, cy - 40*s, cx + 20*s, cy - 50*s);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(outputDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`Created ${outPath} (${buffer.length} bytes)`);
});
