import { Memory, MemoryType, MemorySource } from './types.js';
import { MemoryService } from './service.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface ExportOptions {
  projectId?: string;
  types?: MemoryType[];
  minPriority?: number;
  includeMetadata?: boolean;
}

export interface ImportOptions {
  projectId?: string;
  skipExisting?: boolean;
  dryRun?: boolean;
}

interface MarkdownMemory {
  frontmatter: {
    id?: string;
    type?: MemoryType;
    project?: string;
    source?: MemorySource;
    priority?: number;
    created?: string;
    updated?: string;
    pinned?: boolean;
    [key: string]: any;
  };
  content: string;
}

export class MemoryExporter {
  private service: MemoryService;

  constructor(service: MemoryService) {
    this.service = service;
  }

  /**
   * Export memories to Markdown files
   */
  exportToMarkdown(
    outputDir: string,
    options: ExportOptions = {}
  ): { exported: number; files: string[] } {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const memories = this.service.searchMemories({
      projectId: options.projectId,
      type: options.types,
      minPriority: options.minPriority,
      limit: 10000, // Get all
    });

    const files: string[] = [];
    const exportedByType: Record<string, Memory[]> = {};

    // Group by type for organization
    for (const mem of memories) {
      if (!exportedByType[mem.type]) exportedByType[mem.type] = [];
      exportedByType[mem.type].push(mem);
    }

    // Write one file per type
    for (const [type, mems] of Object.entries(exportedByType)) {
      const fileName = `${type}s.md`;
      const filePath = join(outputDir, fileName);
      const markdown = this.generateTypeFile(type, mems, options);
      writeFileSync(filePath, markdown);
      files.push(filePath);
    }

    // Also create an index file
    const indexPath = join(outputDir, '_index.md');
    writeFileSync(indexPath, this.generateIndex(memories, options.projectId));
    files.push(indexPath);

    return { exported: memories.length, files };
  }

  /**
   * Import memories from Markdown files
   */
  importFromMarkdown(
    filePath: string,
    options: ImportOptions = {}
  ): { imported: number; skipped: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    if (!existsSync(filePath)) {
      return { imported: 0, skipped: 0, errors: [`File not found: ${filePath}`] };
    }

    const content = readFileSync(filePath, 'utf-8');
    const memories = this.parseMarkdown(content);

    for (const mem of memories) {
      const existingId = mem.frontmatter.id;
      
      if (existingId && options.skipExisting) {
        const existing = this.service.getMemoryById(existingId, options.projectId);
        if (existing) {
          skipped++;
          continue;
        }
      }

      if (options.dryRun) {
        imported++;
        continue;
      }

      try {
        this.service.createMemory({
          content: mem.content,
          type: mem.frontmatter.type || 'fact',
          source: mem.frontmatter.source || 'imported',
          priority: mem.frontmatter.priority ?? 0.5,
          isPinned: mem.frontmatter.pinned || false,
          metadata: Object.fromEntries(
            Object.entries(mem.frontmatter).filter(([k]) => 
              !['id', 'type', 'project', 'source', 'priority', 'created', 'updated', 'pinned'].includes(k)
            )
          ),
        }, options.projectId || mem.frontmatter.project);
        imported++;
      } catch (e: any) {
        errors.push(`Failed to import memory: ${e.message}`);
      }
    }

    return { imported, skipped, errors };
  }

  /**
   * Export a single memory to a review file (for Slack import workflow)
   */
  exportForReview(
    memories: Memory[],
    outputPath: string,
    title: string = 'Memory Review'
  ): void {
    let markdown = `# ${title}\n\n`;
    markdown += `Generated: ${new Date().toISOString()}\n\n`;
    markdown += `## Instructions\n\n`;
    markdown += `Review the memories below. Edit as needed, then import with:\n`;
    markdown += `\`\`\`\n/memory import ${outputPath}\n\`\`\`\n\n`;
    markdown += `---\n\n`;

    for (const mem of memories) {
      markdown += this.memoryToMarkdown(mem, true);
      markdown += '\n---\n\n';
    }

    writeFileSync(outputPath, markdown);
  }

  private generateTypeFile(type: string, memories: Memory[], options: ExportOptions): string {
    let markdown = `# ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
    markdown += `Total: ${memories.length} memories\n\n`;

    for (const mem of memories) {
      markdown += this.memoryToMarkdown(mem, options.includeMetadata);
      markdown += '\n---\n\n';
    }

    return markdown;
  }

  private generateIndex(memories: Memory[], projectId?: string): string {
    let markdown = '# Memory Index\n\n';
    
    if (projectId) {
      markdown += `Project: ${projectId}\n\n`;
    }

    markdown += `Total Memories: ${memories.length}\n\n`;

    // Summary by type
    const byType: Record<string, number> = {};
    for (const mem of memories) {
      byType[mem.type] = (byType[mem.type] || 0) + 1;
    }

    markdown += '## By Type\n\n';
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      markdown += `- **${type}s**: ${count}\n`;
    }

    markdown += '\n## Recent Memories\n\n';
    const recent = memories
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 10);

    for (const mem of recent) {
      const preview = mem.content.slice(0, 100).replace(/\n/g, ' ');
      markdown += `- \`${mem.id}\` (${mem.type}): ${preview}...\n`;
    }

    return markdown;
  }

  private memoryToMarkdown(mem: Memory, includeMetadata: boolean = true): string {
    const frontmatter: Record<string, any> = {
      id: mem.id,
      type: mem.type,
      source: mem.source,
      priority: mem.priority,
      created: mem.createdAt.toISOString().split('T')[0],
      updated: mem.updatedAt.toISOString().split('T')[0],
      pinned: mem.isPinned,
    };

    if (mem.projectId) {
      frontmatter.project = mem.projectId;
    }

    if (includeMetadata && mem.metadata) {
      Object.assign(frontmatter, mem.metadata);
    }

    const fmLines = Object.entries(frontmatter)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);

    return `---\n${fmLines.join('\n')}\n---\n\n${mem.content}`;
  }

  private parseMarkdown(content: string): MarkdownMemory[] {
    const memories: MarkdownMemory[] = [];
    const sections = content.split(/\n---\n/).filter(s => s.trim());

    for (const section of sections) {
      const parsed = this.parseSection(section.trim());
      if (parsed) memories.push(parsed);
    }

    return memories;
  }

  private parseSection(section: string): MarkdownMemory | null {
    const fmMatch = section.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
    
    if (!fmMatch) {
      // No frontmatter, treat entire section as content
      return {
        frontmatter: {},
        content: section,
      };
    }

    const frontmatterText = fmMatch[1];
    const content = fmMatch[2].trim();

    const frontmatter: Record<string, any> = {};
    
    for (const line of frontmatterText.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        try {
          frontmatter[key] = JSON.parse(value);
        } catch {
          frontmatter[key] = value;
        }
      }
    }

    return { frontmatter, content };
  }
}
