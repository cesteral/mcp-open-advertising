#!/usr/bin/env node

/**
 * Comprehensive test script to validate dynamic schema enforcement
 * Tests that required parent IDs are properly enforced for each entity type
 */

const http = require('http');

const baseUrl = 'http://localhost:3002';
let sessionId = null;
let testResults = [];

console.log('🔧 Testing Dynamic Schema Validation...\n');

// Define test cases for different entity types
const testCases = [
  {
    name: 'List partners (no parent IDs required)',
    toolName: 'dv360_list_entities',
    args: { entityType: 'partner' },
    shouldSucceed: true,
    expectedError: null
  },
  {
    name: 'List advertisers WITHOUT partnerId (should fail)',
    toolName: 'dv360_list_entities',
    args: { entityType: 'advertiser' },
    shouldSucceed: false,
    expectedError: 'Missing required parent ID(s) for entity type \'advertiser\': partnerId'
  },
  {
    name: 'List advertisers WITH partnerId (should succeed)',
    toolName: 'dv360_list_entities',
    args: { entityType: 'advertiser', partnerId: '123' },
    shouldSucceed: true,
    expectedError: null
  },
  {
    name: 'List campaigns WITHOUT advertiserId (should fail)',
    toolName: 'dv360_list_entities',
    args: { entityType: 'campaign' },
    shouldSucceed: false,
    expectedError: 'Missing required parent ID(s) for entity type \'campaign\': advertiserId'
  },
  {
    name: 'List campaigns WITH advertiserId (should succeed)',
    toolName: 'dv360_list_entities',
    args: { entityType: 'campaign', advertiserId: '456' },
    shouldSucceed: true,
    expectedError: null
  },
  {
    name: 'List lineItems WITHOUT advertiserId (should fail)',
    toolName: 'dv360_list_entities',
    args: { entityType: 'lineItem' },
    shouldSucceed: false,
    expectedError: 'Missing required parent ID(s) for entity type \'lineItem\': advertiserId'
  },
  {
    name: 'List lineItems WITH advertiserId (should succeed)',
    toolName: 'dv360_list_entities',
    args: { entityType: 'lineItem', advertiserId: '789' },
    shouldSucceed: true,
    expectedError: null
  },
  {
    name: 'Get campaign WITHOUT advertiserId (should fail)',
    toolName: 'dv360_get_entity',
    args: { entityType: 'campaign', campaignId: '123' },
    shouldSucceed: false,
    expectedError: 'Missing required parent ID'
  },
  {
    name: 'Create campaign WITHOUT advertiserId (should fail)',
    toolName: 'dv360_create_entity',
    args: {
      entityType: 'campaign',
      data: { displayName: 'Test Campaign', entityStatus: 'ENTITY_STATUS_DRAFT' }
    },
    shouldSucceed: false,
    expectedError: 'Missing required parent ID'
  },
  {
    name: 'Update lineItem WITHOUT advertiserId (should fail)',
    toolName: 'dv360_update_entity',
    args: {
      entityType: 'lineItem',
      lineItemId: '999',
      data: { entityStatus: 'ENTITY_STATUS_PAUSED' },
      updateMask: 'entityStatus'
    },
    shouldSucceed: false,
    expectedError: 'Missing required parent ID'
  }
];

let currentTestIndex = 0;

// Step 1: Establish SSE connection
console.log('📡 Step 1: Establishing SSE connection...');

