# Fix User Registration Sorting Filters (Newest & Oldest)

Fix the sorting logic in the student and course directory (`StudentDirectory.tsx`) so that "Mais Recentes" and "Mais Antigos" strictly sort by registration time without conflicting alphabetical fallback, while keeping Master Admin pinned at the top.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Sorting Logic**: "Mais Recentes" sorts from latest registered to oldest. "Mais Antigos" sorts from first registered to latest. "Ordem Alfabética" sorts strictly from A to Z.
> - **Confirmed Master Admin Pinning**: Master Administrator accounts remain pinned at the very top.

## 1. Overview & Core Concept

- **What It Does**: Refines `getUserRegistrationTime` and `sortedFilteredUsers` in `StudentDirectory.tsx` to guarantee strict chronological sorting for registration date filters.
- **Target Audience**: Platform administrators and producers.
- **Key Value**: Accurate, intuitive sorting by registration date.

## 2. Technical Architecture & Data Strategy

- **Sorting Comparator Refinement**:
  - `sortOrder === 'newest'`: Strict descending timestamp sort (`timeB - timeA`).
  - `sortOrder === 'oldest'`: Strict ascending timestamp sort (`timeA - timeB`).
  - `sortOrder === 'alphabetical'`: Strict A-Z alphabetical sort.
- **Timestamp Extraction**: Improved fallback handling in `getUserRegistrationTime`.
