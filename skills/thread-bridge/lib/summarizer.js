const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);

// Summarizer supports effort levels (low|medium|high|max) which control
// whether we use a cheap extractive approach or spawn an LLM subagent.
// - low: extractive bullets, no LLM
// - medium: short LLM summarization (model=main)
// - high: detailed LLM summarization (model=prd)
// - max: thorough LLM summarization (model=prd) with extra instructions

async function summarize(messages, opts = {}) {
  const effort = opts.effort || 'medium';
  const style = opts.style || (effort === 'low' ? 'bullets' : 'detailed');
  const mode = opts.mode || 'refresh';

  if (effort === 'low') {
    return naiveSummarize(messages, 'bullets');
  }

  const model = (effort === 'medium') ? 'main' : 'prd';
  const prompt = buildPrompt(messages, { style, mode, titleHint: opts.titleHint, effort });

  // Attempt sessions_spawn with chosen model
  const cmd = `openclaw sessions spawn --runtime=subagent --model=${model} --stdin`;
  try {
    const child = exec(cmd, { maxBuffer: 1024 * 1024 });
    // for 'max' add an extra instruction to be thorough
    child.stdin.write(prompt);
    child.stdin.end();

    const out = await new Promise((resolve, reject) => {
      let buf = '';
      child.stdout.on('data', d => buf += d.toString());
      child.stderr.on('data', d => buf += d.toString());
      child.on('close', code => {
        if (code === 0) resolve(buf);
        else resolve(buf);
      });
      child.on('error', err => reject(err));
    });

    return out.trim() || naiveSummarize(messages, style);
  } catch (err) {
    return naiveSummarize(messages, style);
  }
}

function buildPrompt(messages, { style = 'detailed', mode = 'refresh', titleHint, effort = 'medium' } = {}) {
  let header = `You are a summarization assistant for thread-bridge. Produce a summary including: current state, key decisions, active tasks, blockers, next steps.`;
  header += ` Use style: ${style}. Mode: ${mode}. Effort: ${effort}.`;
  if (effort === 'max') {
    header += ' Be thorough: include a timeline of events, decisions, blockers, and clear next steps; separate sections and use headings.';
  } else if (effort === 'high') {
    header += ' Provide a structured, detailed summary with headings.';
  }

  let body = messages && messages.length ? messages.map(m => `- ${m.author || 'user'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n') : '(no messages)';
  if (titleHint) body = `Title hint: ${titleHint}\n\n` + body;
  return `${header}\n\n${body}\n\nRespond with plain text. `;
}

function naiveSummarize(messages, style) {
  if (!messages || messages.length === 0) return 'No messages to summarize.';
  const recent = messages.slice(-Math.min(messages.length, 40));
  const lines = recent.map(m => `${m.author || 'user'}: ${truncate(m.content, 240)}`);
  const summary = [];
  if (style === 'bullets') {
    summary.push(lines.map(l => `• ${l}`).join('\n'));
    return summary.join('\n');
  }
  if (style === 'brief') {
    return lines.slice(-5).join('\n');
  }
  // detailed naive
  summary.push('Summary (naive detailed):');
  summary.push('Recent messages:\n' + lines.join('\n'));
  summary.push('\nNext steps: Review the most recent messages and continue the discussion.');
  return summary.join('\n\n');
}

function truncate(s, n) { return (s && s.length > n) ? s.slice(0,n-1)+'…' : s; }

module.exports = { summarize };
