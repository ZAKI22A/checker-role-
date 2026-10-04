// index.js - Master Runner for Kiliua Intelligence & Checker
const { spawn } = require('child_process');

const children = [];
let shuttingDown = false;

function run(file) {
    console.log(`[START] Starting ${file}...`);
    const p = spawn(process.execPath, [file], { stdio: 'inherit' });
    children.push(p);

    p.on('exit', (code, signal) => {
        const idx = children.indexOf(p);
        if (idx !== -1) children.splice(idx, 1);
        if (shuttingDown) return;
        console.log(`[EXIT] ${file} exited with code ${code || signal}. Restarting in 5s...`);
        setTimeout(() => run(file), 5000);
    });
}

function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[SHUTDOWN] Gracefully stopping all child processes...');
    for (const child of children) {
        try { child.kill('SIGTERM'); } catch {}
    }
    setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('checker.js');
run('bot.js');
