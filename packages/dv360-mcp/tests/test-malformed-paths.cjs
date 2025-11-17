#!/usr/bin/env node

/**
 * Test to demonstrate malformed API paths when parent IDs are missing
 * This test shows WHY schema-level validation is necessary
 */

const http = require('http');

const baseUrl = 'http://localhost:3002';
let sessionId = null;

console.log('🔍 Testing for malformed API paths with missing parent IDs...\n');

const testCase = {
  name: 'Get campaign WITHOUT advertiserId',
  toolName: 'dv360_get_entity',
  args: {
    entityType: 'campaign',
    campaignId: '12345'
    // Missing advertiserId - will this create malformed path?
  }
};

// Step 1: Establish SSE connection
console.log('📡 Step 1: Establishing SSE connection...');

const sseReq = http.get(`${baseUrl}/mcp`, (res) => {
  console.log(`✅ SSE connection established (status: ${res.statusCode})\n`);

  res.on('data', (chunk) => {
    const data = chunk.toString();
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

            // Run test
            console.log(`🧪 Test: ${testCase.name}`);
            console.log(`   Tool: ${testCase.toolName}`);
            console.log(`   Args: ${JSON.stringify(testCase.args, null, 2)}`);
            console.log('\n   Expected: Schema validation error OR service validation error');
            console.log('   Problem: If neither catches it, will create malformed API path:\n');
            console.log('   ❌ /advertisers//campaigns/12345');
            console.log('                   ^^ empty advertiserId\n');

            callTool(testCase.toolName, testCase.args);
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

            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📊 RESULT:\n');

            if (response.error) {
              const errorMsg = response.error.message;

              // Check what kind of error we got
              if (errorMsg.includes('Missing required')) {
                console.log('✅ GOOD: Validation caught missing parent ID');
                console.log(`   Error: ${errorMsg}`);
                console.log('\n   Validation layer: Schema or Service');
                cleanup(0);
              } else if (errorMsg.includes('Entity ID is required')) {
                console.log('⚠️  PARTIAL: Service caught missing entity ID');
                console.log(`   Error: ${errorMsg}`);
                console.log('\n   Note: This validates entityId but not parent IDs');
                cleanup(0);
              } else if (errorMsg.includes('404') || errorMsg.includes('400')) {
                console.log('❌ BAD: Validation missed - API returned HTTP error');
                console.log(`   Error: ${errorMsg}`);
                console.log('\n   This means a malformed request reached the DV360 API!');
                console.log('   The API path likely was: /advertisers//campaigns/12345');
                console.log('\n   🚨 RECOMMENDATION: Add schema-level validation to prevent this!');
                cleanup(1);
              } else {
                console.log('⚠️  UNKNOWN ERROR:');
                console.log(JSON.stringify(response.error, null, 2));
                cleanup(1);
              }
            } else if (response.result) {
              console.log('❌ VERY BAD: Request succeeded when it should have failed!');
              console.log('   This should never happen for a missing advertiserId');
              cleanup(1);
            }
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
    postRes.on('data', () => {});
    postRes.on('end', () => {});
  });

  postReq.on('error', (error) => {
    console.error(`❌ POST request failed:`, error.message);
    cleanup(1);
  });

  postReq.write(payload);
  postReq.end();
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

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Timeout: Test took longer than 30 seconds');
  cleanup(1);
}, 30000);
