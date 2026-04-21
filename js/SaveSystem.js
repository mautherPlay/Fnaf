'use strict';

/**
 * SaveSystem
 * ─────────────────────────────────────────────────────────────
 * Currently stores progress in localStorage.
 * Firebase integration points are clearly marked with TODO comments.
 *
 * Data shape:
 *   { completedNights: [1, 2], highestNight: 2, lastPlayed: <ISO string> }
 */
class SaveSystem {
  constructor() {
    this.STORAGE_KEY = 'fnaf1_progress';

    // TODO Firebase: replace localStorage calls with Firestore reads/writes
    // import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
    // this.db = getFirestore(firebaseApp);
    // this.userId = null;  // set after auth
  }

  // ── Load ────────────────────────────────────────────────────
  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return this._default();
      const data = JSON.parse(raw);
      return { ...this._default(), ...data };
    } catch (e) {
      console.warn('SaveSystem: could not load progress', e);
      return this._default();
    }
  }

  // ── Save ────────────────────────────────────────────────────
  save(data) {
    try {
      const merged = { ...this.load(), ...data, lastPlayed: new Date().toISOString() };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));

      // TODO Firebase: uncomment below after adding Firebase SDK
      // if (this.userId) {
      //   const ref = doc(this.db, 'users', this.userId);
      //   setDoc(ref, merged, { merge: true });
      // }
    } catch (e) {
      console.warn('SaveSystem: could not save progress', e);
    }
  }

  // ── Night completion ─────────────────────────────────────────
  completeNight(night) {
    const data = this.load();
    if (!data.completedNights.includes(night)) {
      data.completedNights.push(night);
    }
    data.highestNight = Math.max(data.highestNight, night);
    this.save(data);
    EventBus.emit('nightSaved', { night });
  }

  // ── Check unlock ─────────────────────────────────────────────
  isNightUnlocked(night) {
    if (night === 1) return true;
    const data = this.load();
    return data.completedNights.includes(night - 1);
  }

  getHighestNight() {
    return this.load().highestNight;
  }

  // ── Auth placeholder (Firebase-ready) ────────────────────────
  // TODO Firebase: call this after user signs in
  // setUser(userId) { this.userId = userId; }

  // ── Reset (dev / debug) ──────────────────────────────────────
  clearAll() {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  // ── Private ──────────────────────────────────────────────────
  _default() {
    return { completedNights: [], highestNight: 0, lastPlayed: null };
  }
}