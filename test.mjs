/**
 * Test the RAG layer directly
 * Run with: node test.mjs
 */

import ClawTextRAG from './src/rag.ts';

const rag = new ClawTextRAG();

console.log('🧠 ClawText RAG - Direct Test');
console.log('==============================\n');

// Show stats
const stats = rag.getStats();
console.log(`Clusters loaded: ${stats.clustersLoaded}`);
console.log(`Total memories: ${stats.totalMemories}`);
console.log('');

// Test 1: Search for moltmud
console.log('Test 1: Search for "moltmud agent memory"');
const memories1 = rag.findRelevantMemories('moltmud agent memory', ['moltmud']);
console.log(`Found ${memories1.length} relevant memories:`);
memories1.slice(0, 3).forEach(m => {
  console.log(`  - [${m.type}] ${m.content.substring(0, 70)}...`);
});
console.log('');

// Test 2: Injection with token budget
console.log('Test 2: Inject memories into system prompt');
const systemPrompt = 'You are a helpful assistant.';
const query = 'Tell me about moltmud agent behavior';
const result = rag.injectMemories(systemPrompt, query, ['moltmud']);
console.log(`Injected ${result.injected} memories (${result.tokens} tokens)`);
console.log(`New prompt length: ${result.prompt.length} chars`);
console.log('');

// Test 3: Search for openclaw
console.log('Test 3: Search for "gateway plugin"');
const memories3 = rag.findRelevantMemories('gateway plugin', ['openclaw']);
console.log(`Found ${memories3.length} relevant memories`);
console.log('');

console.log('✅ RAG layer test complete');
