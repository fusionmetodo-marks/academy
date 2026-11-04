# Secure Encryption Architecture for Payment Settings & Wistia Secrets

Implement robust end-to-end AES-256-GCM encryption for sensitive platform data (payment configurations, Wistia tokens, API credentials, and secrets) stored in Firestore, backed by a secure server-side master key and decryption proxy.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Encryption Standard**: AES-256-GCM with authenticated encryption (integrity + confidentiality).
> - **Confirmed Key Storage**: Server-side master key in environment variables (`ENCRYPTION_MASTER_KEY`), ensuring secrets are never exposed in plaintext in client code or database documents.
> - **Confirmed Storage Architecture**: Encrypted payloads (`ciphertext`, `iv`, `authTag`) stored in Firestore documents, decrypted via secure backend proxy endpoints (`/api/settings/decrypt`).

## 1. Overview & Core Concept

- **What It Does**: Encrypts sensitive configuration data (payment gateway credentials, Wistia integration tokens, and private API secrets) at rest in Firestore using enterprise-grade AES-256-GCM encryption.
- **Target Audience / Platform Owners**: Administrators and producers managing platform settings and video streaming keys.
- **Key Value**: Guarantees that even if database access is compromised, all sensitive payment and video credentials remain cryptographically secure and unreadable.

## 2. User Experience & Visual Design

- **Admin Settings & Security Management**:
  - Encrypted fields displayed with masking (e.g., `••••••••••••••••`) and a secure lock badge.
  - Action buttons to test configuration, update encrypted tokens, and verify security status.
- **Visual Theme**: Dark futuristic dashboard aesthetic matching the Money Building design system (`#121212` background, `#e9c349` gold accents, outline-variant borders).

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Server-Side Master Key vs Client-Side Password.
  - *Chosen Approach*: Server-side environment secret (`ENCRYPTION_MASTER_KEY`).
  - *Why*: Allows headless background tasks (billing reminders, server-side proxies, webhook processing) to decrypt and validate payments securely without requiring manual user passwords.
- **Decision 2**: AES-256-GCM vs Simple Base64/Obfuscation.
  - *Chosen Approach*: Node.js `crypto` module AES-256-GCM with Initialization Vector (IV) and Authentication Tag.
  - *Why*: Provides military-grade cryptographic security and tamper detection.

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────┐      ┌─────────────────────────      ┌──────────────────────┐
│ Admin / Frontend UI    │ ───► │ Express Server (server.ts) │ ───► │ Firestore Database   │
│ (Masked Secret Inputs) │      │ (AES-256-GCM Encrypt/Decrypt) │      │ (Encrypted Payload)  │
└────────────────────────┘      └───────────────────────────────      └──────────────────────┘
```

- **Data Model**:
  - `settings/paymentConfig`: Stores `{ ciphertext, iv, authTag, updatedAt }`.
  - `settings/wistiaConfig`: Stores `{ ciphertext, iv, authTag, updatedAt }`.
- **API Endpoints**:
  - `POST /api/encrypt`: Encrypts sensitive plaintext payload using `ENCRYPTION_MASTER_KEY`.
  - `POST /api/decrypt`: Decrypts stored ciphertext payload for authorized administrative operations.
