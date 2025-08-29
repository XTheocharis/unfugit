#!/usr/bin/env python3
"""
Test Python file for line tracing
This will go through multiple modifications
"""

def hello_world():
    print("Hello, World!")
    return True

def calculate_sum(a, b):
    # Added validation
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        raise ValueError("Arguments must be numbers")
    result = a + b
    print(f"Sum of {a} and {b} is {result}")
    return result

if __name__ == "__main__":
    hello_world()
    result = calculate_sum(5, 3)
    print(f"Final result: {result}")