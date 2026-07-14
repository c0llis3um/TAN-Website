/**
 * crypto.js — encrypt/decrypt XRPL escrow seeds at rest.
 *
 * pod_escrows.escrow_seed used to be stored as a plain XRPL seed — anyone with
 * read access to the Supabase project (e.g. a leaked SUPABASE_SERVICE_ROLE_KEY)
 * could sign as any pod's escrow wallet immediately. AES-256-GCM with a key that
 * lives only in Netlify's env (never in Supabase, never client-side) means a
 * leak of either secret alone isn't enough — both are needed to move funds.
 *
 * Not a cloud KMS (AWS KMS / GCP Cloud KMS) — no such infra is provisioned for
 * this project. This is the proportionate step for the current stack; swapping
 * in a real KMS later only means changing getKey() below.
 *
 * Required env var (Netlify dashboard — NO VITE_ prefix):
 *   ESCROW_SEED_ENCRYPTION_KEY   32 random bytes, base64-encoded
 */

import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'

function getKey() {
  const keyB64 = process.env.ESCROW_SEED_ENCRYPTION_KEY
  if (!keyB64) throw new Error('ESCROW_SEED_ENCRYPTION_KEY is not set.')
  const key = Buffer.from(keyB64, 'base64')
  if (key.length !== 32) throw new Error('ESCROW_SEED_ENCRYPTION_KEY must decode to 32 bytes (AES-256).')
  return key
}

/** @param {string} plaintext — raw XRPL seed @returns {string} "v1:<iv>:<authTag>:<ciphertext>" (all base64) */
export function encryptSeed(plaintext) {
  const key       = getKey()
  const iv        = crypto.randomBytes(12)
  const cipher    = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`
}

/** @param {string} stored — value from pod_escrows.escrow_seed @returns {string} raw XRPL seed */
export function decryptSeed(stored) {
  // Rows written before this encryption was added are plain XRPL seeds (always
  // start with "s", never "v1:") — pass them through unchanged. Run the
  // one-time backfill script to re-encrypt them; this fallback just means an
  // interrupted backfill doesn't break anything in the meantime.
  if (!stored?.startsWith('v1:')) return stored

  const [, ivB64, tagB64, ciphertextB64] = stored.split(':')
  const key      = getKey()
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()])
  return plaintext.toString('utf8')
}
