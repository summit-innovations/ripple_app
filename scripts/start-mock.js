// Starts Expo with the mock BLE transport forced on (works the same in PowerShell and bash).
const { spawn } = require('child_process');

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_USE_MOCK_BLE: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
