pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/*
 * Verifies that a value is non-zero
 */
template IsNonZero() {
    signal input in;
    signal output out;
    
    signal inverse;
    inverse <-- in!=0 ? 1/in : 0;
    
    out <== inverse * in;
    
    // Check constraint: if in is non-zero, out must be 1
    out * (out - 1) === 0;
    
    // Check that if in is non-zero, out is 1
    in * (out - 1) === 0;
}

/*
 * Checks if a value is greater than or equal to a minimum value
 */
template GreaterThanOrEqual(bits) {
    signal input in[2];
    signal output out;
    
    // Use standard comparator
    component gt = GreaterThan(bits);
    gt.in[0] <== in[0];
    gt.in[1] <== in[1];
    
    // Check if equal
    component eq = IsEqual();
    eq.in[0] <== in[0];
    eq.in[1] <== in[1];
    
    // out = (a > b) || (a == b)
    out <== gt.out + eq.out - gt.out * eq.out;
}

/*
 * Calculates the absolute value of the difference between two inputs
 */
template AbsoluteDifference(bits) {
    signal input in[2];
    signal output out;
    
    // Check if a >= b
    component gte = GreaterThanOrEqual(bits);
    gte.in[0] <== in[0];
    gte.in[1] <== in[1];
    
    // Calculate absolute difference
    signal diff1;
    signal diff2;
    diff1 <== in[0] - in[1];
    diff2 <== in[1] - in[0];
    
    // Select the positive difference
    out <== gte.out * diff1 + (1 - gte.out) * diff2;
}

/*
 * Range check ensures a value is between min and max (inclusive)
 */
template RangeCheck(bits) {
    signal input value;
    signal input min;
    signal input max;
    signal output inRange;
    
    // Check if value >= min
    component gteMin = GreaterThanOrEqual(bits);
    gteMin.in[0] <== value;
    gteMin.in[1] <== min;
    
    // Check if value <= max
    component gteMax = GreaterThanOrEqual(bits);
    gteMax.in[0] <== max;
    gteMax.in[1] <== value;
    
    // In range if value >= min && value <= max
    inRange <== gteMin.out * gteMax.out;
}

/*
 * Converts a 256-bit value to an array of bits
 */
template ValueToBits256() {
    signal input value;
    signal output bits[256];
    
    component n2b = Num2Bits(256);
    n2b.in <== value;
    for (var i = 0; i < 256; i++) {
        bits[i] <== n2b.out[i];
    }
}

/*
 * Converts an array of bits to a number
 */
template BitsToValue(n) {
    signal input bits[n];
    signal output value;
    
    component b2n = Bits2Num(n);
    for (var i = 0; i < n; i++) {
        b2n.in[i] <== bits[i];
    }
    value <== b2n.out;
}