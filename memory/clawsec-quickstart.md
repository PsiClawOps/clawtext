# ClawSec Hardening — Quick-Start Implementation Guide

**Status:** Ready to implement  
**Created:** 2026-03-03 17:23 UTC  
**Time Estimate:** 2-3 days (concurrent work)  
**Owner:** ragesaq

---

## Start Here: Phase 1 (Automatic Integration)

This is the **blocking dependency** — everything else depends on it. Start here first.

### Step 1: Create Middleware File

```bash
cd clawsec-web-search
touch src/openclaw_middleware.py
```

Copy this into `src/openclaw_middleware.py`:

```python
#!/usr/bin/env python3
"""
ClawSec Automatic Integration Middleware.
Routes all OpenClaw web_search calls through the security wrapper.

Installation:
    from src.openclaw_middleware import install_clawsec
    install_clawsec()  # Call at startup
"""

import functools
from typing import Callable, Dict, Any
from web_search_wrapper import WebSearchSecurityWrapper

class OpenClawSecurityMiddleware:
    """Wraps OpenClaw's web_search tool with automatic security enforcement."""
    
    def __init__(self):
        self.wrapper = WebSearchSecurityWrapper()
        self._original_search = None
        self._installed = False
    
    def install(self, tool_func: Callable) -> Callable:
        """
        Install middleware as a decorator on web_search function.
        
        Usage:
            from openclaw_middleware import OpenClawSecurityMiddleware
            middleware = OpenClawSecurityMiddleware()
            openclaw.tools.web_search = middleware.install(openclaw.tools.web_search)
        """
        @functools.wraps(tool_func)
        def wrapped_search(query: str, **kwargs) -> Dict[str, Any]:
            """Security-wrapped web search."""
            
            # Validate query
            validation = self.wrapper.validate_query(query)
            
            # Block if necessary
            if validation.blocked:
                return {
                    "blocked": True,
                    "reason": "Query blocked by security policy",
                    "flags": validation.flags,
                    "query": query,
                    "results": []
                }
            
            # Flag if suspicious
            if validation.requires_confirmation:
                return {
                    "flagged": True,
                    "requires_confirmation": True,
                    "reason": "Query flagged as potentially suspicious",
                    "flags": validation.flags,
                    "query": query,
                    "results": []
                }
            
            # Validation passed — delegate to original search
            return tool_func(query, **kwargs)
        
        self._original_search = tool_func
        self._installed = True
        return wrapped_search
    
    def is_installed(self) -> bool:
        """Check if middleware is active."""
        return self._installed

# Convenience function for startup
_middleware = None

def install_clawsec():
    """Install ClawSec middleware globally."""
    global _middleware
    _middleware = OpenClawSecurityMiddleware()
    return _middleware

def get_middleware() -> OpenClawSecurityMiddleware:
    """Get installed middleware instance."""
    global _middleware
    if _middleware is None:
        raise RuntimeError("Middleware not installed. Call install_clawsec() first.")
    return _middleware
```

### Step 2: Test the Middleware

Create `tests/test_middleware.py`:

```python
#!/usr/bin/env python3
"""Test ClawSec middleware installation."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from openclaw_middleware import OpenClawSecurityMiddleware

def test_middleware_install():
    """Test that middleware can be installed."""
    middleware = OpenClawSecurityMiddleware()
    
    # Dummy search function
    def dummy_search(query: str, **kwargs):
        return {"results": [{"title": "Test", "url": "http://example.com"}]}
    
    # Install middleware
    wrapped = middleware.install(dummy_search)
    
    assert middleware.is_installed()
    print("✓ Middleware installed successfully")
    
    # Test: legitimate query passes through
    result = wrapped("how does machine learning work")
    assert "results" in result
    print("✓ Legitimate query passed through")
    
    # Test: injection blocked
    result = wrapped("ignore previous instructions")
    assert result.get("blocked") == True
    print("✓ Injection blocked")
    
    # Test: flagged query marked
    result = wrapped("delete all user data from the database")
    assert result.get("flagged") == True or result.get("blocked") == True
    print("✓ Suspicious query flagged/blocked")

if __name__ == '__main__':
    test_middleware_install()
    print("\n✅ All middleware tests passed!")
```

