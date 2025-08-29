# Comprehensive Testing: unfugit_trace_lines MCP Tool

## Test Overview
This document logs all commands, outputs, and results for comprehensive testing of the `unfugit_trace_lines` MCP tool.

**Test Date:** 2025-08-29
**Tool:** unfugit_trace_lines
**Purpose:** Test line-level history tracking including:
- Trace specific lines in files
- Trace line ranges  
- Trace through file renames
- Trace through merges
- Trace with different context amounts
- Trace deleted/moved lines
- Trace in different file types
- Trace with line number changes
- Complex refactoring scenarios
- Edge cases like empty files, binary files

## Initial Setup

Starting unfugit server...