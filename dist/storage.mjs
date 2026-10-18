import { emptyState, validateBackup } from './core.mjs';
const DB_NAME = 'trampolin-trainer';
export class LocalStore {
  constructor() { this.db = null; this.mode = 'unavailable'; this.lastSavedAt = null; }
  async open() {
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        const timeout = setTimeout(() => reject(new Error('Speicherzugriff verzögert.')), 5000);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state'); };
        req.onsuccess = () => { clearTimeout(timeout); resolve(req.result); };
        req.onerror = () => { clearTimeout(timeout); reject(req.error); };
        req.onblocked = () => { clearTimeout(timeout); reject(new Error('Speicher durch anderen Tab blockiert.')); };
      });
      this.db.onversionchange = () => { this.db.close(); this.mode = 'unavailable'; };
      this.mode = 'indexeddb';
    } catch {
      try { localStorage.setItem('tt-storage-test', '1'); localStorage.removeItem('tt-storage-test'); this.mode = 'localstorage'; }
      catch { this.mode = 'memory'; }
    }
    let saved = null;
    if (this.mode === 'indexeddb') saved = await new Promise((resolve, reject) => {
      const req = this.db.transaction('state', 'readonly').objectStore('state').get('personal');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    else if (this.mode === 'localstorage') { const raw = localStorage.getItem('tt-personal-v1'); if (raw) saved = JSON.parse(raw); }
    this.lastSavedAt = saved?.updatedAt ?? null;
    // Never silently overwrite an unreadable existing store.
    return saved ? validateBackup(saved) : emptyState();
  }
  async save(state) {
    const data = validateBackup(state);
    if (this.mode === 'memory') return;
    const conflict = () => new Error('Daten wurden in einem anderen Tab verändert. Bitte lade die Seite neu, bevor du weiterarbeitest.');
    if (this.mode === 'localstorage') {
      const current = JSON.parse(localStorage.getItem('tt-personal-v1') || 'null');
      if ((current?.updatedAt ?? null) !== this.lastSavedAt) throw conflict();
      localStorage.setItem('tt-personal-v1', JSON.stringify(data)); this.lastSavedAt = data.updatedAt; return;
    }
    if (this.mode !== 'indexeddb') throw new Error('Lokaler Speicher ist nicht verfügbar. Bitte die Seite neu laden.');
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction('state', 'readwrite');
      const table = tx.objectStore('state');
      let reason;
      const current = table.get('personal');
      current.onsuccess = () => {
        if ((current.result?.updatedAt ?? null) !== this.lastSavedAt) { reason = conflict(); tx.abort(); }
        else table.put(data, 'personal');
      };
      tx.oncomplete = () => { this.lastSavedAt = data.updatedAt; resolve(); };
      tx.onerror = () => reject(reason || tx.error); tx.onabort = () => reject(reason || tx.error || new Error('Speichern abgebrochen.'));
    });
  }
}
