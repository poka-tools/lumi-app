const DB_NAME = 'yashoku-salary';
const DB_VERSION = 4;
let _db = null;

export function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profile'))
        db.createObjectStore('profile', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('backItems'))
        db.createObjectStore('backItems', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('shifts'))
        db.createObjectStore('shifts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('announcements'))
        db.createObjectStore('announcements', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('todos'))
        db.createObjectStore('todos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('customers'))
        db.createObjectStore('customers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('visits'))
        db.createObjectStore('visits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events'))
        db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reservations'))
        db.createObjectStore('reservations', { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}
const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

export async function getAll(store) { return wrap((await tx(store, 'readonly')).getAll()); }
export async function get(store, id) { return wrap((await tx(store, 'readonly')).get(id)); }
export async function put(store, value) { return wrap((await tx(store, 'readwrite')).put(value)); }
export async function del(store, id) { return wrap((await tx(store, 'readwrite')).delete(id)); }

export async function getProfile() {
  return (await get('profile', 'me')) || { id: 'me', name: '', hourlyWage: 0, storeName: '', defaultStart: '20:00', defaultEnd: '01:00', defaultBreakMin: 0 };
}
export async function saveProfile(p) { return put('profile', { ...p, id: 'me' }); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
