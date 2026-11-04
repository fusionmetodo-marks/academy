# Military-Grade Platform Security Hardening

Implement a comprehensive security suite ("Hardening Estilo Militar") across the entire platform, establishing strict backend middleware, rate limiting, and impenetrable database security rules.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Security Priority**: Strict backend validation middleware, rate limiting, and database security rules.
> - **Confirmed Access Control**: Server-side role verification with master email whitelist check on every privileged request.

## 1. Overview & Core Concept

- **What It Does**: Hardens all platform entry points, API routes, and database rules against brute-force attacks, unauthorized API tampering, and privilege escalation.
- **Target Audience**: Platform administrators and secure student sessions.
- **Key Value**: Closes all exposed holes, guarantees zero unauthorized backend access, and enforces military-grade access control.

## 2. Technical Architecture & Security Enhancements

```
┌────────────────────────┐      ┌───────────────────────────────┐      ┌────────────────────────┐
│ Client Request         │ ───► │ Rate Limiter & Auth Middleware│ ───► │ Firestore Rules / DB   │
│ (API / Streaming / Pay)│      │ (Master Whitelist & JWT/UID)  │      │ (Encrypted & Guarded)  │
└────────────────────────┘      └───────────────────────────────┘      └────────────────────────┘
```

- **Security Layer 1: Rate Limiting & DDoS Defense (`server.ts`)**:
  - Global sliding-window / token bucket rate limiter for API endpoints (preventing brute-force on auth and payment validation).
- **Security Layer 2: Strict Backend Middleware (`server.ts`)**:
  - Whitelist enforcement for master administrators (`fusionmetodo@gmail.com`, `grupocassaminha@gmail.com`, `exportacoes.extras@gmail.com`).
  - Authorization validation on all video streaming and transaction approval endpoints.
- **Security Layer 3: Database Rule Hardening (`firestore.rules`)**:
  - Prevent unauthorized client updates to `role`, `subscriptionStatus`, `enrolledCourses`, and encrypted vault settings.
