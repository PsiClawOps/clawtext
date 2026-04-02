declare const handler: (event: Record<string, unknown>, ctx?: {
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    workspaceDir?: string;
    isHeartbeat?: boolean;
    [key: string]: unknown;
}) => Promise<void>;
export default handler;
//# sourceMappingURL=handler.d.ts.map