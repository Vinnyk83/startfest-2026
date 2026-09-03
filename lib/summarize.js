// Turns a diarized transcript into a summary + action items using Grok
// (xAI's chat-completions API is OpenAI-compatible). Requires XAI_API_KEY —
// if it's not set, returns a clear placeholder instead of crashing the
// recording flow (the transcript itself is still saved either way).
async function summarizeTranscript(transcript) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      summary: 'Summary unavailable — set XAI_API_KEY to enable automatic summaries. The full transcript below is still accurate.',
      actionItems: [],
    };
  }
  const prompt = `You are summarizing a live conference session transcript for attendees who may have missed it.
Transcript (speaker-labeled, may contain transcription errors):
---
${transcript.slice(0, 12000)}
---
Respond with ONLY a JSON object of the form {"summary": "3-5 sentence summary", "actionItems": ["short action item", ...]}. If there are no clear action items, return an empty array.`;

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || 'grok-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`xAI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '{}';
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    return {
      summary: parsed.summary || '',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    };
  } catch (e) {
    return { summary: content, actionItems: [] };
  }
}

module.exports = { summarizeTranscript };
