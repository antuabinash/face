// api/analyze.js  — Vercel serverless function for Gemini 2.0 Flash
// Put this file in your repo under /api/analyze.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.GEMINI_API_KEY; // set this in Vercel env vars
  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'; // optional override

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY missing' });
  }

  try {
    const { findingsText = '', numericScores = {}, preferredLang = 'en' } = req.body;

    const prompt = `
You are a concise, friendly health-assistant for an educational demo.
Input (json): ${JSON.stringify({ findingsText, numericScores }).slice(0,2000)}

Task: Return ONLY valid JSON with these keys:
{
  "summary": "1-2 sentence summary in ${preferredLang === 'en' ? 'English' : preferredLang}.",
  "suggestions": ["3 short prioritized home-care suggestions"],
  "disclaimer": "One-line disclaimer",
  "action": "One-sentence CTA (thermometer / consult a doctor)"
}
Respond ONLY with JSON. Do not add extra text.
`;

    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(MODEL)}:generateContent?key=${AIzaSyCFJWOOTNAROqa5urElGCzi1BOjnr_nuYc}`;

    const body = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      // low temperature for consistent deterministic replies:
      temperature: 0.0,
      maxOutputTokens: 400
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error('Gemini responded non-OK:', r.status, txt);
      return res.status(502).json({ error: 'Gemini error', detail: txt });
    }

    const jr = await r.json();

    // Typical place for text in Gemini responses:
    const text =
      jr?.candidates?.[0]?.content?.parts?.[0]?.text ||
      jr?.candidates?.[0]?.output_text ||
      jr?.output_text ||
      JSON.stringify(jr);

    // Try to parse returned text as JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      // Try to extract first JSON object substring
      const match = (typeof text === 'string') && text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); }
        catch (e) { parsed = { raw: text }; }
      } else {
        parsed = { raw: text };
      }
    }

    return res.status(200).json({ ok: true, data: parsed });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: String(err) });
  }
}
