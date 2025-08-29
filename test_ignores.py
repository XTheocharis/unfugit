
import json
import sys

# Test 1: List current ignore patterns
test_msg = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "unfugit_ignores",
        "arguments": {"action": "list"}
    }
}

print(json.dumps(test_msg))
sys.stdout.flush()