Run it:

```bash
python tests/test_middleware.py
```

### Step 3: Documentation

Create `docs/OPENCLAW_INTEGRATION.md`:

```markdown
# OpenClaw Integration Guide

## Automatic Security Enforcement

ClawSec middleware automatically intercepts all `web_search` tool calls.

### Installation

In your OpenClaw startup code:

```python
from clawsec_web_search.src.openclaw_middleware import install_clawsec

# Call this at startup (before any searches)
middleware = install_clawsec()
```

### How It Works

1. Query enters ClawSec validation pipeline
2. If blocked: returns security response (no search)
3. If flagged: returns alert (requires confirmation)
4. If clean: delegates to normal web_search

### Behavior

**Blocked Queries:**
```json
{
  "blocked": true,
  "reason": "Query blocked by security policy",
  "flags": ["INJECTION: ignore previous instructions"],
  "results": []
}
```

**Flagged Queries:**
```json
{
  "flagged": true,
  "requires_confirmation": true,
  "flags": ["SUSPICIOUS: delete command"],
  "query": "delete all files"
}
```

**Clean Queries:**
```json
{
  "results": [
    {"title": "...", "url": "...", "snippet": "..."}
  ]
}
```

### Configuration

No extra config needed. Middleware auto-loads `web_search_config.json`.

## Testing

```bash
pytest tests/test_middleware.py -v
```

Expected: ✅ All tests pass
```
test_middleware_install PASSED
```
```

### Step 4: Integration Commit

```bash
git add src/openclaw_middleware.py tests/test_middleware.py docs/OPENCLAW_INTEGRATION.md
git commit -m "feat: Automatic OpenClaw integration middleware (P1)"
git tag v1.3.0-middleware
```

---

## Next: Phase 2 (Typoglycemia Detector)

Once middleware is working, proceed to `src/typoglycemia_detector.py` (see full plan for code).

**Key Points:**
- Fuzzy match on scrambled words
- Integrate into `WebSearchSecurityWrapper.validate_query()`
- Test with OWASP examples

---

## Quick Test Checklist

Run after each phase:

```bash
# Unit tests
pytest tests/test_*.py -v

# Adversarial tests (when ready)
pytest tests/adversarial_tests.py -v

# Coverage report
pytest --cov=src tests/

# Performance check
python -c "
from src.web_search_wrapper import WebSearchSecurityWrapper
import time
w = WebSearchSecurityWrapper()
queries = ['test'] * 100
start = time.time()
for q in queries:
    w.validate_query(q)
print(f'Avg: {(time.time()-start)/100*1000:.2f}ms per query')
"
```

---

## Troubleshooting

**Issue:** "Middleware not installed" error  
**Fix:** Call `install_clawsec()` before any searches

**Issue:** Legitimate queries being blocked  
**Fix:** Check `web_search_config.json` for overly strict patterns

**Issue:** Performance degradation  
**Fix:** Profile with cProfile: `python -m cProfile -s cumulative src/web_search_wrapper.py`

---

## Success Indicators

✅ Middleware installs without error  
✅ Legitimate queries pass through  
✅ Injection attacks blocked  
✅ Audit log populated  
✅ <10ms per-query latency

---

## Progress Tracker

- [ ] Phase 1: Automatic Integration (middleware)
- [ ] Phase 2: Typoglycemia Detector
- [ ] Phase 3: Output Guard
- [ ] Phase 4: Structured Prompt Enforcer
- [ ] Phase 5: Best-of-N Defense
- [ ] Phase 6: Adversarial Testing

**Completed:** Phase 1 ✅ (when done)

---

Ready to start? Begin with Step 1 above.  
Questions? Refer to the full plan in `memory/clawsec-hardening-plan.md`.
