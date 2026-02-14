# Arch Duel ⚔️

A daily system design classification game powered by Google's Gemini AI. Prepare for system design interviews by classifying AI-generated design answers and identifying critical missing components.

**🔗 Live Demo:** https://arch-duel.vercel.app/

---

## 🎮 How to Play

1. **Click "Start"** → AI generates a system design answer
2. **Classify** → Choose the answer quality:
   - ✅ **Legit** - Complete and correct design
   - ⚠️ **Incomplete** - Missing critical components
   - ❌ **Flawed** - Incorrect or problematic approach
   - 💀 **Buzzword BS** - Vague and unhelpful

3. **Pick a Bucket** → Select the most impacted system design area:
   - API Design, Data Model, Scaling, Caching, Queue/Stream
   - Consistency, Partitioning, Observability, Security, Other

4. **Submit** → Get AI-evaluated feedback with:
   - Correctness verdict
   - Why your answer was right/wrong
   - What to fix going forward
   - Learning takeaway

5. **Track Score** → Earn points for correct classifications

---

## ✨ Features

### Core Features
- 🤖 **AI-Generated Challenges** using Google's Gemini API
- 🎯 **Classification Game** with 4 quality levels
- 🪣 **10 System Design Buckets** covering critical areas
- 📅 **Daily Challenge** cached for 60 seconds (stale-while-revalidate for 5min)
- 💾 **Score Persistence** across sessions using localStorage
- 🌙 **Dark Mode Support** with system preference detection
- 📱 **Fully Responsive** Mobile-first design

### Technical Features
- ⚡ **Optimized Loading** with shimmer skeleton effects (100ms min)
- 🔄 **Resilient Retry Logic** for API failures (3 attempts with exponential backoff)
- ✅ **Type Safety** with TypeScript & Zod validation
- 🚀 **Fast Builds** using Next.js Turbopack
- 💰 **CDN-Optimized** with smart caching headers for daily challenge
- 📊 **Require Submit** before next round to prevent skipping

---

## 🏗️ Architecture

### Project Structure
```
arch-duel/
├── app/
│   ├── layout.tsx           # Root layout with theme system
│   ├── page.tsx             # Main game component
│   ├── globals.css          # Global styles + shimmer animation
│   ├── api/
│   │   ├── generate/        # POST /api/generate - Creates new rounds
│   │   ├── evaluate/        # POST /api/evaluate - Evaluates answers
│   │   └── _lib/
│   │       └── geminiModels.ts  # Shared AI utilities
│   └── components/
│       ├── Spinner.tsx      # Loading indicator
│       ├── SpinnerDark.tsx  # Dark mode spinner
│       └── Skeleton.tsx     # Shimmer loader UI
├── public/                  # Static assets
├── Configuration Files
│   ├── tsconfig.json        # TypeScript config
│   ├── next.config.js       # Next.js config
│   ├── tailwind.config.js   # Tailwind CSS
│   ├── postcss.config.js    # PostCSS pipeline
│   ├── .eslintrc.json       # ESLint rules
│   └── .prettierrc           # Prettier formatting
└── package.json             # Dependencies
```

### State Management
- React Hooks (useState, useEffect, useMemo)
- localStorage for persistence (score, theme, daily cache)
- Client-side state for game flow

### API Endpoints

**POST `/api/generate?daily=true`**
- Generates a new system design challenge
- Returns: `{ roundId, prompt, topic, difficulty, design_text, __answerKey }`
- Daily parameter adds caching headers (60s cache + 5min stale-while-revalidate)

**POST `/api/evaluate`**
- Evaluates player's answer against AI's expectation
- Input: design_text, player choices, expected answer
- Returns: `{ correct, score_delta, verdict, why, what_to_fix, learning_takeaway }`

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), React 18, TypeScript |
| **Styling** | Tailwind CSS (default theme) |
| **AI** | Google Gemini API via `@google/generative-ai` |
| **Validation** | Zod (runtime schema validation) |
| **Build** | Turbopack (Next.js 16 bundler) |
| **Deployment** | Vercel |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/arch-duel.git
cd arch-duel

