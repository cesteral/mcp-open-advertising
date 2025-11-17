#!/usr/bin/env node

/**
 * Simple test script to call the dv360_list_partners tool
 * This demonstrates real DV360 API integration
 */

const http = require('http');

const baseUrl = 'http://localhost:3002';
let sessionId = null;

console.log('🔧 Testing dv360_list_partners tool with real DV360 API...\n');

// Step 1: Establish SSE connection to get sessionId
console.log('📡 Step 1: Establishing SSE connection...');

const sseReq = http.get(`${baseUrl}/mcp`, (res) => {
  console.log(`✅ SSE connection established (status: ${res.statusCode})`);

  res.on('data', (chunk) => {
    const data = chunk.toString();

    // Parse SSE events to extract sessionId
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.startsWith('event: endpoint')) {
        // Next line should have data with sessionId
        const dataLine = lines[lines.indexOf(line) + 1];
        if (dataLine && dataLine.startsWith('data: ')) {
          const endpoint = dataLine.substring(6).trim();
          const match = endpoint.match(/sessionId=([^&]+)/);
          if (match) {
            sessionId = match[1];
            console.log(`✅ Got sessionId: ${sessionId}\n`);

            // Step 2: Send list_partners command
            console.log('📞 Step 2: Calling dv360_list_partners tool...');

            const payload = JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: {
                name: 'dv360_list_partners',
                arguments: {}
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
              let responseData = '';

              postRes.on('data', (chunk) => {
                responseData += chunk;
              });

              postRes.on('end', () => {
                try {
                  const result = JSON.parse(responseData);
                  console.log('\n📊 DV360 API Response:');
                  console.log(JSON.stringify(result, null, 2));

                  if (result.result && result.result.content) {
                    console.log('\n🎉 SUCCESS! Real DV360 partners retrieved:');
                    console.log(result.result.content[0].text);
                  } else if (result.error) {
                    console.error('\n❌ Error:', result.error.message);
                  }
                } catch (e) {
                  console.error('❌ Failed to parse response:', responseData);
                }

                // Close SSE connection
                sseReq.destroy();
                process.exit(result.error ? 1 : 0);
              });
            });

            postReq.on('error', (error) => {
              console.error('❌ POST request failed:', error.message);
              sseReq.destroy();
              process.exit(1);
            });

            postReq.write(payload);
            postReq.end();
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

sseReq.on('error', (error) => {
  console.error('❌ Failed to establish SSE connection:', error.message);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  if (!sessionId) {
    console.error('❌ Timeout: Failed to get sessionId within 30 seconds');
    sseReq.destroy();
    process.exit(1);
  }
}, 30000);
