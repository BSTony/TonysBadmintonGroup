const http = require('http');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');

async function runPerformanceTest() {
  console.log('--- Starting Performance & Compression Verification ---');
  
  // 1. Check index.js syntax & require express setup
  process.env.LIFF_ID = 'test-liff-id-12345';
  process.env.PORT = '9988';
  
  // Require index.js in a separate child process or run test server
  const { fork } = require('child_process');
  let readyResolve;
  const readyPromise = new Promise(resolve => { readyResolve = resolve; });

  const serverProc = fork(path.join(__dirname, '../../index.js'), [], {
    env: { ...process.env, PORT: '9988', LIFF_ID: 'test-liff-id-12345' },
    silent: true
  });

  serverProc.stdout.on('data', (d) => {
    const s = d.toString();
    console.log('[Server stdout]:', s.trim());
    if (s.includes('Badminton Bot Running on port')) {
      readyResolve();
    }
  });
  serverProc.stderr.on('data', (d) => {
    console.error('[Server stderr]:', d.toString());
  });

  // Wait for server to start or timeout 8s
  await Promise.race([
    readyPromise,
    new Promise(resolve => setTimeout(resolve, 8000))
  ]);

  function makeRequest(urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 9988,
        path: urlPath,
        method: 'GET',
        headers: headers
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            rawBuffer: buffer
          });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    // Test 1: Fetch HTML and check window.__INITIAL_CONFIG__
    console.log('\n[Test 1] Verifying / (HTML):');
    const htmlRes = await makeRequest('/', { 'Accept-Encoding': 'gzip' });
    console.log('HTTP Status:', htmlRes.statusCode);
    console.log('Cache-Control:', htmlRes.headers['cache-control']);
    console.log('Content-Encoding:', htmlRes.headers['content-encoding']);

    let htmlBody = htmlRes.rawBuffer;
    if (htmlRes.headers['content-encoding'] === 'gzip') {
      htmlBody = zlib.gunzipSync(htmlBody).toString('utf8');
    } else {
      htmlBody = htmlBody.toString('utf8');
    }

    if (htmlBody.includes('window.__INITIAL_DATA__ =')) {
      console.log('✅ PASS: window.__INITIAL_DATA__ (Server-Side Injected Games) successfully found in HTML!');
    } else {
      console.error('❌ FAIL: window.__INITIAL_DATA__ missing in HTML!');
      process.exitCode = 1;
    }

    if (htmlBody.includes('window.__INITIAL_CONFIG__ = { liffId: "test-liff-id-12345" }')) {
      console.log('✅ PASS: window.__INITIAL_CONFIG__ successfully injected into HTML!');
    } else {
      console.error('❌ FAIL: window.__INITIAL_CONFIG__ not found in HTML!');
      process.exitCode = 1;
    }

    if (htmlBody.includes('defer src="app.js')) {
      console.log('✅ PASS: app.js and other non-blocking scripts have defer attribute!');
    } else {
      console.error('❌ FAIL: defer attribute missing on app.js!');
      process.exitCode = 1;
    }

    if (htmlBody.includes('rel="preconnect" href="https://static.line-scdn.net"')) {
      console.log('✅ PASS: Preconnect to LINE CDN present in head!');
    } else {
      console.error('❌ FAIL: Preconnect to LINE CDN missing!');
      process.exitCode = 1;
    }

    // Test 2: Fetch /app.js with gzip
    console.log('\n[Test 2] Verifying /app.js Compression & Caching:');
    const jsRes = await makeRequest('/app.js', { 'Accept-Encoding': 'gzip' });
    console.log('HTTP Status:', jsRes.statusCode);
    console.log('Cache-Control:', jsRes.headers['cache-control']);
    console.log('Content-Encoding:', jsRes.headers['content-encoding']);
    console.log('ETag:', jsRes.headers['etag']);

    const rawJsSize = fs.statSync(path.join(__dirname, '../../public/app.js')).size;
    const gzippedJsSize = jsRes.rawBuffer.length;
    const compressionRatio = ((1 - (gzippedJsSize / rawJsSize)) * 100).toFixed(1);

    console.log(`Original app.js size: ${(rawJsSize / 1024).toFixed(1)} KB`);
    console.log(`Transferred gzipped size: ${(gzippedJsSize / 1024).toFixed(1)} KB`);
    console.log(`Bandwidth reduction: ${compressionRatio}%`);

    if (jsRes.headers['content-encoding'] === 'gzip' && gzippedJsSize < rawJsSize * 0.3) {
      console.log('✅ PASS: Gzip compression active! Over 70% payload size reduction!');
    } else {
      console.error('❌ FAIL: Gzip compression not active or not working properly.');
      process.exitCode = 1;
    }

    if (jsRes.headers['cache-control'] && jsRes.headers['cache-control'].includes('public')) {
      console.log('✅ PASS: Static asset caching header correctly configured!');
    } else {
      console.error('❌ FAIL: Cache-Control missing public cache directive.');
      process.exitCode = 1;
    }

    // Test 3: Verify /style.css caching & compression
    console.log('\n[Test 3] Verifying /style.css:');
    const cssRes = await makeRequest('/style.css', { 'Accept-Encoding': 'gzip' });
    console.log('HTTP Status:', cssRes.statusCode);
    console.log('Content-Encoding:', cssRes.headers['content-encoding']);
    console.log('Cache-Control:', cssRes.headers['cache-control']);
    if (cssRes.headers['content-encoding'] === 'gzip') {
      console.log('✅ PASS: style.css is gzipped!');
    }

  } catch (err) {
    console.error('Test error:', err);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
    console.log('\n--- Performance Test Completed ---');
  }
}

runPerformanceTest();
