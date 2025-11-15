// server/server.js
// Simple Express backend for forwarding requests to Gemini (do NOT put key here)
import express from 'express';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if(!GEMINI_KEY){
  console.warn('GEMINI_API_KEY not set — backend will fail to call Gemini until env var is configured.');
}

// simple rate limiter: e.g., 10 requests per minute per IP
const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

app.post('/analyze', async (req, res) => {
  try {
    // rate limit by IP
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    await limiter.consume(ip);

    if(!GEMINI_KEY) return res.status(500).json({ error: 'Server not configured: GEMINI_API_KEY missing' });

    const { findingsText = '', numericScores = {}, preferredLang = 'en' } = req.body || {};

    const prompt = `
You are a concise, friendly health-assistant for an educational demo.
Input (json): ${JSON.stringify({ findingsText, numericScores }).slice(0,2000)}

Task: Return ONLY valid JSON with keys:
{ "summary": "...", "suggestions": ["...","...","..."], "disclaimer":"...", "action":"..." }
Respond ONLY with JSON.
`;

    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      temperature: 0.0,
      maxOutputTokens: 400
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if(!r.ok){
      const txt = await r.text();
      console.error('Gemini error', r.status, txt.slice(0,1000));
      return res.status(502).json({ error: 'Gemini upstream error', status: r.status, detail: txt.slice(0,1000) });
    }

    const jr = await r.json();
    const text =
      jr?.candidates?.[0]?.content?.parts?.[0]?.text ||
      jr?.candidates?.[0]?.output_text ||
      jr?.output_text ||
      JSON.stringify(jr);

    // try parse as JSON
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) {
      const match = (typeof text === 'string') && text.match(/\{[\s\S]*\}/);
      if(match){
        try{ parsed = JSON.parse(match[0]); } catch(e2) { parsed = { raw: text }; }
      } else parsed = { raw: text };
    }

    return res.json({ ok: true, data: parsed });

  } catch (err) {
    if (err instanceof Error && err.msBeforeNext) {
      // rate limiter error object (rate-limiter-flexible)
      return res.status(429).json({ error: 'Too many requests. Try again later.'});
    }
    console.error('Server error /analyze', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.get('/', (req, res) => res.send('Face health backend is running. POST /analyze to call Gemini.'));

app.listen(PORT, () => console.log('Server listening on', PORT));
