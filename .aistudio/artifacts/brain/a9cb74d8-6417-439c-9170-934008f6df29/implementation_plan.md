# Pending Payment Validation Table Enhancements

Enhance the pending payments validation table in `Dashboard.tsx` with student phone numbers and direct WhatsApp action links in the reference column, a 3-dots action dropdown menu, and robust confirmation popups for approval, rejection, and deletion.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Reference Column**: Displays the student's phone number with a direct WhatsApp chat link button.
> - **Confirmed Actions Menu**: Inline action buttons are consolidated into a clean 3-dots menu (`more_vert`).
> - **Confirmed Safety Popups**: Explicit confirmation modal dialogs protect against accidental approvals, rejections, and deletions.

## 1. Overview & Core Concept

- **What It Does**: Streamlines the pending payment validation workflow by giving administrators immediate WhatsApp contact access and safeguarding actions with confirmation dialogs.
- **Target Audience**: Platform administrators and producers.
- **Key Value**: Enhanced communication speed and strict operational safety.

## 2. Technical Architecture & Data Strategy

- **Student Phone & WhatsApp Integration**:
  - Matches transaction `userId` or `userEmail` with student profile records to retrieve phone numbers.
  - Generates direct `https://wa.me/<phone>` links.
- **Action Dropdown & Modals State**:
  - State variables for active dropdown transaction ID, transaction to approve (`txToApprove`), transaction to reject (`txToReject`), and transaction to delete (`txToDelete`).
