import { NextResponse } from "next/server";

const languages = new Set(["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"]);

export async function POST(request: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SARVAM_API_KEY is not configured on the server." }, { status: 503 });

  try {
    const body = await request.json();
    const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 500) : "";
    const language = languages.has(body.language) ? body.language : "en-IN";
    const legalMoves = Array.isArray(body.legalMoves)
      ? body.legalMoves.filter((move: unknown) => typeof move === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)).slice(0, 256)
      : [];

    if (!transcript || legalMoves.length === 0) return NextResponse.json({ error: "A move and legal-move list are required." }, { status: 400 });

    const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sarvam-105b-conversations",
        temperature: 0,
        reasoning_effort: null,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You parse chess moves. Interpret the user's utterance as exactly one move from the supplied legal coordinate list. Never invent a move. Return JSON only: {"move":"coordinate string from list","say":"brief move confirmation in the selected language (${language})"}. If unclear, return an empty move and ask for clarification in say. Legal strings are UCI from-square plus to-square plus optional promotion.` },
          { role: "user", content: JSON.stringify({ utterance: transcript, legalMoves }) },
        ],
      }),
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? "Sarvam could not parse that move." }, { status: response.status });

    const content = data?.choices?.[0]?.message?.content;
    let parsed: { move?: string; say?: string } = {};
    try { parsed = JSON.parse(content); } catch { /* Return a safe move error below. */ }
    const move = typeof parsed.move === "string" && legalMoves.includes(parsed.move) ? parsed.move : "";
    return NextResponse.json({ move, say: typeof parsed.say === "string" ? parsed.say.slice(0, 240) : "" });
  } catch {
    return NextResponse.json({ error: "Could not process the move. Please try again." }, { status: 400 });
  }
}
