// Complex JavaScript file for line tracing tests
function calculateSum(a, b) {
    // Added validation for better robustness
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Both arguments must be numbers');
    }
    return a + b;
}

function calculateProduct(a, b) {
    return a * b;
}

class MathUtils {
    static PI = 3.14159;
    
    static circleArea(radius) {
        return this.PI * radius * radius;
    }
    
    static circleCircumference(radius) {
        return 2 * this.PI * radius;
    }
}

// Export functions
module.exports = {
    calculateSum,
    calculateProduct,
    MathUtils
};