# 2. Install dependencies
npm install

# 3. Create .env.local file
echo "GEMINI_API_KEY=your_api_key_here" > .env.local

# 4. Run dev server
npm run dev

# 5. Open browser
# Navigate to http://localhost:3000
```

### Available Commands

```bash
npm run dev          # Start development server (hot reload)
npm run build        # Create optimized production build
npm start            # Start production server
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript type checker
```

---

## 🎯 Game Topics

The AI generates challenges for these system design topics:
- URL Shortener
- Rate Limiter
- Notification System
- Feed/Social Timeline
- Chat/Messaging
- File Upload Service
- Analytics Pipeline

---

## 📊 Scoring System

- ✅ **Correct classification + correct bucket**: +3 points
- ⚠️ **Correct classification, wrong bucket**: +1 point
- ❌ **Wrong classification**: -1 point

---

## 🔧 Performance Optimizations

### Frontend
- **Shimmer Loading**: 100ms minimum (provides visual feedback without artificial delay)
- **Dark Mode**: Uses system preference, saves to localStorage
- **Score Caching**: Persisted in localStorage for instant load
- **Responsive Grid**: 2-col on mobile, flexible on desktop

### Backend
- **Gemini Retry Logic**: Automatic 3-attempt retry with exponential backoff (600ms, 1200ms)
- **Request Timeout**: Handles 503/429 overload responses gracefully
- **Daily Cache**: 60s CDN cache + 5min stale-while-revalidate for Daily Challenge
- **Response Validation**: Zod ensures data integrity before returning

### Code Quality
- **Refactored Utilities**: Extracted `fetchWithRetry()`, `resetRound()`, `ensureMinLoadTime()`
- **Constants**: Centralized configuration (MAX_RETRY_ATTEMPTS, RETRY_DELAY_MS, etc.)
- **No Duplication**: Single source of truth for retry patterns, state resets

---

## 🌙 Dark Mode

- Automatic detection of system preference
- Toggle in header: System / Light / Dark
- Smooth transitions with Tailwind dark mode
- Persists user's choice to localStorage

---

## 📝 Configuration

Key constants in `app/page.tsx`:
```typescript
const MAX_RETRY_ATTEMPTS = 3;           // Retry count for API failures
const RETRY_DELAY_MS = 600;             // Exponential backoff base (600ms, 1200ms...)
const MIN_SHIMMER_MS = 100;             // Minimum loading animation duration
const REQUIRE_SUBMIT_BEFORE_NEXT = true; // Force answer submission before next round
```

---

## 🐛 Known Limitations (v1)

- Answer key visible in browser console (MVP - for demo purposes)
- No authentication (stateless per-session scoring)
- Limited to Gemini API availability
- Single-user local storage (no cloud sync)

**Future improvements:**
- Server-side answer validation
- User accounts & leaderboard
- Answer history & stats
- Difficulty selection
- Custom topic filters

---

## 📄 License

MIT - See LICENSE file for details

---

## 👨‍💻 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 🙋 Support

- **Issues?** Open a GitHub issue with details
- **Questions?** Check the FAQ below

### FAQ

**Q: Where does the AI content come from?**
A: All questions and evaluations are generated by Google's Gemini API based on system design prompts.

**Q: Is my score saved?**
A: Yes! Scores are stored in your browser's localStorage. Clearing browser data will reset them.

**Q: Can I use this for interview prep?**
A: Absolutely! This is specifically designed for system design interview practice.

**Q: Why is the Gemini API key exposed in localStorage?**
A: The key is in environment variables (.env.local), not exposed. The frontend calls the `/api/generate` and `/api/evaluate` endpoints securely.

---

**Made with ❤️ for system design enthusiasts**
