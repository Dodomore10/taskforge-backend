// ============================================================
// TaskForge AI — Secure Backend Proxy Server
// Keeps your Anthropic API key safe on the server side
// Deploy this to Railway.app (free)
// ============================================================

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// CORS — allow your Vercel frontend URL
app.use(cors({
  origin: [
    "http://localhost:5173",           // local dev
    "http://localhost:4173",           // local preview
    process.env.FRONTEND_URL,          // your Vercel URL e.g. https://taskforge-ai.vercel.app
  ].filter(Boolean),
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Rate limiting — prevent API abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // max 100 requests per window per IP
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// Stricter limit on AI calls
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,             // max 20 AI calls per minute per IP
  message: { error: "AI rate limit exceeded. Please wait a moment." },
});

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "TaskForge AI Backend running" });
});

// ── Anthropic Proxy Endpoint ──────────────────────────────────
// Frontend sends requests here instead of directly to Anthropic
app.post("/api/ai/chat", aiLimiter, async (req, res) => {
  const { model, max_tokens, messages, system } = req.body;

  // Validate required fields
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request: messages array required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set in environment variables");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const payload = {
      model: model || "claude-sonnet-4-20250514",
      max_tokens: Math.min(max_tokens || 1000, 4000), // cap at 4000 for safety
      messages,
    };
    if (system) payload.system = system;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", data);
      return res.status(response.status).json({ error: data.error?.message || "AI request failed" });
    }

    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TaskForge AI backend running on port ${PORT}`);
});
