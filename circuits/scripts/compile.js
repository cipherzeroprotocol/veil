const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CIRCUIT_DIR = path.join(__dirname, '../src');
const BUILD_DIR = path.join(__dirname, '../build');

// Circuits to compile
const circuits = [
  { name: 'withdraw', levels: 20 } // Assuming withdraw.circom is the main circuit
];

// Create build directory if it doesn't exist
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

function compileCircuits() {
  try {
    console.log('Starting Circom compilation...');

    for (const circuit of circuits) {
      const { name } = circuit;
      console.log(`\nCompiling ${name}.circom...`);

      const circuitPath = path.join(CIRCUIT_DIR, `${name}.circom`);
      const r1csPath = path.join(BUILD_DIR, `${name}.r1cs`); // For setup script
      const wasmDir = path.join(BUILD_DIR, `${name}_js`); // For witness generation later

      // Compile circuit to r1cs, wasm, and sym
      // Output directory structure:
      // build/withdraw.r1cs
      // build/withdraw.sym
      // build/withdraw_js/withdraw.wasm
      // build/withdraw_js/witness_calculator.js
      const compileCmd = `circom ${circuitPath} --r1cs --wasm --sym -o ${BUILD_DIR}`;
      execSync(compileCmd, { stdio: 'inherit' });

      console.log(`Circuit ${name} compiled successfully!`);
      console.log(` - R1CS: ${r1csPath}`);
      console.log(` - WASM: ${path.join(wasmDir, `${name}.wasm`)}`);
    }

    console.log('\nCircom compilation finished!');

  } catch (error) {
    console.error('Error during Circom compilation:', error);
    process.exit(1);
  }
}

// Run the compilation
compileCircuits();