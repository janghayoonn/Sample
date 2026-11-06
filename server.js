// 프로젝트 북 아카이브 — 서버
// 내 컴퓨터에서는 data/ 폴더에, Vercel(인터넷)에서는 Vercel 저장소에 저장합니다. (storage.js 참고)

import express from 'express';
import multer from 'multer';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, isCloud } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');

const store = await createStore(DATA_DIR);

// ---------- 책 정보와 비밀번호 정보 불러오기 ----------
// 내 컴퓨터: 처음 한 번만 읽고 메모리에 둠
// Vercel: 서버가 여러 개로 나뉘어 돌기 때문에 요청마다 최신 상태를 다시 읽음
let db = { books: [] };
let auth = {};
let loaded = false;

async function load() {
  if (loaded && !isCloud) return;
  db = (await store.getJSON('db')) || { books: [] };
  auth = (await store.getJSON('auth')) || {};
  if (!auth.secret) {
    auth.secret = randomBytes(32).toString('hex');
    await store.setJSON('auth', auth);
  }
  loaded = true;
}

let writing = Promise.resolve();
function save() {
  writing = writing.then(() => store.setJSON('db', db));
  return writing;
}

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 10);
const findBook = (id) => db.books.find((b) => b.id === id);
const removeFile = (ref) => store.removeImage(ref);

// ---------- 편집 비밀번호 ----------
// 비밀번호는 원문이 아니라 '복원할 수 없는 형태(해시)'로만 저장합니다.
// ADMIN_PASSWORD 설정값이 있으면 그것이 우선합니다.
const ENV_PASSWORD = process.env.ADMIN_PASSWORD || '';
const sessionSecret = () => process.env.SESSION_SECRET || auth.secret;

function hashPassword(pw, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(pw, salt, 64).toString('hex') };
}
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function checkPassword(pw) {
  if (ENV_PASSWORD) return safeEqual(hashPassword(pw, 'env').hash, hashPassword(ENV_PASSWORD, 'env').hash);
  if (!auth.hash) return false;
  return safeEqual(hashPassword(pw, auth.salt).hash, auth.hash);
}
const passwordIsSet = () => Boolean(ENV_PASSWORD || auth.hash);

