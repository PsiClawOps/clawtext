# Contributing to ClawText RAG

Thank you for interest in improving ClawText RAG! Here's how to contribute.

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/clawtext-rag.git
cd clawtext-rag

# Install dependencies
npm install

# Run tests
npm test

# Start watching TypeScript
npm run dev
```

## Code Style

- Use camelCase for variables and functions
- Use UPPER_CASE for constants
- Add comments for non-obvious logic
- Keep functions focused and small
- Run `npm run lint` before committing

## Testing

All changes must pass tests:

```bash
npm test
```

To add new tests, edit `test.mjs`:
```javascript
console.log('Test: Your feature');
// Test code here
console.log('✅ Your feature works');
```

## Areas to Contribute

### High Impact
- Performance optimizations (especially BM25 scoring)
- Memory validation tools
- Better error messages
- Installation script improvements

### Medium Impact
- Documentation improvements
- More example memories
- Configuration presets
- Better logging

### Low Impact (but welcome)
- Code style improvements
- Comment updates
- Example scripts

## Pull Request Process

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Write tests** for your changes
4. **Verify tests pass**: `npm test`
5. **Commit with clear messages**: `git commit -m "Add feature: description"`
6. **Push to your fork**: `git push origin feature/your-feature`
7. **Open a Pull Request** with description of changes

## Commit Message Format

```
[type]: [description]

[optional body explaining why]

Types: feat, fix, docs, style, refactor, perf, test, chore
```

Examples:
```
feat: add entity-specific memory queries
fix: prevent NaN scores in BM25
docs: improve README installation section
perf: reduce cluster loading time by 30%
```

## Reporting Issues

Use GitHub Issues with:
- Clear title
- Steps to reproduce
- Expected vs actual behavior
- System info (node version, OpenClaw version)
- Debug logs (if relevant)

## Questions?

Open a Discussion or reach out via Issues.

**Thank you for contributing!**
