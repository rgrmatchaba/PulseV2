"use client";

import { DeepgramClient } from "@deepgram/sdk";

export type LiveSttCallbacks = {
  onInterim?: (text: string) => void;
};

type LiveConnection = Awaited<
  ReturnType<InstanceType<typeof DeepgramClient>["listen"]["v1"]["connect"]>
>;

/**
 * Streams mic chunks to Deepgram while recording so transcription is ready when the user stops.
 */
export class LiveSttSession {
  private connection: LiveConnection | null = null;
  private finals: string[] = [];
  private interim = "";
  private callbacks: LiveSttCallbacks;

  constructor(callbacks: LiveSttCallbacks = {}) {
    this.callbacks = callbacks;
  }

  private emit() {
    const text = [...this.finals, this.interim].filter(Boolean).join(" ").trim();
    this.callbacks.onInterim?.(text);
  }

  async open(): Promise<void> {
    const res = await fetch("/api/deepgram-token");
    const data = await res.json();
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? "Failed to get Deepgram token");
    }

    const client = new DeepgramClient({ accessToken: data.token });
    const connection = await client.listen.v1.connect({
      model: "nova-3",
      language: "en",
      punctuate: "true",
      interim_results: "true",
      smart_format: "true",
      endpointing: "300",
      Authorization: `token ${data.token}`,
    });

    connection.on("message", (payload) => {
      if (payload.type !== "Results") return;
      const transcript = payload.channel?.alternatives?.[0]?.transcript ?? "";
      if (!transcript) return;
      if (payload.is_final) {
        this.finals.push(transcript);
        this.interim = "";
      } else {
        this.interim = transcript;
      }
      this.emit();
    });

    connection.connect();
    await connection.waitForOpen();
    this.connection = connection;
  }

  sendChunk(chunk: Blob) {
    if (chunk.size > 0) this.connection?.sendMedia(chunk);
  }

  async close(): Promise<string> {
    if (!this.connection) return "";

    this.connection.sendFinalize({ type: "Finalize" });
    await new Promise((r) => setTimeout(r, 400));
    this.connection.sendCloseStream({ type: "CloseStream" });
    await new Promise((r) => setTimeout(r, 200));
    this.connection.close();
    this.connection = null;

    const text = [...this.finals, this.interim].filter(Boolean).join(" ").trim();
    return text;
  }
}
