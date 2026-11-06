// 여러 화면에서 함께 쓰는 도구들

export const PRESETS = [
  { key: 'a4', label: 'A4 (210 × 297mm)', w: 210, h: 297 },
  { key: 'a5', label: 'A5 (148 × 210mm)', w: 148, h: 210 },
  { key: 'b5', label: 'B5 (182 × 257mm)', w: 182, h: 257 },
  { key: 'letter', label: '레터 (216 × 279mm)', w: 216, h: 279 },
  { key: 'square', label: '정사각 (200 × 200mm)', w: 200, h: 200 },
  { key: 'a4l', label: 'A4 가로 (297 × 210mm)', w: 297, h: 210 },
  { key: 'custom', label: '직접 입력', w: null, h: null },
];

export function presetFor(size) {
  return PRESETS.find((p) => p.w === size.w && p.h === size.h)?.key || 'custom';
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

export const imgUrl = (name) => `/uploads/${encodeURIComponent(name)}`;

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
