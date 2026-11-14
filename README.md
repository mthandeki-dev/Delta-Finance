
<div align="center">

# ⚡ Delta Finance

**Supplier payments on autopilot, with limits your CFO controls.**

*Autonomous AI treasury execution in RLUSD on the XRP Ledger—backed by deterministic policy routing, hardware-isolated Privy signing policies, and Xaman human-in-the-loop governance.*

[![Built for Node Engine Hackathon 2026](https://img.shields.io/badge/Node_Engine_Hackathon_2026-Agentic_Finance_(Ripple)-008CFF?style=for-the-badge&logo=xrp&logoColor=white)](#)
[![Network: XRPL Testnet](https://img.shields.io/badge/Network-XRPL_Testnet-23292F?style=for-the-badge)](#)
[![Settlement: RLUSD](https://img.shields.io/badge/Settlement-RLUSD-00A86B?style=for-the-badge)](#)
[![Protocol: x402 v2](https://img.shields.io/badge/Protocol-x402_v2_(t54)-6E56CF?style=for-the-badge)](#)

</div>

# DELTA FINANCE VISUAL : 

https://github.com/user-attachments/assets/0852ef07-6d0d-4959-a418-9a84b9a9535f

---

## 📖 Executive Summary

**Delta Finance** solves the core trust gap in agentic finance: *How do you let an AI agent execute cross-border supplier payments autonomously without giving it unrestricted access to company funds?*

An AI agent pays approved suppliers in **RLUSD** on the **XRP Ledger**. Routine payments execute autonomously in seconds; large payments and all payroll automatically pause for a cryptographic human signature; anything outside the CFO's mandate is refused by external infrastructure the agent cannot reach or override.

> **Built for:** Node Engine Hackathon 2026 — Agentic Finance Track (Ripple) | **Environment:** XRPL Testnet

---

## 🌍 The Problem & Market Fit

A small importer in Johannesburg or Cape Town paying suppliers in Lagos, Nairobi, or Accra waits days for a SWIFT transfer and loses margin on FX spreads and intermediary fees. While **RLUSD on the XRP Ledger** settles in seconds, no CFO or finance lead will hand a corporate wallet to an AI agent until four foundational governance questions are answered:

| What the CFO Asks | How Delta Finance Answers |
| :--- | :--- |
| **1. What is the agent allowed to do?** | Enforces a **daily budget** and a **per-payment cap** in RLUSD, configured directly in the Admin Dashboard. |
| **2. Who can it pay?** | **Strictly whitelisted vendor addresses.** Not even an administrator can approve a payment to an unapproved address. |
| **3. How do I stop it?** | A single **"Stop the agent" kill switch** that immediately halts app routing *and* rewrites the external Privy wallet policy so the wallet refuses to sign. |
| **4. How do I prove what it did and why?** | An **append-only audit trail** logging every instruction, decision, reason, enforcing layer, and on-ledger transaction hash—with one-click CSV export. |

### Go-To-Market & Beachhead Strategy
* **Initial Customer (ICP):** Cross-border SMEs with repeat supplier payments seeking payables autopilot.
* **Why They Switch:** Same-day RLUSD settlement and zero prefunded foreign currency accounts—without sacrificing the dual-control approval workflows they rely on in traditional banking portals.
* **Distribution Wedge:** Accountants and bookkeeping firms managing accounts payable across dozens of SME clients simultaneously.

---

## 🏗️ System Architecture & The Three Paths

Delta Finance separates **natural language parsing** from **deterministic execution**. The LLM has zero tool access, holds no private keys, and never touches the database.

```mermaid
flowchart TD
    A[Operator / API Instruction] --> B[LLM / Deterministic Parser]
    B --> C[Strict JSON Schema + Grounding Check]
    C --> D{Deterministic Policy Router\nPostgres Mandate}

    D -->|Path A: Autonomous\nUnder cap & budget, not payroll| E[x402 Settlement Gateway\nHTTP 402 Handshake]
    E --> F[Privy Remote Signer\nEnforces Wallet Policy]
    F --> G[t54 Facilitator\n/verify & /settle]
    G --> H[(XRPL Testnet\nConfirmed RLUSD Settlement)]

    D -->|Path B: Human-in-the-Loop\nOver limit OR Payroll| I[Approval Queue\nSingle-Use Secret Code]
    I --> J[CFO Xaman Mobile Signature]
    J --> H

    D -->|Path C: Blocked\nNot whitelisted, paused, invalid| K[Hard Refusal\nLogged with Enforcing Layer]