const sseReq = http.get(`${baseUrl}/mcp`, (res) => {
  console.log(`✅ SSE connection established (status: ${res.statusCode})\n`);

  let sseBuffer = '';

  res.on('data', (chunk) => {
    const data = chunk.toString();
    sseBuffer += data;

    // Parse SSE events
    const lines = data.split('\n');
    for (const line of lines) {
      // Extract sessionId from endpoint event
      if (line.startsWith('event: endpoint')) {
        const dataLine = lines[lines.indexOf(line) + 1];
        if (dataLine && dataLine.startsWith('data: ')) {
          const endpoint = dataLine.substring(6).trim();
          const match = endpoint.match(/sessionId=([^&]+)/);
          if (match && !sessionId) {
            sessionId = match[1];
            console.log(`✅ Got sessionId: ${sessionId}\n`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Start running tests
            runNextTest();
          }
        }
      }

      // Parse message events containing JSON-RPC responses
      if (line.startsWith('event: message')) {
        const dataLine = lines[lines.indexOf(line) + 1];
        if (dataLine && dataLine.startsWith('data: ')) {
          try {
            const jsonData = dataLine.substring(6).trim();
            const response = JSON.parse(jsonData);

            // Handle response
            handleTestResponse(response);
          } catch (e) {
            // Not JSON, skip
          }
        }
      }
    }
  });

  res.on('error', (error) => {
    console.error('❌ SSE connection error:', error.message);
    process.exit(1);
  });
});

// Run the next test case
function runNextTest() {
  if (currentTestIndex >= testCases.length) {
    // All tests complete
    printTestSummary();
    cleanup(testResults.some(r => !r.passed) ? 1 : 0);
    return;
  }

  const testCase = testCases[currentTestIndex];
  console.log(`🧪 Test ${currentTestIndex + 1}/${testCases.length}: ${testCase.name}`);
  console.log(`   Tool: ${testCase.toolName}`);
  console.log(`   Args: ${JSON.stringify(testCase.args, null, 2)}`);

  callTool(testCase.toolName, testCase.args);
}

// Handle test response
function handleTestResponse(response) {
  const testCase = testCases[currentTestIndex];
  let passed = false;
  let actualResult = '';

  if (response.error) {
    // Got an error
    actualResult = `Error: ${response.error.message}`;

    if (!testCase.shouldSucceed) {
      // Expected an error
      if (testCase.expectedError && response.error.message.includes(testCase.expectedError)) {
        passed = true;
        console.log(`   ✅ PASS: Got expected error\n`);
      } else {
        passed = false;
        console.log(`   ❌ FAIL: Got different error than expected`);
        console.log(`   Expected: ${testCase.expectedError}`);
        console.log(`   Actual: ${response.error.message}\n`);
      }
    } else {
      // Expected success but got error
      passed = false;
      console.log(`   ❌ FAIL: Expected success but got error`);
      console.log(`   Error: ${response.error.message}\n`);
    }
  } else if (response.result) {
    // Got success
    actualResult = 'Success';

    if (testCase.shouldSucceed) {
      passed = true;
      console.log(`   ✅ PASS: Got expected success\n`);
    } else {
      passed = false;
      console.log(`   ❌ FAIL: Expected error but got success\n`);
    }
  }

  testResults.push({
    name: testCase.name,
    passed,
    expected: testCase.shouldSucceed ? 'Success' : `Error: ${testCase.expectedError}`,
    actual: actualResult
  });

  // Move to next test
  currentTestIndex++;
  setTimeout(() => runNextTest(), 100); // Small delay between tests
}

// Helper function to call a tool
function callTool(toolName, args) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1000000),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  });

  const postReq = http.request({
    hostname: 'localhost',
    port: 3002,
    path: `/mcp?sessionId=${sessionId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (postRes) => {
    // Response comes via SSE, not via POST response
    postRes.on('data', () => {});
    postRes.on('end', () => {});
  });

  postReq.on('error', (error) => {
    console.error(`❌ POST request failed for ${toolName}:`, error.message);
    cleanup(1);
  });

  postReq.write(payload);
  postReq.end();
}

// Print test summary
function printTestSummary() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     Expected: ${r.expected}`);
      console.log(`     Actual: ${r.actual}`);
    });
    console.log('');
  }

  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED! Dynamic schema validation is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Review the results above.\n');
  }
}

// Helper to clean up and exit
function cleanup(exitCode) {
  sseReq.destroy();
  setTimeout(() => process.exit(exitCode), 100);
}

sseReq.on('error', (error) => {
  console.error('❌ Failed to establish SSE connection:', error.message);
  console.error('   Make sure the dv360-mcp server is running on port 3002');
  console.error('   Run: cd packages/dv360-mcp && pnpm run dev:http');
  process.exit(1);
});

// Timeout after 60 seconds
setTimeout(() => {
  console.error('❌ Timeout: Test suite took longer than 60 seconds');
  cleanup(1);
}, 60000);
