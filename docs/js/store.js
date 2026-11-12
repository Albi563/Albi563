// Accesso ai dati. Due implementazioni con la stessa interfaccia:
//  - DemoStore: tutto in localStorage (quando Firebase non è configurato)
//  - FirebaseStore: Firestore condiviso in tempo reale tra i familiari
import { firebaseConfig } from './config.js';
import { demoPeople } from './demo-data.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';

export function randomId(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Pulisce un oggetto persona prima di salvarlo. */
function clean(p) {
  return {
    id: p.id,
    firstName: (p.firstName || '').trim(),
    lastName: (p.lastName || '').trim(),
    sex: p.sex === 'F' ? 'F' : 'M',
    birth: p.birth?.y ? { y: +p.birth.y, m: +p.birth.m || null, d: +p.birth.d || null } : null,
    birthPlace: p.birthPlace?.name ? p.birthPlace : null,
    alive: p.alive !== false,
    death: p.alive === false && p.death?.y ? { y: +p.death.y, m: +p.death.m || null, d: +p.death.d || null } : null,
    residence: p.residence?.name ? p.residence : null,
    notes: (p.notes || '').trim(),
    photo: p.photo || null,
    parents: [...new Set((p.parents || []).filter((x) => x && x !== p.id))].slice(0, 2),
    partnerId: p.partnerId && p.partnerId !== p.id ? p.partnerId : null,
    createdAt: p.createdAt || null,
    createdBy: p.createdBy || null,
    updatedAt: p.updatedAt || null,
    updatedBy: p.updatedBy || null,
  };
}

/**
 * Calcola tutte le scritture necessarie per salvare `person`,
 * mantenendo la coppia simmetrica (A partner di B ⇔ B partner di A).
 */
function planSave(cache, input, by) {
  const now = Date.now();
  const old = cache.get(input.id);
  const person = clean({
    ...input,
    createdAt: old?.createdAt || now,
    createdBy: old?.createdBy || by,
    updatedAt: now,
    updatedBy: by,
  });
  const writes = new Map([[person.id, person]]);
  const touch = (p, changes) => {
    const base = writes.get(p.id) || p;
    writes.set(p.id, { ...base, ...changes, updatedAt: now, updatedBy: by });
  };
  const oldPartner = old?.partnerId || null;
  const newPartner = person.partnerId;
  if (oldPartner !== newPartner) {
    const op = oldPartner && cache.get(oldPartner);
    if (op && op.partnerId === person.id) touch(op, { partnerId: null });
    const np = newPartner && cache.get(newPartner);
    if (np) {
      const ex = np.partnerId && np.partnerId !== person.id && cache.get(np.partnerId);
      if (ex && ex.partnerId === np.id) touch(ex, { partnerId: null });
      touch(np, { partnerId: person.id });
    }
  }
  const history = {
    personId: person.id,
    action: old ? 'update' : 'create',
    at: now,
    by,
    snapshot: person,
  };
  return { person, writes: [...writes.values()], history };
}

/** Scritture per eliminare una persona e i riferimenti a lei. */
function planDelete(cache, id, by) {
  const now = Date.now();
  const target = cache.get(id);
  const writes = [];
  for (const p of cache.values()) {
    if (p.id === id) continue;
    const changes = {};
    if (p.partnerId === id) changes.partnerId = null;
    if ((p.parents || []).includes(id)) changes.parents = p.parents.filter((x) => x !== id);
    if (Object.keys(changes).length) writes.push({ ...p, ...changes, updatedAt: now, updatedBy: by });
  }
  const history = { personId: id, action: 'delete', at: now, by, snapshot: target };
  return { writes, history };
}

// ===================================================================
class DemoStore {
  constructor() {
    this.isDemo = true;
    this.familyId = 'demo';
    this.familyName = 'Demo';
    this.listeners = new Set();
    this.authListeners = new Set();
    this.cache = new Map();
    this.owner = false;
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem('demo-family') || 'null');
      if (raw) return raw;
    } catch { /* ignore */ }
    return null;
  }

  persist() {
    try {
      localStorage.setItem('demo-family', JSON.stringify({
        people: [...this.cache.values()], history: this.hist, owner: this.owner,
      }));
    } catch (e) { console.warn('localStorage pieno?', e); }
  }

  async init() {
    const raw = this.load();
    if (raw) {
      this.cache = new Map(raw.people.map((p) => [p.id, p]));
      this.hist = raw.history || [];
      this.owner = !!raw.owner;
    } else {
      this.reset(false);
    }
    return { status: 'ready' };
  }

  reset(notify = true) {
    this.cache = new Map(demoPeople().map((p) => [p.id, p]));
    this.hist = [];
    this.persist();
    if (notify) this.emit();
  }

  emit() { for (const cb of this.listeners) cb(this.cache); }
  onPeople(cb) { this.listeners.add(cb); cb(this.cache); return () => this.listeners.delete(cb); }

  async savePerson(input, by) {
    const { person, writes, history } = planSave(this.cache, input, by);
    for (const w of writes) this.cache.set(w.id, clean(w));
    this.hist.unshift({ id: randomId(), ...history });
    this.hist = this.hist.slice(0, 300);
    this.persist();
    this.emit();
    return person;
  }

  async deletePerson(id, by) {
    if (!this.owner) throw new Error('not-owner');
    const { writes, history } = planDelete(this.cache, id, by);
    for (const w of writes) this.cache.set(w.id, clean(w));
    this.cache.delete(id);
    this.hist.unshift({ id: randomId(), ...history });
    this.persist();
    this.emit();
  }

  async history(personId) {
    return this.hist.filter((h) => !personId || h.personId === personId).slice(0, 100);
  }

  async restore(entry, by) {
    return this.savePerson({ ...entry.snapshot }, by);
  }

  async importAll(list, by) {
    for (const p of list) this.cache.set(p.id, clean({ ...p, updatedBy: p.updatedBy || by }));
    this.persist();
    this.emit();
  }

  isOwner() { return this.owner; }
  onAuth(cb) { this.authListeners.add(cb); cb(); }
  async signIn() { this.owner = true; this.persist(); for (const cb of this.authListeners) cb(); }
  async signOut() { this.owner = false; this.persist(); for (const cb of this.authListeners) cb(); }
  shareLink() { return location.href.split('#')[0]; }
}

