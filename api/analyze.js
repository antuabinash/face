// api/analyze.js  — Vercel serverless function
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY || !GEMINI_ENDPOINT) {
    return res.status(500).json({ error: 'Server not configured. Set GEMINI_API_KEY and GEMINI_ENDPOINT.' });
  }

  try {
    const { findingsText = '', numericScores = {}, thumbnail64 = null, preferredLang = 'en' } = req.body;

    const prompt = `
You are a friendly health-assistant for an educational demo. Input (json): ${JSON.stringify({ findingsText, numericScores }).slice(0,2000)}
Return valid JSON with keys:
{
  "summary": "1-2 sentence summary in English",
  "suggestions": ["3 short prioritized home-care suggestions"],
  "disclaimer": "One-line disclaimer",
  "action": "One-sentence CTA (thermometer / consult a doctor)",
  "translations": { "hi": {...}, "or": {...} } // optional
}
Respond ONLY with valid JSON.
`;

    const body = { prompt, max_tokens: 400, temperature: 0.0 };

    // call Gemini endpoint
    const r = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: 'Gemini error', detail: txt });
    }

    const jr = await r.json();
    // adjust parsing depending on the Gemini response shape
    const assistantText = jr?.choices?.[0]?.text || jr?.output || JSON.stringify(jr);
    try {
      const parsed = JSON.parse(assistantText);
      return res.status(200).json({ ok: true, data: parsed });
    } catch (e) {
      // fallback: return raw assistant text
      return res.status(200).json({ ok: true, data: { raw: assistantText } });
    }

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
