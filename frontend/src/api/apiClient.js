// src/api/apiClient.js
import axios from 'axios';
import { resolveBaseURL } from '../utils/env';

function normalize(url) {
  if (!url) return '';
  const u = String(url).trim();
  return u.replace(/\/+$/, '');
}

// Initialize base from resolveBaseURL()
let BASE_URL = normalize(resolveBaseURL());

function makeClient() {
  return axios.create({
    baseURL: BASE_URL || undefined,
    timeout: 30000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

let API = makeClient();

/**
 * Set a new base URL programmatically (returns normalized base).
 * Useful for diagnostics or runtime overrides stored in localStorage.
 */
export function setApiBaseURL(url) {
  BASE_URL = normalize(url || BASE_URL);
  API = makeClient();
  return BASE_URL;
}

/** Recreate internal axios instance using current BASE_URL */
export function refreshBaseURL() {
  API = makeClient();
}

/**
 * Try primary endpoint, optionally fallback on any thrown/network error.
 * Returns the axios response (callers use .data).
 */
async function getWithFallback(primary, fallback) {
  const tryReq = async (path) => {
    const full = (BASE_URL ? BASE_URL : '') + path;
    console.debug('[api] GET ->', full);
    const resp = await API.get(path);
    console.debug('[api] GET response from', full, 'data:', resp?.data);
    return resp;
  };

  try {
    return await tryReq(primary);
  } catch (e) {
    console.warn('[api] GET primary failed:', primary, e?.message ?? e);
    if (fallback) {
      try {
        return await tryReq(fallback);
      } catch (ex) {
        console.error('[api] GET fallback failed:', fallback, ex?.message ?? ex);
        throw ex;
      }
    }
    throw e;
  }
}

/**
 * Try primary endpoint, optionally fallback on any thrown/network error.
 * Returns the axios response (callers use .data).
 */
async function postWithFallback(primary, payload, fallback) {
  const tryReq = async (path) => {
    const full = (BASE_URL ? BASE_URL : '') + path;
    try {
      console.debug('[api] POST ->', full, 'payload:', payload, 'BASE_URL:', BASE_URL);
      const resp = await API.post(path, payload);
      console.debug('[api] POST response from', full, 'data:', resp?.data);
      return resp;
    } catch (err) {
      console.warn('[api] POST error from', full, err?.message ?? err);
      throw err;
    }
  };

  try {
    return await tryReq(primary);
  } catch (e) {
    console.warn('[api] POST primary failed:', primary, e?.message ?? e);
    if (fallback) {
      try {
        return await tryReq(fallback);
      } catch (ex) {
        console.error('[api] POST fallback failed:', fallback, ex?.message ?? ex);
        throw ex;
      }
    }
    throw e;
  }
}

export const api = {
  // allow externals to refresh the axios instance
  refreshBaseURL,

  // Sample / config
  getSample() {
    // backend provides /config/sample; fallback kept for older deployments
    return getWithFallback('/config/sample', '/sample');
  },

  // Save a submitted config; backend accepts /config/submit and /config/
  sendConfig(data) {
    return postWithFallback('/config/submit', data, '/config/');
  },

  // Simulation endpoints
  simulateBaseline(data) {
    return postWithFallback('/simulate/baseline', data);
  },

  simulateMemoryAware(data) {
    return postWithFallback('/simulate/memory-aware', data);
  },

  // Compare schedulers. Backend route is /compare/ (POST)
  compareSchedulers(data) {
    return postWithFallback('/compare/', data, '/simulate/compare');
  },

  // Optional runs endpoints (handy for future features)
  listRuns() {
    return getWithFallback('/runs/', '/runs');
  },

  saveRun(data) {
    return postWithFallback('/runs/', data, '/runs');
  },
};
