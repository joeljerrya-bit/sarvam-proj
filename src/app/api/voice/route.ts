import { NextResponse } from "next/server";

const languages = new Set(["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"]);

export async function POST(request: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SARVAM_API_KEY is not configured on the server." }, { status: 503 });
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 2500) : "";
    const language = languages.has(body.language) ? body.language : "en-IN";
    if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, language_code: language, model: "bulbul:v4-flash" }),
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? "Speech generation failed." }, { status: response.status });
    return NextResponse.json({ audio: data.audios?.[0] ?? null });
  } catch {
    return NextResponse.json({ error: "Could not generate speech." }, { status: 400 });
  }
}