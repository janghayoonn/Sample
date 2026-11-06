// 저장소 — 어디에 저장할지 한곳에서 정합니다.
//  · 내 컴퓨터: data/ 폴더 (책 정보 = JSON 파일, 이미지 = data/uploads)
//  · Vercel(인터넷): 책 정보 = Upstash Redis, 이미지 = Vercel Blob
//    Vercel 대시보드에서 두 저장소를 연결하면 필요한 설정값이 자동으로 들어옵니다.

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export const isCloud = Boolean(process.env.VERCEL);
export const cloudReady = Boolean(REDIS_URL && REDIS_TOKEN && BLOB_TOKEN);

// ---------- 로컬(내 컴퓨터) ----------
function localStore(dataDir) {
  const uploadDir = path.join(dataDir, 'uploads');
  fssync.mkdirSync(uploadDir, { recursive: true });
  const file = (name) => path.join(dataDir, `${name}.json`);
  return {
    uploadDir,
    async getJSON(name) {
      try { return JSON.parse(await fs.readFile(file(name), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async setJSON(name, value) {
      const tmp = file(name) + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(value, null, 2));
      await fs.rename(tmp, file(name));
    },
    async saveImage(buffer, ext) {
      const name = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
      await fs.writeFile(path.join(uploadDir, name), buffer);
      return name;
    },
    async removeImage(ref) {
      if (!ref || ref.startsWith('http')) return;
      await fs.rm(path.join(uploadDir, path.basename(ref)), { force: true });
    },
  };
}

// ---------- 인터넷(Vercel) ----------
async function cloudStore() {
  const { Redis } = await import('@upstash/redis');
  const blob = await import('@vercel/blob');
  const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  const key = (name) => `book-archive:${name}`;
  return {
    async getJSON(name) {
      return (await redis.get(key(name))) ?? null;
    },
    async setJSON(name, value) {
      await redis.set(key(name), JSON.stringify(value));
    },
    async saveImage(buffer, ext, contentType) {
      const res = await blob.put(`pages/${Date.now()}${ext}`, buffer, {
        access: 'public', addRandomSuffix: true, contentType,
      });
      return res.url;
    },
    async removeImage(ref) {
      if (!ref || !ref.startsWith('http')) return;
      try { await blob.del(ref); } catch (e) { console.error('이미지 삭제 실패', e.message); }
    },
  };
}

export async function createStore(dataDir) {
  if (isCloud) {
    if (!cloudReady) return null; // 저장소 연결 전
    return cloudStore();
  }
  return localStore(dataDir);
}
