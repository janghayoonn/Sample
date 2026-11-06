// 여러 화면에서 함께 쓰는 도구들

// 내지 규격: 세로형 A5(기본) / 정사각형 / 가로형 16:9
export const PRESETS = [
  { key: 'a5', label: '세로형 A5 — 책 기본 (추천)', w: 148, h: 210 },
  { key: 'square', label: '정사각형 1:1', w: 200, h: 200 },
  { key: 'wide', label: '가로형 16:9', w: 160, h: 90 },
];

// 규격 선택 상자 채우기. 목록에 없는 예전 규격이면 '현재 규격'으로 함께 보여줌
export function fillPresetSelect(select, size) {
  const match = size && PRESETS.find((p) => p.w === size.w && p.h === size.h);
  const opts = PRESETS.map((p) => `<option value="${p.key}">${p.label}</option>`);
  if (size && !match) opts.push(`<option value="legacy">현재 규격 유지 (${size.w} × ${size.h})</option>`);
  select.innerHTML = opts.join('');
  select.value = match ? match.key : size ? 'legacy' : 'a5';
}

export function sizeFromSelect(select, current) {
  const p = PRESETS.find((x) => x.key === select.value);
  return p ? { w: p.w, h: p.h } : current;
}

export async function api(url, options = {}) {
  const opts = { ...options };
  if (opts.json !== undefined) {
    opts.body = JSON.stringify(opts.json);
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    delete opts.json;
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '문제가 생겼습니다.');
  return data;
}

// 이미지 주소: 인터넷 저장소는 전체 주소(https://…), 내 컴퓨터는 파일 이름
export const imgUrl = (ref) => (/^https?:\/\//.test(ref) ? ref : `/uploads/${encodeURIComponent(ref)}`);

// 올리기 전에 큰 이미지를 줄이기 (인터넷 버전은 한 번에 약 4.5MB까지만 받을 수 있음)
const MAX_BYTES = 3.8 * 1024 * 1024;
const MAX_EDGE = 3000;
export async function prepareImage(file) {
  if (file.size <= MAX_BYTES || file.type === 'image/gif') return file;
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.92, 0.85, 0.75, 0.6]) {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && (blob.size <= MAX_BYTES || q === 0.6)) {
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
  }
  return file;
}

export function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 페이지 이미지에 맞춤/확대/위치 값을 적용
export function applyImageStyle(img, p) {
  img.style.objectFit = p.fit || 'cover';
  img.style.objectPosition = `${p.x ?? 50}% ${p.y ?? 50}%`;
  img.style.transformOrigin = `${p.x ?? 50}% ${p.y ?? 50}%`;
  img.style.transform = `scale(${p.scale ?? 1})`;
}

// 내지 한 장을 책 규격 비율로 만들어 돌려줌
export function makePage(p, size, { lazy = true } = {}) {
  const el = document.createElement('div');
  el.className = 'page';
  el.style.aspectRatio = `${size.w} / ${size.h}`;
  if (p?.image) {
    const img = document.createElement('img');
    if (lazy) img.loading = 'lazy';
    img.src = imgUrl(p.image);
    img.alt = '';
    applyImageStyle(img, p);
    el.append(img);
  }
  return el;
}

export function coverHTML(book) {
  const ratio = `${book.pageSize.w} / ${book.pageSize.h}`;
  const inner = book.cover
    ? `<img src="${imgUrl(book.cover)}" alt="" loading="lazy">`
    : `<div class="cover-placeholder">${esc(book.title)}</div>`;
  return `<div class="cover" style="aspect-ratio:${ratio}">${inner}</div>`;
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export const pad = (n) => String(n).padStart(2, '0');

// 로그아웃 버튼 (편집 화면)
document.addEventListener('click', async (e) => {
  if (!e.target.closest?.('[data-logout]')) return;
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/';
});
