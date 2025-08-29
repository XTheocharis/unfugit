#!/usr/bin/env python3
"""
Test Python file for restore operations
"""

def hello_world():
    """Print hello world"""
    print("Hello, World!")
    return "success"

def calculate_sum(a, b):
    """Calculate sum of two numbers"""
    return a + b

if __name__ == "__main__":
    hello_world()
    result = calculate_sum(5, 3)
    print(f"Sum: {result}")