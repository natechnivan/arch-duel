# Arch Duel ⚔️

Arch Duel is a daily system design classification game powered by AI.

The app generates a system design answer and your goal is to:
1. Classify the answer quality (Legit / Incomplete / Flawed / Buzzword BS)
2. Identify the **missing / most impacted system design bucket**
3. Submit your guess and get an AI-evaluated verdict + learning takeaway

Built as a fun, interview-prep style project for engineers preparing for Staff/Principal system design rounds.

---

## 🚀 Live Demo
(Deploy link will be added after Vercel deployment)

---

## ✨ Features (v1)

- AI-generated system design answers using Gemini
- Answer classification game:
  - Legit ✅
  - Incomplete ⚠️
  - Flawed ❌
  - Buzzword BS 💀
- Bucket-based reasoning:
  - api, scaling, caching, observability, security, etc.
- Daily challenge stored in LocalStorage
- Retry logic for overloaded Gemini (503/429 handling)
- Score tracking
- Clean responsive UI (Next.js + Tailwind)

---

## 🛠 Tech Stack

- **Next.js (App Router)**
- **TypeScript**
- **TailwindCSS**
- **Gemini API** (`@google/generative-ai`)
- **Zod** (schema validation)

---

## 📦 Setup (Local)

### 1. Clone the repo
```bash
git clone https://github.com/<your-username>/arch-duel.git
cd arch-duel
