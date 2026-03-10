import { ClawTextRAGPlugin } from "./plugin.js";

const clawtextPlugin = {
  id: "clawtext",
  name: "ClawText",
  description: "Automatic working-memory retrieval, prompt injection, and operational learning hooks for OpenClaw.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  register(api: any) {
    return new ClawTextRAGPlugin(api);
  },
};

export default clawtextPlugin;
