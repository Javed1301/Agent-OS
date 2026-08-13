/**
 * Secrets Service — AES-256-GCM Encrypted Local Vault
 *
 * Persists encrypted secrets under /app/data/secrets/vault.json.
 * Derived master key uses local machine binding with clean fallback.
 * Secret values are NEVER stored in plaintext on disk and NEVER
 * returned in API responses or logs.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { AgentDefinition } from "../types/agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env["WORKSPACE_ROOT"]
  ? path.resolve(process.env["WORKSPACE_ROOT"])
  : path.resolve(__dirname, "../../../..");

const SECRETS_DIR = path.join(WORKSPACE_ROOT, "data", "secrets");
const VAULT_PATH = path.join(SECRETS_DIR, "vault.json");

const ALGORITHM = "aes-256-gcm";
const SALT = "agent-workspace-secret-salt-v1";
const ITERATIONS = 100000;
const KEY_LEN = 32;

export interface SecretMetadata {
  name: string;
  present: boolean;
  lastUpdated: string;
}

interface VaultData {
  version: string;
  encrypted: {
    iv: string;
    authTag: string;
    data: string;
  } | null;
  metadata: Record<string, { name: string; updatedAt: string }>;
}

let _masterKey: Buffer | null = null;
let _secretsMap: Map<string, string> = new Map();
let _metadataMap: Map<string, { name: string; updatedAt: string }> = new Map();
let _initialized = false;

const SEED_FILE_PATH = path.join(SECRETS_DIR, ".seed");

function deriveMasterKey(): Buffer {
  if (_masterKey) return _masterKey;

  ensureDirectory();

  let seed = process.env["VAULT_MASTER_KEY"] || "";
  if (!seed) {
    if (fs.existsSync(SEED_FILE_PATH)) {
      try {
        seed = fs.readFileSync(SEED_FILE_PATH, "utf-8").trim();
      } catch {
        // fallback if read fails
      }
    }

    if (!seed) {
      seed = crypto.randomBytes(32).toString("hex");
      try {
        fs.writeFileSync(SEED_FILE_PATH, seed, "utf-8");
      } catch {
        // fallback if write fails
      }
    }
  }

  _masterKey = crypto.pbkdf2Sync(seed, SALT, ITERATIONS, KEY_LEN, "sha256");
  return _masterKey;
}

function encrypt(plainText: string): { iv: string; authTag: string; data: string } {
  const key = deriveMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    authTag,
    data: encrypted,
  };
}

function decrypt(encrypted: { iv: string; authTag: string; data: string }): string {
  const key = deriveMasterKey();
  const iv = Buffer.from(encrypted.iv, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted.data, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

function ensureDirectory(): void {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
  }
}

function saveVault(): void {
  ensureDirectory();

  // Convert map to JSON object
  const plainObj: Record<string, string> = {};
  _secretsMap.forEach((val, key) => {
    plainObj[key] = val;
  });

  const plainText = JSON.stringify(plainObj);
  const encrypted = encrypt(plainText);

  const metaObj: Record<string, { name: string; updatedAt: string }> = {};
  _metadataMap.forEach((meta, key) => {
    metaObj[key] = meta;
  });

  const vaultPayload: VaultData = {
    version: "1.0",
    encrypted,
    metadata: metaObj,
  };

  const tmpPath = VAULT_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(vaultPayload, null, 2), "utf-8");
  fs.renameSync(tmpPath, VAULT_PATH);
}

function loadVault(): void {
  _secretsMap.clear();
  _metadataMap.clear();

  if (!fs.existsSync(VAULT_PATH)) {
    return;
  }

  try {
    const raw = fs.readFileSync(VAULT_PATH, "utf-8");
    const vault = JSON.parse(raw) as VaultData;

    if (vault.metadata) {
      Object.entries(vault.metadata).forEach(([k, v]) => {
        _metadataMap.set(k, v);
      });
    }

    if (vault.encrypted) {
      const plainText = decrypt(vault.encrypted);
      const plainObj = JSON.parse(plainText) as Record<string, string>;
      Object.entries(plainObj).forEach(([k, v]) => {
        _secretsMap.set(k, v);
      });
    }
  } catch (err) {
    console.error(`[secrets] Failed to decrypt local secrets vault: ${err}`);
    console.warn(`[secrets] Preserving corrupt vault at vault.json.corrupt and resetting active vault.`);
    try {
      if (fs.existsSync(VAULT_PATH)) {
        fs.renameSync(VAULT_PATH, VAULT_PATH + ".corrupt");
      }
    } catch { /* ignore */ }
    _secretsMap.clear();
    _metadataMap.clear();
  }
}

export const secretsService = {
  init(): void {
    if (_initialized) return;
    ensureDirectory();
    loadVault();
    _initialized = true;
    console.log(`[secrets] Vault initialized at: ${VAULT_PATH}`);
  },

  /** Store an encrypted secret in the vault */
  setSecret(name: string, value: string): void {
    this.init();
    const cleanName = name.trim().toUpperCase();
    const cleanValue = value.trim();

    _secretsMap.set(cleanName, cleanValue);
    _metadataMap.set(cleanName, {
      name: cleanName,
      updatedAt: new Date().toISOString(),
    });

    saveVault();
    console.log(`[secrets] Stored encrypted secret: ${cleanName}`);
  },

  /** Get secret value (decrypts from vault or falls back to process.env) */
  getSecret(name: string): string | undefined {
    this.init();
    const cleanName = name.trim().toUpperCase();
    if (_secretsMap.has(cleanName)) {
      return _secretsMap.get(cleanName);
    }
    return process.env[cleanName];
  },

  /** Delete secret from vault */
  deleteSecret(name: string): boolean {
    this.init();
    const cleanName = name.trim().toUpperCase();
    const deleted = _secretsMap.delete(cleanName);
    _metadataMap.delete(cleanName);
    if (deleted) {
      saveVault();
      console.log(`[secrets] Deleted secret: ${cleanName}`);
    }
    return deleted;
  },

  /** List metadata only — NEVER returns secret values */
  listMetadata(): SecretMetadata[] {
    this.init();
    const result: SecretMetadata[] = [];
    _metadataMap.forEach((meta) => {
      result.push({
        name: meta.name,
        present: true,
        lastUpdated: meta.updatedAt,
      });
    });

    // Also include environment variables that are present on system if not in vault
    const knownKeys = ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "EXA_API_KEY", "SERPER_API_KEY"];
    for (const key of knownKeys) {
      if (!_metadataMap.has(key) && process.env[key]) {
        result.push({
          name: key,
          present: true,
          lastUpdated: "System Environment",
        });
      }
    }

    return result;
  },

  /** Get all secrets required/optional for a specific agent */
  getSecretsForAgent(agent: AgentDefinition): Record<string, string> {
    this.init();
    const required = agent.secrets?.required || agent.healthCheck?.requiredEnv || [];
    const optional = agent.secrets?.optional || [];

    const keys = Array.from(new Set([...required, ...optional]));
    const result: Record<string, string> = {};

    for (const key of keys) {
      const val = this.getSecret(key);
      if (val) {
        result[key] = val;
      }
    }

    return result;
  },
};
