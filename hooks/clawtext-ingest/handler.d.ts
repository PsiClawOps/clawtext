declare const handler: (event: {
    type: string;
    action: string;
    messageCount?: number;
    tokenCount?: number;
    compactedCount?: number;
    sessionFile?: string;
    messages?: Array<Record<string, unknown>>;
}, ctx: {
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    workspaceDir?: string;
    messageProvider?: unknown;
    channelId?: string;
    [key: string]: unknown;
}) => Promise<void>;
export default handler;
//# sourceMappingURL=handler.d.ts.map