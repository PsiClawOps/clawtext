import { ClawTextInjectionPlugin } from './plugin';
import { ClawTextRAG } from './rag';

export { ClawTextInjectionPlugin, ClawTextRAG };
export * from './library';
export * from './library-ingest';
export * from './runtime-paths';

function extractUserText(messages: unknown[] = []): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  const contentFromMessage = (msg: unknown): string => {
    if (!msg || typeof msg !== "object") {
      return String(msg ?? "");
    }

    const record = msg as {
      content?: unknown;
      contentPreview?: unknown;
      text?: unknown;
      prompt?: unknown;
      message?: unknown;
    };

    return (
      (typeof record.content === "string" ? record.content : "") ||
      (typeof record.contentPreview === "string" ? record.contentPreview : "") ||
      (typeof record.text === "string" ? record.text : "") ||
      (typeof record.prompt === "string" ? record.prompt : "") ||
      (typeof record.message === "string" ? record.message : "") ||
      ""
    );
  };

  const lastMessage = messages[messages.length - 1];
  return contentFromMessage(lastMessage);
}

export default {
  id: "clawtext",
  name: "ClawText",
  description:
    "Automatic working-memory retrieval, prompt injection, and operational learning hooks for OpenClaw.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  register(api: any) {
    const plugin = new ClawTextInjectionPlugin();

    api.on(
      "before_prompt_build",
      async (event: { prompt?: unknown; messages?: unknown[] }) => {
        const systemPrompt = typeof event.prompt === "string" ? event.prompt : "";
        const userMessage = extractUserText(Array.isArray(event.messages) ? event.messages : []);

        const result = await plugin.onBeforePromptBuild({
          systemPrompt,
          userMessage,
        });

        return result?.systemPrompt ? { systemPrompt: result.systemPrompt } : undefined;
      },
      { priority: 40 },
    );
  },
};

