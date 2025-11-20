// src/utils/env.js

const DEFAULT_API_URL = "http://127.0.0.1:8000";

export function getEnvVar(name) {
  try {
    if (typeof import.meta !== "undefined" && import.meta?.env && name in import.meta.env) {
      return import.meta.env[name];
    }
  } catch {}
  try {
    if (typeof process !== "undefined" && process?.env && name in process.env) {
      return process.env[name];
    }
  } catch {}
  try {
    if (typeof window !== "undefined" && window && name in window) {
      return window[name];
    }
  } catch {}
  return undefined;
}

function clean(url) {
  if (!url) return "";
  return String(url).trim().replace(/\/+$/, "");
}

export function resolveBaseURL() {
  const fromLocal  = (typeof localStorage !== "undefined" && localStorage.getItem("API_URL")) || undefined;
  const fromVite   = getEnvVar("VITE_API_URL");
  const fromWindow = (typeof window !== "undefined" && (window.__API_URL__ || window.VITE_API_URL)) || undefined;
  return clean(fromLocal || fromVite || fromWindow || DEFAULT_API_URL);
}

export const DEFAULTS = { DEFAULT_API_URL };
