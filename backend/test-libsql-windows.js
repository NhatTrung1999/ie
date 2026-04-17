const { createClient } = require('@libsql/client');
const os = require('os');
const path = require('path');
const fs = require('fs');

const userData = path.join(os.homedir(), 'AppData', 'Roaming', 'ie-offline-test');
if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true });
}
const dbPath = path.join(userData, 'ie-offline.db');

const testCases = [
  `file:${dbPath}`,                          // Exact output of server-manager.ts
  `file:///${dbPath.replace(/\\/g, '/')}`,   // POSIX style URL
  dbPath                                     // No prefix
];

for (const t of testCases) {
  try {
    const client = createClient({ url: t });
    console.log(`PASS: ${t}`);
  } catch (e) {
    console.log(`FAIL: ${t} - Error: ${e.message}`);
  }
}
