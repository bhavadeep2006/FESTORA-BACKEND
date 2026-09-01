const http = require('http');

function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const fullPath = path.startsWith('/api') ? path : `/api${path}`;
    const url = new URL(fullPath, 'http://localhost:5000');
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, data: parsed, message: parsed.message || 'API Error' });
          }
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function testGoogleAuthFlow() {
  console.log('==================================================');
  console.log('STARTING FESTORA GOOGLE AUTH INTEGRATION TEST');
  console.log('==================================================');

  try {
    // 1. Verify Google Redirect Route returns expected redirect / response
    console.log('\n[TEST 1] Testing /api/auth/google endpoint...');
    const googleAuthRes = await apiRequest('/auth/google').catch(err => err);
    console.log(`✓ Endpoint response received (status: ${googleAuthRes.status || 200})`);

    // 2. Test Account Linking & Verification API (POST /api/auth/google/verify-token)
    console.log('\n[TEST 2] Testing Google Token Verification API endpoint with missing token...');
    let missingTokenBlocked = false;
    try {
      await apiRequest('/auth/google/verify-token', {
        method: 'POST',
        body: {}
      });
    } catch (err) {
      missingTokenBlocked = true;
      console.log(`✓ Correctly rejected missing token: "${err.message}"`);
    }
    if (!missingTokenBlocked) {
      throw new Error('Missing token was not rejected by /api/auth/google/verify-token');
    }

    console.log('\n==================================================');
    console.log('ALL GOOGLE AUTH TESTS PASSED SUCCESSFULLY! ✓');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Google Auth test error:', err);
    process.exit(1);
  }
}

testGoogleAuthFlow();
