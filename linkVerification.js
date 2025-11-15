
const https = require('https');
const http = require('http');
const { URL } = require('url');

class LinkVerificationSystem {
    constructor() {
        // Known malicious domains and patterns
        this.maliciousDomains = new Set([
            'discord-nitro.org', 'discord-nitro.com', 'discord-app.org',
            'discordapp.org', 'discord-gift.org', 'steam-discord.com',
            'discord-steam.com', 'steam-nitro.com', 'discord-free.com',
            'discrod.com', 'discordapp.io', 'discord-gifts.com',
            'steamscomunnity.com', 'steamcornmunity.com', 'steamcomminity.com',
            'discordnitro.org', 'discord-rewards.com', 'discord-promo.com',
            'bit.ly', 'tinyurl.com', 'shorturl.at', 'rb.gy', 't.co'
        ]);

        // Suspicious patterns in URLs
        this.suspiciousPatterns = [
            /discord.*nitro/i,
            /free.*nitro/i,
            /discord.*gift/i,
            /steam.*gift/i,
            /free.*robux/i,
            /free.*vbucks/i,
            /token.*generator/i,
            /hack.*discord/i,
            /grab.*token/i,
            /ip.*grab/i,
            /phish/i,
            /scam/i,
            /virus/i,
            /malware/i,
            /trojan/i
        ];

        // Safe domains whitelist
        this.safeDomains = new Set([
            'discord.com', 'discord.gg', 'discordapp.com',
            'github.com', 'gitlab.com', 'stackoverflow.com',
            'youtube.com', 'youtu.be', 'twitch.tv',
            'twitter.com', 'x.com', 'reddit.com',
            'google.com', 'microsoft.com', 'amazon.com',
            'wikipedia.org', 'mozilla.org', 'w3.org'
        ]);

        // Request timeout and user agent
        this.requestTimeout = 5000;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }

    // Extract URLs from message content
    extractUrls(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        return text.match(urlRegex) || [];
    }

    // Check if domain is suspicious
    isDomainSuspicious(domain) {
        const normalizedDomain = domain.toLowerCase();
        
        // Check against known malicious domains
        if (this.maliciousDomains.has(normalizedDomain)) {
            return { suspicious: true, reason: 'Known malicious domain' };
        }

        // Check for typosquatting of popular domains
        const popularDomains = ['discord.com', 'steam.com', 'youtube.com', 'google.com'];
        for (const popularDomain of popularDomains) {
            if (this.isTyposquatting(normalizedDomain, popularDomain)) {
                return { suspicious: true, reason: `Typosquatting of ${popularDomain}` };
            }
        }

        // Check for suspicious TLDs
        const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.xyz', '.click', '.download'];
        const domainParts = normalizedDomain.split('.');
        const tld = domainParts.length > 1 ? '.' + domainParts[domainParts.length - 1] : '';
        if (suspiciousTlds.includes(tld)) {
            return { suspicious: true, reason: 'Suspicious TLD' };
        }

        return { suspicious: false };
    }

    // Check for typosquatting
    isTyposquatting(domain, target) {
        // Levenshtein distance calculation
        const distance = this.levenshteinDistance(domain, target);
        const similarity = 1 - (distance / Math.max(domain.length, target.length));
        
        // If very similar but not exact match, likely typosquatting
        return similarity > 0.8 && domain !== target;
    }

    // Calculate Levenshtein distance
    levenshteinDistance(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[str2.length][str1.length];
    }

    // Check URL patterns
    checkUrlPatterns(url) {
        for (const pattern of this.suspiciousPatterns) {
            if (pattern.test(url)) {
                return { suspicious: true, reason: `Suspicious pattern: ${pattern.source}` };
            }
        }
        return { suspicious: false };
    }

