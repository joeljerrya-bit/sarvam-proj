import { NextResponse } from "next/server";

const languages = new Set(["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"]);

export async function POST(request: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SARVAM_API_KEY is not configured on the server." }, { status: 503 });
  try {
    const incoming = await request.formData();
    const audio = incoming.get("file");
    const language = String(incoming.get("language") ?? "en-IN");
    if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "Record a short move first." }, { status: 400 });
    if (audio.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Audio must be under 20 MB." }, { status: 413 });

    const payload = new FormData();
    payload.append("file", audio, audio.name || "move.webm");
    payload.append("model", "saaras:v4");
    payload.append("language_code", languages.has(language) ? language : "en-IN");
    payload.append("mode", "transcribe");
    const response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: payload,
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? "Speech recognition failed." }, { status: response.status });
    return NextResponse.json({ transcript: data.transcript ?? "" });
  } catch {
    return NextResponse.json({ error: "Could not transcribe the recording." }, { status: 400 });
  }
}