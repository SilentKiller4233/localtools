// LocalTools desktop bridge bootstrap — injected by the Tauri shell via
// the `app > security > initScript`... (see lib.rs: injected through the
// WebviewWindowBuilder initialization script on every page load).
//
// It defines window.__LOCALTOOLS__ { invoke } backed by Tauri's IPC
// internals object (__TAURI_INTERNALS__ — the same contract the official
// @tauri-apps/api uses), so the client bundle needs no @tauri-apps/api
// import and stays fully browser-buildable (desktop-bridge.ts documents
// the surface).
//
// Deliberately invoke-only: no event plumbing (the client polls
// desktop_status for engine readiness; downloads resolve when done and
// the UI shows an indeterminate bar meanwhile — same pattern as the
// engine tool pages).
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__LOCALTOOLS__ !== undefined) return;

  var internals = window.__TAURI_INTERNALS__;
  if (internals === undefined || typeof internals.invoke !== 'function') {
    // Not the Tauri shell (or an old runtime) — leave the bridge absent;
    // the client degrades to plain-browser behavior.
    return;
  }

  function invoke(cmd, args) {
    return internals.invoke(cmd, args);
  }

  window.__LOCALTOOLS__ = { invoke: invoke };

  // The engine port is a compile-time constant shared with sidecar.rs
  // (ENGINE_PORT) — injected synchronously so engine-client.ts can build
  // the engine URL without an async round-trip before first request.
  try {
    Object.defineProperty(window, '__LOCALTOOLS_ENGINE_PORT__', {
      value: 8787,
      writable: false,
      configurable: false,
    });
  } catch (e) {
    /* non-configurable defineProperty on some engines — the client falls
       back to the DEV default, which is the same port. */
  }
})();
