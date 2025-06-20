/**
 * Main test runner script
 * Imports and runs all test modules
 */

import { spawn } from 'bun';
import { join, dirname } from 'path';
import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Run a command and return its output
 */
async function runCommand(command, args, cwd = __dirname) {
  console.log(`${colors.blue}Running command: ${command} ${args.join(' ')}${colors.reset}`);
  
  const proc = spawn([command, ...args], {
    cwd,
    stdout: 'inherit',
    stderr: 'inherit'
  });

  if (!proc.success) {
    throw new Error(`Command failed with exit code ${proc.exitCode}`);
  }
}

/**
 * Build the project
 */
async function buildProject() {
  console.log(`\n${colors.cyan}===== Building project =====${colors.reset}\n`);
  await runCommand('npm', ['run', 'build']);
}

/**
 * Import and run all test modules
 */
async function runTestModules() {
  console.log(`\n${colors.cyan}===== Running tests =====${colors.reset}\n`);
  
  // Define static test module paths relative to this file
  // We need to use relative paths with extension for ES modules
  const testModules = [
    './test.js',
    './test-directory-creation.js',
    './test-allowed-directories.js',
    './test-blocked-commands.js',
    './test-home-directory.js'
  ];
  
  // Dynamically find additional test files (optional)
  // Use the current directory (no need for a subdirectory)
  try {
    const files = await fs.readdir(__dirname);
    for (const file of files) {
      // Only include files that aren't already in the testModules list
      if (file.startsWith('test-') && file.endsWith('.js') && !testModules.includes(`./${file}`)) {
        testModules.push(`./${file}`);
      }
    }
  } catch (error) {
    console.warn(`${colors.yellow}Warning: Could not scan test directory: ${error.message}${colors.reset}`);
  }
  
  // Results tracking
  let passed = 0;
  let failed = 0;
  const failedTests = [];
  
  // Import and run each test module
  for (const modulePath of testModules) {
    try {
      console.log(`\n${colors.cyan}Running test module: ${modulePath}${colors.reset}`);
      
      // Dynamic import of the test module
      const testModule = await import(modulePath);
      
      // Get the default exported function
      if (typeof testModule.default !== 'function') {
        console.warn(`${colors.yellow}Warning: ${modulePath} does not export a default function${colors.reset}`);
        continue;
      }
      
      // Execute the test
      const success = await testModule.default();
      
      if (success) {
        console.log(`${colors.green}✓ Test passed: ${modulePath}${colors.reset}`);
        passed++;
      } else {
        console.error(`${colors.red}✗ Test failed: ${modulePath}${colors.reset}`);
        failed++;
        failedTests.push(modulePath);
      }
    } catch (error) {
      console.error(`${colors.red}✗ Error importing or running ${modulePath}: ${error.message}${colors.reset}`);
      failed++;
      failedTests.push(modulePath);
    }
  }
  
  // Print summary
  console.log(`\n${colors.cyan}===== Test Summary =====${colors.reset}\n`);
  console.log(`Total tests: ${passed + failed}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  
  if (failed > 0) {
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`\nFailed tests:`);
    failedTests.forEach(test => console.log(`${colors.red}- ${test}${colors.reset}`));
    return false;
  } else {
    console.log(`\n${colors.green}All tests passed! 🎉${colors.reset}`);
    return true;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(`${colors.cyan}===== Starting test runner =====\n${colors.reset}`);
    
    // Build the project first
    await buildProject();
    
    // Run all test modules
    const success = await runTestModules();
    
    // Exit with appropriate code
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unhandled error: ${error}${colors.reset}`);
  process.exit(1);
});