    // Analyze webpage content
    async analyzeWebpageContent(url) {
        return new Promise((resolve) => {
            try {
                const parsedUrl = new URL(url);
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: 'GET',
                    headers: { 'User-Agent': this.userAgent },
                    timeout: this.requestTimeout
                };

                const client = parsedUrl.protocol === 'https:' ? https : http;
                
                const req = client.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                        if (data.length > 10000) { // Limit data size
                            req.destroy();
                        }
                    });
                    
                    res.on('end', () => {
                        try {
                            // Basic HTML parsing without cheerio
                            const titleMatch = data.match(/<title[^>]*>([^<]*)<\/title>/i);
                            const title = titleMatch ? titleMatch[1].toLowerCase() : '';
                            
                            const metaMatch = data.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
                            const metaDescription = metaMatch ? metaMatch[1] : '';
                            
                            const bodyText = data.toLowerCase().substring(0, 1000);

                            // Check for suspicious content
                            const suspiciousKeywords = [
                                'free nitro', 'discord token', 'hack discord', 'free robux',
                                'free vbucks', 'generator', 'phishing', 'grab token',
                                'ip grabber', 'verify account', 'suspicious activity',
                                'account suspended', 'click here to verify'
                            ];

                            for (const keyword of suspiciousKeywords) {
                                if (title.includes(keyword) || metaDescription.toLowerCase().includes(keyword) || bodyText.includes(keyword)) {
                                    resolve({
                                        suspicious: true,
                                        reason: `Suspicious content detected: "${keyword}"`,
                                        title: titleMatch ? titleMatch[1] : '',
                                        description: metaDescription
                                    });
                                    return;
                                }
                            }

                            resolve({
                                suspicious: false,
                                title: titleMatch ? titleMatch[1] : '',
                                description: metaDescription,
                                contentLength: data.length
                            });
                        } catch (parseError) {
                            resolve({ suspicious: true, reason: `Failed to parse content: ${parseError.message}` });
                        }
                    });
                });

                req.on('error', (error) => {
                    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                        resolve({ suspicious: true, reason: 'Domain not found or connection refused' });
                    } else {
                        resolve({ suspicious: true, reason: `Failed to analyze content: ${error.message}` });
                    }
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({ suspicious: true, reason: 'Request timeout' });
                });

                req.end();
            } catch (error) {
                resolve({ suspicious: true, reason: `Analysis error: ${error.message}` });
            }
        });
    }

    // Check if domain is in safe list
    isSafeDomain(domain) {
        const normalizedDomain = domain.toLowerCase();
        return this.safeDomains.has(normalizedDomain) || 
               Array.from(this.safeDomains).some(safeDomain => 
                   normalizedDomain.endsWith(`.${safeDomain}`) || normalizedDomain === safeDomain
               );
    }

    // Main verification function
    async verifyUrl(url) {
        try {
            // Validate URL format
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
                if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                    throw new Error('Invalid protocol');
                }
            } catch (urlError) {
                return {
                    safe: false,
                    reason: 'Invalid URL format',
                    riskLevel: 'HIGH',
                    type: 'INVALID_URL'
                };
            }

            const domain = parsedUrl.hostname;

            // Quick check for safe domains
            if (this.isSafeDomain(domain)) {
                return {
                    safe: true,
                    reason: 'Whitelisted safe domain',
                    riskLevel: 'SAFE',
                    type: 'SAFE_DOMAIN',
                    domain: domain,
                    protocol: parsedUrl.protocol
                };
            }

            // Check domain suspicion
            const domainCheck = this.isDomainSuspicious(domain);
            if (domainCheck.suspicious) {
                return {
                    safe: false,
                    reason: domainCheck.reason,
                    riskLevel: 'HIGH',
                    type: 'MALICIOUS_DOMAIN',
                    domain: domain
                };
            }

            // Check URL patterns
            const patternCheck = this.checkUrlPatterns(url);
            if (patternCheck.suspicious) {
                return {
                    safe: false,
                    reason: patternCheck.reason,
                    riskLevel: 'HIGH',
                    type: 'SUSPICIOUS_PATTERN',
                    domain: domain
                };
            }

            // Analyze webpage content (more intensive check)
            const contentAnalysis = await this.analyzeWebpageContent(url);
            if (contentAnalysis.suspicious) {
                return {
                    safe: false,
                    reason: contentAnalysis.reason,
                    riskLevel: 'HIGH',
                    type: 'MALICIOUS_CONTENT',
                    domain: domain,
                    title: contentAnalysis.title,
                    description: contentAnalysis.description
                };
            }

            // If all checks pass, consider it relatively safe
            return {
                safe: true,
                reason: 'No threats detected',
                riskLevel: 'LOW',
                type: 'UNKNOWN_SAFE',
                domain: domain,
                title: contentAnalysis.title,
                description: contentAnalysis.description,
                protocol: parsedUrl.protocol
            };

        } catch (error) {
            console.error('Error verifying URL:', error);
            return {
                safe: false,
                reason: `Verification failed: ${error.message}`,
                riskLevel: 'MEDIUM',
                type: 'VERIFICATION_ERROR'
            };
        }
    }

    // Verify multiple URLs
    async verifyUrls(urls) {
        const results = [];
        for (const url of urls) {
            const result = await this.verifyUrl(url);
            results.push({ url, ...result });
        }
        return results;
    }

    // Get risk level emoji
    getRiskEmoji(riskLevel) {
        switch (riskLevel) {
            case 'SAFE': return '✅';
            case 'LOW': return '🟢';
            case 'MEDIUM': return '🟡';
            case 'HIGH': return '🔴';
            default: return '⚠️';
        }
    }

    // Get type description
    getTypeDescription(type) {
        const descriptions = {
            'SAFE_DOMAIN': 'Verified Safe Domain',
            'MALICIOUS_DOMAIN': 'Known Malicious Domain',
            'SUSPICIOUS_PATTERN': 'Suspicious URL Pattern',
            'MALICIOUS_CONTENT': 'Malicious Content Detected',
            'UNKNOWN_SAFE': 'Appears Safe (Unknown Domain)',
            'VERIFICATION_ERROR': 'Could Not Verify',
            'INVALID_URL': 'Invalid URL Format'
        };
        return descriptions[type] || 'Unknown';
    }
}

module.exports = LinkVerificationSystem;