// ===================================================================
class FirebaseStore {
  constructor() {
    this.isDemo = false;
    this.listeners = new Set();
    this.authListeners = new Set();
    this.cache = new Map();
    this.family = null;
    this.user = null;
  }

  async init() {
    const [appMod, fsMod, authMod] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-firestore.js`),
      import(`${FB}/firebase-auth.js`),
    ]);
    this.fs = fsMod;
    this.authMod = authMod;
    const app = appMod.initializeApp(firebaseConfig);
    try {
      this.db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
    } catch {
      this.db = fsMod.getFirestore(app);
    }
    this.auth = authMod.getAuth(app);
    await new Promise((resolve) => {
      let first = true;
      authMod.onAuthStateChanged(this.auth, (u) => {
        this.user = u;
        for (const cb of this.authListeners) cb();
        if (first) { first = false; resolve(); }
      });
    });
    try { await authMod.getRedirectResult(this.auth); } catch { /* ignore */ }

    this.familyId = new URLSearchParams(location.search).get('f');
    if (!this.familyId) return { status: 'needFamily' };

    let snap;
    try {
      snap = await fsMod.getDoc(fsMod.doc(this.db, 'families', this.familyId));
    } catch (e) {
      console.error(e);
      return { status: 'noFamily' };
    }
    if (!snap.exists()) return { status: 'noFamily' };
    this.family = snap.data();
    this.familyName = this.family.name || '';
    try { localStorage.setItem('lastFamily', this.familyId); } catch { /* ignore */ }

    await new Promise((resolve) => {
      let first = true;
      fsMod.onSnapshot(this.peopleCol(), (qs) => {
        this.cache = new Map(qs.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
        for (const cb of this.listeners) cb(this.cache);
        if (first) { first = false; resolve(); }
      }, (err) => { console.error(err); if (first) { first = false; resolve(); } });
    });
    return { status: 'ready' };
  }

  peopleCol() { return this.fs.collection(this.db, 'families', this.familyId, 'people'); }
  historyCol() { return this.fs.collection(this.db, 'families', this.familyId, 'history'); }

  onPeople(cb) { this.listeners.add(cb); cb(this.cache); return () => this.listeners.delete(cb); }

  async commit(writes, deletes, history) {
    const { writeBatch, doc } = this.fs;
    const batch = writeBatch(this.db);
    for (const w of writes) batch.set(doc(this.peopleCol(), w.id), clean(w));
    for (const id of deletes) batch.delete(doc(this.peopleCol(), id));
    batch.set(doc(this.historyCol()), JSON.parse(JSON.stringify(history)));
    // Con la cache offline il batch viene confermato localmente subito;
    // non aspettiamo il server per non bloccare l'interfaccia.
    const p = batch.commit();
    if (navigator.onLine) await p; else p.catch((e) => console.error(e));
  }

  async savePerson(input, by) {
    const { person, writes, history } = planSave(this.cache, input, by);
    await this.commit(writes, [], history);
    return person;
  }

  async deletePerson(id, by) {
    if (!this.isOwner()) throw new Error('not-owner');
    const { writes, history } = planDelete(this.cache, id, by);
    await this.commit(writes, [id], history);
  }

  async history(personId) {
    const { query, where, orderBy, limit, getDocs } = this.fs;
    const q = personId
      ? query(this.historyCol(), where('personId', '==', personId), limit(100))
      : query(this.historyCol(), orderBy('at', 'desc'), limit(100));
    const qs = await getDocs(q);
    return qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.at - a.at);
  }

  async restore(entry, by) {
    return this.savePerson({ ...entry.snapshot }, by);
  }

  async importAll(list, by) {
    const { writeBatch, doc } = this.fs;
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(this.db);
      for (const p of list.slice(i, i + 400)) {
        batch.set(doc(this.peopleCol(), p.id), clean({ ...p, updatedBy: p.updatedBy || by }));
      }
      await batch.commit();
    }
  }

  isOwner() {
    const u = this.auth?.currentUser;
    return !!(u && this.family && this.family.ownerUid === u.uid);
  }
  signedInUser() { return this.auth?.currentUser || null; }
  onAuth(cb) { this.authListeners.add(cb); cb(); }

  async signIn() {
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = this.authMod;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(this.auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(this.auth, provider);
      } else throw e;
    }
  }

  async signOut() { await this.authMod.signOut(this.auth); }

  /** Crea una nuova famiglia: l'utente loggato ne diventa l'organizzatore. */
  async createFamily(name) {
    if (!this.auth.currentUser) await this.signIn();
    const user = this.auth.currentUser;
    if (!user) throw new Error('login');
    const id = randomId(24);
    await this.fs.setDoc(this.fs.doc(this.db, 'families', id), {
      name: name || '', ownerUid: user.uid, createdAt: Date.now(),
    });
    return id;
  }

  shareLink() {
    return `${location.origin}${location.pathname}?f=${this.familyId}`;
  }
}

export function isFirebaseConfigured() {
  return !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function createStore() {
  return isFirebaseConfigured() ? new FirebaseStore() : new DemoStore();
}
