const { createClient } = require('@libsql/client');

try {
  createClient({ url: 'file:C:\\Users\\Admin\\AppData\\ie-offline.db' });
  console.log('Test 1: Absolute Windows Path: SUCCESS');
} catch (e) {
  console.log('Test 1: Absolute Windows Path: FAILED - ' + e.message);
}

try {
  createClient({ url: 'undefined' });
  console.log('Test 2: Literal undefined: SUCCESS');
} catch (e) {
  console.log('Test 2: Literal undefined: FAILED - ' + e.message);
}

try {
  createClient({ url: 'file:undefined' });
  console.log('Test 3: file:undefined: SUCCESS');
} catch (e) {
  console.log('Test 3: file:undefined: FAILED - ' + e.message);
}
