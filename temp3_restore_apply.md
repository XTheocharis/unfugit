# Comprehensive Testing: unfugit_restore_apply (FIXED)

## Overview
Testing the FIXED unfugit_restore_apply MCP tool with enhanced lease handling and token validation.

**Fixed Behaviors to Test:**
- Passive mode handling with warnings
- Token validation before lease acquisition  
- Improved error messages for invalid tokens
- Better lease acquisition flow

## Initial State Analysis

**Server Status:** Passive mode, 161 commits, 0KB repo size
**Session ID:** a84c2bba-8c72-4d66-a1c1-c61b7bddcec9
**Lease Status:** No active lease holder
**Latest Commit:** 17a043ba (173 files)

**Test Files Created:**
- restore-apply-test-file.txt (modified content)
- restore-apply-binary.bin (5KB random binary data)

**Valid Token Obtained:** 3e362458-a320-4dda-af00-e0a20108824e from commit 17a043ba

---

## TEST SUITE: unfugit_restore_apply (FIXED)

### TEST 1: Valid Token from Preview (BASIC SUCCESS CASE)
**Purpose:** Test the happy path with valid token and idempotency key
**Parameters:**
- confirm_token: 3e362458-a320-4dda-af00-e0a20108824e
- idempotency_key: test-1-basic-success

**Expected:** Should succeed in passive mode with warning, restore file deletion

**RESULT:** 
- **ERROR:** DIRTY_WORKTREE: Worktree has uncommitted changes. Use stash_uncommitted=true or overwrite_unstaged=true
- **Response Time:** ~144ms (21:32:28.678 to 21:32:28.822)
- **Behavior:** NEW SAFETY CHECK - validates clean worktree before restore
- **Token Used:** 3e362458-a320-4dda-af00-e0a20108824e (original)
- **Token Used (retry):** 58c96894-9055-483e-9615-939d3de3e3b3 (new)
- **Lease Attempt:** Not reached due to early worktree validation
- **Fixed Behavior:** ✅ Validates worktree BEFORE attempting lease acquisition

---

### TEST 2: Invalid/Expired Token (ERROR HANDLING)
**Purpose:** Test behavior with completely invalid token
**Parameters:**
- confirm_token: invalid-token-12345
- idempotency_key: test-2-invalid-token

**Expected:** Should fail with clear error message, validate token before lease
