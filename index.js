// ============================================================
// TaskForge AI — Secure Backend Proxy Server
// Uses Google Gemini API (free tier)
// ============================================================

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

app.use(cors({
  origin: "*", // allow all origins for now
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "TaskForge AI Backend running" });
});

// ── Gemini AI Proxy ───────────────────────────────────────────
app.post("/api/ai/chat", async (req, res) => {
  const { messages, system, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request: messages array required" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not set on server" });
  }

  try {
    // Convert messages to Gemini format
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens: Math.min(max_tokens || 1000, 4000),
        temperature: 0.7,
      },
    };

    // Add system instruction if provided
    if (system) {
      payload.systemInstruction = {
        parts: [{ text: system }],
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "Gemini request failed",
      });
    }

    // Convert Gemini response to match frontend expectations
    const converted = {
      content: [{
        type: "text",
        text: data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.",
      }],
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount || 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      },
    };

    res.json(converted);

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TaskForge AI backend running on port ${PORT}`);
});
