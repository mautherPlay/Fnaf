'use strict';

/**
 * Lightweight publish/subscribe event bus.
 * Lets modules communicate without direct references.
 */
const EventBus = (() => {
  const _listeners = {};

  return {
    /** Subscribe to an event */
    on(event, fn) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(fn);
    },

    /** Unsubscribe a specific handler */
    off(event, fn) {
      if (_listeners[event])
        _listeners[event] = _listeners[event].filter(f => f !== fn);
    },

    /** Subscribe once, auto-removed after first call */
    once(event, fn) {
      const wrapper = (data) => { fn(data); this.off(event, wrapper); };
      this.on(event, wrapper);
    },

    /** Dispatch event to all subscribers */
    emit(event, data) {
      (_listeners[event] || []).forEach(fn => {
        try { fn(data); }
        catch (e) { console.error(`EventBus error in "${event}":`, e); }
      });
    },

    /** Remove all listeners (useful for game reset) */
    clear() {
      Object.keys(_listeners).forEach(k => delete _listeners[k]);
    },
  };
})();