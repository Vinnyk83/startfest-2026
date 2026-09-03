// Minimal Deepgram prerecorded-transcription client (no SDK dependency —
// just a fetch call). Used to transcribe each recorded audio chunk with
// speaker diarization.
async function transcribeChunk(buffer, mimeType) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    const err = new Error('DEEPGRAM_NOT_CONFIGURED');
    err.code = 'DEEPGRAM_NOT_CONFIGURED';
    throw err;
  }
  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || 'nova-3',
    diarize: 'true',
    smart_format: 'true',
    punctuate: 'true',
    language: 'en',
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mimeType || 'audio/webm',
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Deepgram error ${res.status}: ${text}`);
    err.code = 'DEEPGRAM_ERROR';
    throw err;
  }
  const data = await res.json();
  return formatTranscript(data);
}

// Turns Deepgram's word-level diarized output into "Speaker 1: ... \nSpeaker 2: ..." text.
function formatTranscript(data) {
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (!words || !words.length) {
    return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }
  const lines = [];
  let currentSpeaker = null;
  let currentWords = [];
  for (const w of words) {
    const speaker = w.speaker !== undefined ? w.speaker : 0;
    if (speaker !== currentSpeaker) {
      if (currentWords.length) lines.push(`Speaker ${currentSpeaker + 1}: ${currentWords.join(' ')}`);
      currentSpeaker = speaker;
      currentWords = [];
    }
    currentWords.push(w.punctuated_word || w.word);
  }
  if (currentWords.length) lines.push(`Speaker ${currentSpeaker + 1}: ${currentWords.join(' ')}`);
  return lines.join('\n');
}

module.exports = { transcribeChunk };
