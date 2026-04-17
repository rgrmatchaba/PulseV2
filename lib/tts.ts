import { DeepgramClient } from "@deepgram/sdk";

/**
 * Text-to-speech via Deepgram Aura REST API (SDK v5).
 * @see https://developers.deepgram.com/docs/text-to-speech
 */
export async function speak(text: string): Promise<Buffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("Missing DEEPGRAM_API_KEY");

  const deepgram = new DeepgramClient({ apiKey });

  const binary = await deepgram.speak.v1.audio.generate({
    text,
    model: "aura-2-orion-en", // deep, authoritative — fits the SLJ vibe
    encoding: "mp3",
  });

  const arrayBuffer = await binary.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
