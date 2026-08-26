const { spawn } = require('child_process');

function run(file) {
    console.log(`[START] Starting ${file}...`);
    const p = spawn('node', [file], { stdio: 'inherit' });
    p.on('exit', (code) => {
        console.log(`[EXIT] ${file} exited with code ${code}. Restarting...`);
        setTimeout(() => run(file), 5000);
    });
}

run('checker.js');
run('bot.js');
