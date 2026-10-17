# Blindfold Chess

A voice-first blindfold chess web app. The chessboard is generated in the browser and concealed by default. Play as White against a simple legal-move opponent by speaking in a supported Indian language or entering a natural-language move. Use **Peek at board** to reveal the position for training.

## Stack

- Next.js App Router + TypeScript
- `chess.js` for legal chess rules and notation
- Sarvam Saaras v4 for speech recognition, Sarvam-105B Conversations for move parsing, and Bulbul v4 Flash for spoken replies

## Run locally

1. Install Node.js 20.9 or newer.
2. Install dependencies with `npm install`.
3. Revoke the Sarvam API key that was shared in chat. Create a replacement in your Sarvam dashboard, then put it in the ignored local `.env` file as `SARVAM_API_KEY=your_replacement_key`. Do not put the key in a `NEXT_PUBLIC_` variable or commit it.
4. Start the app with `npm run dev` and open http://localhost:3000.

Microphone access requires localhost or HTTPS and browser permission. Each recording should be a short move (the Saaras synchronous endpoint supports audio under 30 seconds). The selected language is used for speech recognition and generated voice; chess move names may still be spoken in English notation.

The opponent currently replies with a random legal move; it is a practice opponent, not a chess engine. Sarvam API calls are made only by server routes so the API key is never sent to the browser.