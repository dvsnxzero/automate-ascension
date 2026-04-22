/**
 * WebAuthn passkey helpers — handles browser credential API calls
 * and communicates with the backend passkey endpoints.
 */

import api from "./api";

// ─── Session ───

export async function checkSession() {
  const res = await api.get("/auth/passkey/session");
  return res.data;
}

export async function checkSetup() {
  const res = await api.get("/auth/passkey/setup-status");
  return res.data;
}

export async function logout() {
  await api.post("/auth/passkey/logout");
}

// ─── Registration (first-time setup) ───

export async function startRegistration() {
  // 1. Get challenge from server
  const res = await api.post("/auth/passkey/register/begin");
  const { options: optionsJSON, challenge_key } = res.data;
  const options = JSON.parse(optionsJSON);

  // 2. Decode base64url fields for the browser API
  options.challenge = base64urlToBuffer(options.challenge);
  options.user.id = base64urlToBuffer(options.user.id);
  if (options.excludeCredentials) {
    options.excludeCredentials = options.excludeCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }

  // 3. Create credential via browser
  const credential = await navigator.credentials.create({ publicKey: options });

  // 4. Serialize for the server (include transports for cross-device hints)
  const credentialJSON = JSON.stringify({
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      transports: credential.response.getTransports?.() || [],
    },
  });

  // Detect device name
  const deviceName = detectDeviceName();

  // 5. Complete registration
  const completeRes = await api.post("/auth/passkey/register/complete", {
    challenge_key,
    credential: credentialJSON,
    device_name: deviceName,
  });

  return completeRes.data;
}

// ─── Authentication ───

export async function startAuthentication() {
  // 1. Get challenge
  const res = await api.post("/auth/passkey/auth/begin");
  const { options: optionsJSON, challenge_key } = res.data;
  const options = JSON.parse(optionsJSON);

  // 2. Decode
  options.challenge = base64urlToBuffer(options.challenge);
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }

  // 3. Get credential via browser (triggers Face ID / Touch ID / security key)
  let credential;
  try {
    credential = await navigator.credentials.get({ publicKey: options });
  } catch (err) {
    // User cancelled, no matching credential, or timeout
    if (err.name === "NotAllowedError") {
      throw new Error("Authentication was cancelled or timed out. Try again, or use a backup code.");
    }
    if (err.name === "InvalidStateError") {
      throw new Error("No matching passkey found on this device. Use a backup code to sign in, then register this device.");
    }
    throw err;
  }

  // 4. Serialize
  const credentialJSON = JSON.stringify({
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(credential.response.authenticatorData),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      signature: bufferToBase64url(credential.response.signature),
      userHandle: credential.response.userHandle
        ? bufferToBase64url(credential.response.userHandle)
        : null,
    },
  });

  // 5. Complete auth
  const completeRes = await api.post("/auth/passkey/auth/complete", {
    challenge_key,
    credential: credentialJSON,
  });

  return completeRes.data;
}

// ─── Backup code auth ───

export async function authWithBackupCode(code) {
  const res = await api.post("/auth/passkey/auth/backup", { code });
  return res.data;
}

// ─── Helpers ───

function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function detectDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Unknown Device";
}
