import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { z } from "zod";

const sqliteMemoryConfigSchema = z.object({
  dailyLogDir: z.string().default("./memory"),
  structuredExportDir: z.string().default("./memory/structured"),
  autoSyncIntervalMinutes: z.number().default(5),
  defaultTtl: z.object({
    preference: z.number().default(365),
    decision: z.number().default(180),
    fact: z.number().default(90),
    error: z.number().default(365),
    plan: z.number().default(90),
    task: z.number().default(30),
    summary: z.number().default(30),
    project_context: z.number().default(365),
    code: z.number().default(365),
  }).default({}),
});

type SQLiteMemoryConfig = z.infer<typeof sqliteMemoryConfigSchema>;

const sqliteMemoryPlugin = {
  id: "sqlite-memory",
  name: "SQLite Memory (Enhanced)",
  description: "Structured SQLite memory with auto-sync to Markdown",
  kind: "memory",
  configSchema: sqliteMemoryConfigSchema,
  
  register(api: OpenClawPluginApi) {
    // Dynamic import to avoid bundling issues
    const { MemoryService } = await import("./memory/service.ts");
    const { MemorySync } = await import("./memory/sync.ts");
    const { MemoryMaintenance } = await import("./memory/maintenance.ts");
    
    let service: MemoryService | null = null;
    let sync: MemorySync | null = null;
    let maintenance: MemoryMaintenance | null = null;

    // Initialize on first use
    const initService = (config: SQLiteMemoryConfig) => {
      if (!service) {
        const workspaceRoot = process.env.OPENCLAW_WORKSPACE || ".";
        service = new MemoryService(workspaceRoot, true);
        sync = new MemorySync(service, {
          dailyLogDir: config.dailyLogDir,
          structuredExportDir: config.structuredExportDir,
          autoSyncIntervalMs: config.autoSyncIntervalMinutes * 60 * 1000,
        });
        maintenance = new MemoryMaintenance(service);
        
        // Start auto-sync
        sync.startAutoSync();
        
        api.logger.info("[SQLiteMemory] Initialized");
      }
      return { service, sync, maintenance };
    };

    // Register tools
    api.registerTool(
      (ctx) => {
        const { service, sync } = initService(ctx.config);
        if (!service || !sync) return null;

        // Tool: sqlite_memory_add
        const addTool: AnyAgentTool = {
          name: "sqlite_memory_add",
          description: "Add a structured memory entry",
          parameters: z.object({
            content: z.string().describe("Memory content"),
            type: z.enum(["fact", "decision", "preference", "error", "plan", "task", "code", "summary", "project_context"]).describe("Memory type"),
            priority: z.number().min(0).max(1).optional().describe("Priority 0-1"),
            projectId: z.string().optional().describe("Project ID"),
            ttlDays: z.number().optional().describe("Time-to-live in days"),
            updatesId: z.string().optional().describe("ID of memory this supersedes"),
          }),
          async execute({ content, type, priority = 0.5, projectId, ttlDays, updatesId }) {
            try {
              const memory = service.createMemory({
                content,
                type,
                priority,
                source: "agent",
                ttlDays,
                updatesId,
              }, projectId);

              // Immediate sync to markdown
              sync.appendToDailyLog(memory);

              return {
                result: "Memory created",
                id: memory.id,
                type: memory.type,
                expiresAt: memory.expiresAt?.toISOString(),
              };
            } catch (error) {
              return { error: String(error) };
            }
          },
        };

        // Tool: sqlite_memory_search
        const searchTool: AnyAgentTool = {
          name: "sqlite_memory_search",
          description: "Search structured memories",
          parameters: z.object({
            query: z.string().describe("Search query"),
            type: z.string().optional().describe("Filter by type"),
            projectId: z.string().optional().describe("Filter by project"),
            limit: z.number().default(10).describe("Max results"),
          }),
          async execute({ query, type, projectId, limit }) {
            try {
              const results = service.searchMemories({
                query,
                type: type as any,
                projectId,
                limit,
                pinnedFirst: true,
                recentFirst: true,
              });

              return {
                results: results.map(m => ({
                  id: m.id,
                  content: m.content.slice(0, 200),
                  type: m.type,
                  priority: m.priority,
                  accessCount: m.accessCount,
                  lastAccessed: m.lastAccessed.toISOString(),
                })),
              };
            } catch (error) {
              return { error: String(error) };
            }
          },
        };

        // Tool: sqlite_memory_get
        const getTool: AnyAgentTool = {
          name: "sqlite_memory_get",
          description: "Get a memory by ID",
          parameters: z.object({
            id: z.string().describe("Memory ID"),
            projectId: z.string().optional(),
          }),
          async execute({ id, projectId }) {
            try {
              const memory = service.getMemoryById(id, projectId);
              if (!memory) {
                return { error: "Memory not found" };
              }

              return {
                id: memory.id,
                content: memory.content,
                type: memory.type,
                priority: memory.priority,
                createdAt: memory.createdAt.toISOString(),
                updatedAt: memory.updatedAt.toISOString(),
                accessCount: memory.accessCount,
                expiresAt: memory.expiresAt?.toISOString(),
                updatesId: memory.updatesId,
              };
            } catch (error) {
              return { error: String(error) };
            }
          },
        };

        // Tool: sqlite_memory_latest
        const latestTool: AnyAgentTool = {
          name: "sqlite_memory_latest",
          description: "Get the latest version of a memory (follows update chain)",
          parameters: z.object({
            id: z.string().describe("Memory ID"),
            projectId: z.string().optional(),
          }),
          async execute({ id, projectId }) {
            try {
              const latest = sync.getLatestVersion(id, projectId);
              if (!latest) {
                return { error: "Memory not found" };
              }

              return {
                id: latest.id,
                content: latest.content,
                type: latest.type,
                isLatest: latest.id === id,
              };
            } catch (error) {
              return { error: String(error) };
            }
          },
        };

        // Tool: sqlite_memory_stats
        const statsTool: AnyAgentTool = {
          name: "sqlite_memory_stats",
          description: "Get memory statistics",
          parameters: z.object({
            projectId: z.string().optional(),
          }),
          async execute({ projectId }) {
            try {
              const stats = maintenance.getStats(projectId);
              return { stats };
            } catch (error) {
              return { error: String(error) };
            }
          },
        };

        return [addTool, searchTool, getTool, latestTool, statsTool];
      },
      { names: ["sqlite_memory_add", "sqlite_memory_search", "sqlite_memory_get", "sqlite_memory_latest", "sqlite_memory_stats"] }
    );

    // Register CLI commands
    api.registerCli(
      ({ program }) => {
        program
          .command("memory:add")
          .description("Add a memory")
          .argument("<content>", "Memory content")
          .option("-t, --type <type>", "Memory type", "fact")
          .option("-p, --priority <n>", "Priority (0-1)", "0.5")
          .option("-P, --project <id>", "Project ID")
          .option("--ttl <days>", "Time-to-live in days")
          .action(async (content, opts) => {
            const { service, sync } = initService(api.config);
            const memory = service.createMemory({
              content,
              type: opts.type,
              priority: parseFloat(opts.priority),
              ttlDays: opts.ttl ? parseInt(opts.ttl) : undefined,
            }, opts.project);
            sync.appendToDailyLog(memory);
            console.log(`Created: ${memory.id}`);
          });

        program
          .command("memory:search")
          .description("Search memories")
          .argument("<query>", "Search query")
          .option("-t, --type <type>", "Filter by type")
          .option("-P, --project <id>", "Project ID")
          .option("-l, --limit <n>", "Limit", "10")
          .action(async (query, opts) => {
            const { service } = initService(api.config);
            const results = service.searchMemories({
              query,
              type: opts.type,
              projectId: opts.project,
              limit: parseInt(opts.limit),
            });
            console.log(JSON.stringify(results, null, 2));
          });

        program
          .command("memory:maintenance")
          .description("Run memory maintenance (cleanup expired)")
          .option("-d, --dry-run", "Dry run (don't delete)")
          .option("-P, --project <id>", "Project ID")
          .action(async (opts) => {
            const { maintenance } = initService(api.config);
            const result = maintenance.cleanupExpired({
              dryRun: opts.dryRun || false,
            });
            console.log(`Deleted: ${result.deleted}`);
            console.log(`Archived: ${result.archived}`);
          });

        program
          .command("memory:export")
          .description("Export memories to Markdown")
          .option("-P, --project <id>", "Project ID")
          .action(async (opts) => {
            const { sync } = initService(api.config);
            const result = sync.exportToStructured(opts.project);
            console.log(`Exported ${result.exported} memories to ${result.files.length} files`);
          });
      },
      { commands: ["memory:add", "memory:search", "memory:maintenance", "memory:export"] }
    );

    // Cleanup on shutdown
    process.on("exit", () => {
      if (service) {
        service.close();
        api.logger.info("[SQLiteMemory] Shutdown");
      }
    });
  },
};

export default sqliteMemoryPlugin;
