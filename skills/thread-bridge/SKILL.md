name: thread-bridge
version: 0.2.0
description: "Controlled cross-thread operations for Discord forum channels and channel threads: refresh, split, and fresh post/thread creation with auto-context detection and effort levels."
author: OpenClaw Subagent
entry: index.js
commands: []
exports:
  - refreshThread
  - splitThread
  - freshThread
  - getCallerContext
permissions:
  - channels.discord
  - memory.core
