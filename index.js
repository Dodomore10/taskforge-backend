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

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set in environment variables");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const payload = {
      model: model || "claude-sonnet-4-20250514",
      max_tokens: Math.min(max_tokens || 1000, 4000), // cap at 4000 for safety
      messages,
    };
    if (system) payload.system = system;

  const geminiPayload = {
  contents: messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  })),
  systemInstruction: system ? { parts: [{ text: system }] } : undefined,
  generationConfig: {
    maxOutputTokens: Math.min(max_tokens || 1000, 4000),
  },
};

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiPayload),
  }
);
    const data = await response.json();

if (!response.ok) {
  return res.status(response.status).json({ 
    error: data.error?.message || "Gemini request failed" 
  });
}

// Convert Gemini response format to match what frontend expects
const converted = {
  content: [{
    type: "text",
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || "No response"
  }],
  usage: {
    input_tokens: data.usageMetadata?.promptTokenCount || 0,
    output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
  }
};

res.json(converted);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TaskForge AI backend running on port ${PORT}`);
});
