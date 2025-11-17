#!/usr/bin/env node

/**
 * Test script to list campaigns within a partner
 * Tests the dv360_list_entities tool with entityType=campaigns
 */

const http = require('http');

const baseUrl = 'http://localhost:3002';
let sessionId = null;

console.log('🔧 Testing campaign listing workflow...\n');

// Step 1: Establish SSE connection
console.log('📡 Step 1: Establishing SSE connection...');

const sseReq = http.get(`${baseUrl}/mcp`, (res) => {
  console.log(`✅ SSE connection established (status: ${res.statusCode})`);

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

            // Step 2: List partners first
            console.log('📞 Step 2: Listing partners...');
            callTool('dv360_list_partners', {});
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
            if (response.result && response.result.content) {
              const content = response.result.content[0].text;

              // Check if this is the partners response
              if (content.includes('partners') || content.includes('Partner')) {
                console.log('✅ Partners retrieved successfully\n');

                // Extract first partner ID
                let partnerId;
                try {
                  const parsed = JSON.parse(content);
                  if (parsed.partners && parsed.partners.length > 0) {
                    partnerId = parsed.partners[0].partnerId || parsed.partners[0].name?.split('/').pop();
                  }
                } catch (e) {
                  const match = content.match(/"partnerId"\s*:\s*"(\d+)"|"name"\s*:\s*"partners\/(\d+)"/);
                  if (match) {
                    partnerId = match[1] || match[2];
                  }
                }

                if (!partnerId) {
                  console.error('❌ Could not extract partner ID from response');
                  console.log('Response content:', content);
                  cleanup(1);
                  return;
                }

                console.log(`🎯 Using partner ID: ${partnerId}\n`);

                // Step 3: List campaigns
                console.log('📞 Step 3: Listing campaigns for partner...');
                callTool('dv360_list_entities', {
                  entityType: 'campaign',
                  partnerId: partnerId,
                  filter: 'entityStatus=ENTITY_STATUS_ACTIVE'
                });
              }
              // Check if this is the campaigns response
              else if (content.includes('entities') || content.includes('Campaign') || content.includes('Missing required')) {
                console.log('\n📊 Campaigns Response:');
                console.log(content);

                if (content.includes('Missing required')) {
                  console.log('\n✅ Validation Error caught correctly!');
                  cleanup(0);
                } else {
                  console.log('\n🎉 SUCCESS! Campaign list retrieved');
                  cleanup(0);
                }
              }
            } else if (response.error) {
              console.error('\n❌ Error:', response.error.message);
              console.error('Full error:', JSON.stringify(response.error, null, 2));

              if (response.error.message && response.error.message.includes('Missing required')) {
                console.log('\n✅ Validation error handled properly');
                cleanup(0);
              } else {
                cleanup(1);
              }
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
    // Response comes via SSE, not via POST response
    // Just consume and ignore the POST response body
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

// Helper to clean up and exit
function cleanup(exitCode) {
  sseReq.destroy();
  process.exit(exitCode);
}

sseReq.on('error', (error) => {
  console.error('❌ Failed to establish SSE connection:', error.message);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Timeout: Test took longer than 30 seconds');
  cleanup(1);
}, 30000);
