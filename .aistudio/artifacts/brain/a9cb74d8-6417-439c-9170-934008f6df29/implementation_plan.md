# Implementation Plan: Student Playback Fix & Admin Route Security Obfuscation

## User Intent & Requirements
1. **Student Playback Authorization Fix**:
   - Resolve the issue where actively enrolled students click "Play", but video authorization fails with a server message stating they have no active enrollment.
   - Verify Firebase Auth ID token on the server (`/api/lessons/verify-access`) and match enrolled courses across both UID and email records in Firestore.

2. **Admin Panel Security & Obfuscation**:
   - Hide and obfuscate administrative route paths to prevent exposure of sensitive management endpoints.
   - Completely remove admin navigation triggers from student-facing interfaces.
   - Enforce cryptographically verified Firebase ID Tokens (`verifyAdminAuth`) for all administrative backend API routes.

---

## User Review Required
> [!IMPORTANT]
> The admin routes (`/dashboard`, `/directory`, `/content`, `/analytics`, `/broadcast`, `/messages`, `/settings`) will be guarded by role-based obfuscation and strict 404 fallbacks for non-admins. Admin API endpoints in `server.ts` will strictly require a valid Firebase ID Token signed by Google.

---

## Proposed Changes

### Backend Security & Verification (`server.ts`)
- **Dual-Lookup Enrollment Verification (`/api/lessons/verify-access`)**:
  - Extract and verify `idToken` via `verifyFirebaseIdToken`.
  - Fetch Firestore user document by `uid` and query by `email`.
  - Combine `enrolledCourses` arrays from both sources and apply backward-compatibility course mapping (`marks-trading-master` / `curso-cfa` -> `c_1793470582310`).
  - Grant access if the target course ID exists in the merged enrollment list or if the user is a verified Admin/Master.

- **Strict Admin Authentication Enforcement (`verifyAdminAuth`)**:
  - Require a valid `Authorization: Bearer <idToken>` for all administrative endpoints (`/api/crypto/*`, `/api/push/send`, etc.).
  - Verify that the decoded token email is a master admin email (`fusionmetodo@gmail.com`, `grupocassaminha@gmail.com`, `exportacoes.extras@gmail.com`) or has role `admin`/`producer` in Firestore.

---

### Client Video Player & Services (`src/components/SecureVideoPlayer.tsx` & `src/services/enrollmentService.ts`)
- **ID Token Passing in `SecureVideoPlayer.tsx`**:
  - Retrieve fresh `getIdToken()` before calling `/api/lessons/verify-access`.
  - Pass `Authorization: Bearer <token>` in the fetch header.
  - Gracefully authorize playback when the server returns `allowed: true`.

- **Enhanced Enrollment Sync (`src/services/enrollmentService.ts`)**:
  - Ensure real-time enrollment subscription merges UID document data with email fallback records.

---

### Admin Route Obfuscation & UI Security (`src/App.tsx`, `src/pages/VideoLibrary.tsx`, `src/pages/StudentPortal.tsx`)
- **Route Protection & Obfuscation (`src/App.tsx`)**:
  - Guard administrative routes so non-admin users attempting direct navigation receive a standard NotFound / 404 view rather than revealing admin presence.
  - Obfuscate administrative navigation paths.

- **UI Cleanliness**:
  - Ensure zero administrative controls or links are visible in student views.

---

## Verification Plan

### Automated Build & Lint Verification
1. Run `compile_applet` and `lint_applet` together to ensure standard TypeScript types and syntax validity.
2. Restart dev server using `restart_dev_server`.

### Backend API Verification
1. Test `/api/lessons/verify-access` with an enrolled student ID Token for course `c_1793470582310` -> Expect `allowed: true`.
2. Test `/api/lessons/verify-access` with an un-enrolled course -> Expect `403 Forbidden`.
3. Test Admin endpoints without a valid ID Token -> Expect `403 Forbidden`.