const COOKIE = 'ba_session';
const SESSION_DAYS = 30;
const sign = (v) => createHmac('sha256', sessionSecret()).update(v).digest('hex');
function makeSession() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${exp}.${sign(exp)}`;
}
function isLoggedIn(req) {
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [exp, sig] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  return Boolean(exp && sig) && safeEqual(sig, sign(exp)) && Number(exp) > Date.now();
}
function setSessionCookie(req, res) {
  res.cookie(COOKIE, makeSession(), {
    httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 864e5, path: '/',
  });
}

// 비밀번호를 계속 틀리는 경우 잠시 막기 (15분에 10번)
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  return Boolean(f && f.until > Date.now() && f.count >= 10);
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + 15 * 60e3 });
  else f.count++;
}

// ---------- 이미지 업로드 설정 ----------
// Vercel은 한 번에 받을 수 있는 크기가 약 4.5MB라서, 화면 쪽에서 미리 줄여서 한 장씩 보냅니다.
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.floor((isCloud ? 4.4 : 50) * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED.has(ext) && file.mimetype.startsWith('image/'));
  },
});
const extOf = (file) => path.extname(file.originalname).toLowerCase() || '.jpg';
const saveUpload = (file) => store.saveImage(file.buffer, extOf(file), file.mimetype);

function cleanSize(input) {
  const w = Number(input?.w);
  const h = Number(input?.h);
  if (w >= 50 && w <= 1000 && h >= 50 && h <= 1000) return { w, h };
  return { w: 148, h: 210 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const notFound = (res) => res.status(404).json({ error: '책을 찾을 수 없습니다.' });

// ---------- 앱 ----------
const app = express();
app.set('trust proxy', 1); // 인터넷 호스팅(https) 환경에서 보안 쿠키가 제대로 동작하도록
app.use(express.json());
if (!isCloud) {
  // Vercel에서는 public 폴더를 Vercel이 직접 보내 줍니다.
  app.use('/uploads', express.static(store?.uploadDir || DATA_DIR, { maxAge: '7d' }));
  app.use(express.static(path.join(__dirname, 'public')));
}

// 저장소가 아직 연결되지 않았을 때 안내
app.use((req, res, next) => {
  if (store) return next();
  res.status(503).type('html').send(`<!doctype html><meta charset="utf-8"><body style="font:18px/1.6 sans-serif;padding:40px;max-width:640px">
    <h1>저장소 연결이 필요해요</h1>
    <p>Vercel 프로젝트의 <b>Storage</b> 메뉴에서 <b>Blob</b>과 <b>Upstash Redis</b>를 만들어 이 프로젝트에 연결한 뒤, 다시 배포(Redeploy)해 주세요.</p></body>`);
});

// 매 요청 전에 최신 데이터 불러오기
app.use(async (_req, _res, next) => {
  try { await load(); next(); } catch (e) { next(e); }
});

// --- 로그인 ---
app.get('/api/auth/status', (req, res) => {
  res.json({ needsSetup: !passwordIsSet(), loggedIn: isLoggedIn(req) });
});

app.post('/api/auth/setup', async (req, res) => {
  if (passwordIsSet()) return res.status(400).json({ error: '이미 비밀번호가 정해져 있습니다.' });
  const pw = String(req.body.password || '');
  if (pw.length < 6) return res.status(400).json({ error: '비밀번호는 6자 이상으로 정해 주세요.' });
  Object.assign(auth, hashPassword(pw));
  await store.setJSON('auth', auth);
  setSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  if (tooManyFailures(req.ip)) {
    return res.status(429).json({ error: '여러 번 틀려서 잠시 잠겼어요. 15분 뒤에 다시 시도해 주세요.' });
  }
  if (!checkPassword(String(req.body.password || ''))) {
    recordFailure(req.ip);
    return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
  }
  failures.delete(req.ip);
  setSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// 편집용 요청(만들기·수정·삭제)은 로그인한 사람만
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || isLoggedIn(req)) return next();
  res.status(401).json({ error: '로그인이 필요합니다. 페이지를 새로고침해 주세요.' });
});

// 화면(페이지) 주소
const page = (dir, file) => (_req, res) => res.sendFile(path.join(__dirname, dir, file));
const requireLogin = (req, res, next) => {
  if (isLoggedIn(req)) return next();
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
};
app.get('/', page('public', 'index.html'));
app.get('/b/:id', page('public', 'book.html'));
app.get('/login', page('private', 'login.html'));
app.get('/edit', requireLogin, page('private', 'edit.html'));
app.get('/edit/:id', requireLogin, page('private', 'editor.html'));

// --- 책 목록 / 조회 ---
app.get('/api/books', (_req, res) => {
  const list = [...db.books].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list.map(({ pages, ...rest }) => ({ ...rest, pageCount: pages.length })));
});

app.get('/api/books/:id', (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return notFound(res);
  res.json(book);
});

// --- 새 책 만들기 ---
app.post('/api/books', upload.single('cover'), async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: '프로젝트명을 입력해 주세요.' });
  const now = new Date().toISOString();
  const book = {
    id: shortId(),
    title,
    description: (req.body.description || '').trim(),
    cover: req.file ? await saveUpload(req.file) : null,
    pageSize: cleanSize({ w: req.body.pageW, h: req.body.pageH }),
    pages: [],
    createdAt: now,
    updatedAt: now,
  };
  db.books.push(book);
  await save();
  res.status(201).json(book);
});

// --- 책 정보 수정 ---
app.put('/api/books/:id', async (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return notFound(res);
  const { title, description, pageSize } = req.body;
  if (typeof title === 'string') {
    if (!title.trim()) return res.status(400).json({ error: '프로젝트명을 입력해 주세요.' });
    book.title = title.trim();
  }
  if (typeof description === 'string') book.description = description.trim();
  if (pageSize) book.pageSize = cleanSize(pageSize);
  book.updatedAt = new Date().toISOString();
  await save();
  res.json(book);
});

// --- 표지 바꾸기 ---
app.post('/api/books/:id/cover', upload.single('cover'), async (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return notFound(res);
  if (!req.file) return res.status(400).json({ error: '이미지 파일을 선택해 주세요.' });
  const old = book.cover;
  book.cover = await saveUpload(req.file);
  book.updatedAt = new Date().toISOString();
  await save();
  await removeFile(old);
  res.json(book);
});

// --- 책 삭제 ---
app.delete('/api/books/:id', async (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return notFound(res);
  db.books = db.books.filter((b) => b !== book);
  await save();
  await removeFile(book.cover);
  for (const p of book.pages) await removeFile(p.image);
  res.json({ ok: true });
});

// --- 내지 추가 ---
app.post('/api/books/:id/pages', upload.array('images', 200), async (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return notFound(res);
  if (!req.files?.length) return res.status(400).json({ error: '이미지 파일을 선택해 주세요.' });
  for (const f of req.files) {
    book.pages.push({ id: shortId(), image: await saveUpload(f), fit: 'cover', scale: 1, x: 50, y: 50 });
  }
  book.updatedAt = new Date().toISOString();
  await save();
  res.json(book);
});

// --- 내지 순서 바꾸기 ---
app.put('/api/books/:id/pages/order', async (req, res) => {
  const book = findBook(req.params.id);
  if (!book) return notFound(res);
  const order = req.body.order;
  if (!Array.isArray(order) || order.length !== book.pages.length) {
    return res.status(400).json({ error: '순서 정보가 올바르지 않습니다.' });
  }
  const byId = new Map(book.pages.map((p) => [p.id, p]));
  const next = order.map((id) => byId.get(id));
  if (next.some((p) => !p) || new Set(order).size !== order.length) {
    return res.status(400).json({ error: '순서 정보가 올바르지 않습니다.' });
  }
  book.pages = next;
  book.updatedAt = new Date().toISOString();
  await save();
  res.json(book);
});

// --- 내지 이미지 조절값 저장 ---
app.patch('/api/books/:id/pages/:pageId', async (req, res) => {
  const book = findBook(req.params.id);
  const p = book?.pages.find((x) => x.id === req.params.pageId);
  if (!p) return res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
  const { fit, scale, x, y } = req.body;
  if (fit === 'cover' || fit === 'contain') p.fit = fit;
  if (Number.isFinite(scale)) p.scale = clamp(scale, 1, 4);
  if (Number.isFinite(x)) p.x = clamp(x, 0, 100);
  if (Number.isFinite(y)) p.y = clamp(y, 0, 100);
  book.updatedAt = new Date().toISOString();
  await save();
  res.json(book);
});

// --- 내지 삭제 ---
app.delete('/api/books/:id/pages/:pageId', async (req, res) => {
  const book = findBook(req.params.id);
  const p = book?.pages.find((x) => x.id === req.params.pageId);
  if (!p) return res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
  book.pages = book.pages.filter((x) => x !== p);
  book.updatedAt = new Date().toISOString();
  await save();
  await removeFile(p.image);
  res.json(book);
});

// 에러 처리
app.use((err, _req, res, _next) => {
  console.error(err);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? '파일이 너무 큽니다.' : '문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.';
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 400 : 500).json({ error: msg });
});

export default app;

// 내 컴퓨터에서 실행할 때만 직접 켭니다 (Vercel은 알아서 실행)
if (!isCloud) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  프로젝트 북 아카이브가 켜졌습니다.');
    console.log(`  열람:  http://localhost:${PORT}`);
    console.log(`  편집:  http://localhost:${PORT}/edit`);
    console.log('  (끄려면 이 창에서 Control + C)');
    console.log('');
  });
}
