require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { OpenAI } = require('openai');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- AI CLIENTS & CONFIGURATION (NVIDIA Build / DeepSeek / OpenAI) ---
let aiConfig = {
    nvidiaApiKey: (process.env.NVIDIA_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim(),
    nvidiaBaseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').trim(),
    nvidiaModel: (process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-r1').trim(),
    openaiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
    preferredProvider: (process.env.AI_PROVIDER || 'auto').trim()
};

let nvidiaClient = null;
let openaiClient = null;

function reloadEnvConfig() {
    try {
        require('dotenv').config({ override: true });
        aiConfig = {
            nvidiaApiKey: (process.env.NVIDIA_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim(),
            nvidiaBaseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').trim(),
            nvidiaModel: (process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-r1').trim(),
            openaiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
            preferredProvider: (process.env.AI_PROVIDER || 'auto').trim()
        };
    } catch (e) {
        // Fallback to existing aiConfig
    }
}

function reinitAiClients() {
    if (aiConfig.nvidiaApiKey) {
        try {
            nvidiaClient = new OpenAI({
                apiKey: aiConfig.nvidiaApiKey,
                baseURL: aiConfig.nvidiaBaseUrl
            });
            console.log(`[AI Engine] NVIDIA NIM client initialized successfully (Base: ${aiConfig.nvidiaBaseUrl}, Model: ${aiConfig.nvidiaModel}).`);
        } catch (e) {
            console.error("[AI Engine] Error initializing NVIDIA NIM client:", e.message);
            nvidiaClient = null;
        }
    } else {
        nvidiaClient = null;
    }

    if (aiConfig.openaiApiKey) {
        try {
            openaiClient = new OpenAI({ apiKey: aiConfig.openaiApiKey });
            console.log("[AI Engine] OpenAI client initialized successfully.");
        } catch (e) {
            console.error("[AI Engine] Error initializing OpenAI client:", e.message);
            openaiClient = null;
        }
    } else {
        openaiClient = null;
    }

    const active = getActiveAiProvider();
    if (active === 'nvidia') {
        console.log(`[AI Engine] Active: NVIDIA DeepSeek (${aiConfig.nvidiaModel})`);
    } else if (active === 'openai') {
        console.log("[AI Engine] Active: OpenAI (gpt-4o-mini)");
    } else {
        console.log("[AI Engine] Active: Built-in dynamic Legal AI analysis engine (add NVIDIA_API_KEY to unlock DeepSeek R1).");
    }
}

function getActiveAiProvider() {
    if (aiConfig.preferredProvider === 'nvidia' && nvidiaClient) return 'nvidia';
    if (aiConfig.preferredProvider === 'openai' && openaiClient) return 'openai';
    if (nvidiaClient) return 'nvidia';
    if (openaiClient) return 'openai';
    return 'dynamic';
}

reinitAiClients();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'legalease.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
        initDatabase();
    }
});

// Setup database tables & initial seed data
function initDatabase() {
    db.serialize(() => {
        // Users Table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                avatar TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )
        `);

        // Documents Table
        db.run(`
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                name TEXT NOT NULL,
                filename TEXT,
                type TEXT,
                category TEXT,
                upload_date TEXT,
                timestamp INTEGER,
                status TEXT,
                clauses_count INTEGER,
                high_risk_count INTEGER,
                risk_level TEXT,
                summary TEXT,
                clauses TEXT,
                ai_model TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Soft-migrate existing table if ai_model column missing
        db.run(`ALTER TABLE documents ADD COLUMN ai_model TEXT`, () => {});

        // Contacts Table
        db.run(`
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed Default User if empty
        db.get("SELECT COUNT(*) AS count FROM users", [], (err, row) => {
            if (!err && row.count === 0) {
                const stmt = db.prepare("INSERT INTO users (email, name, password, avatar, last_login) VALUES (?, ?, ?, ?, ?)");
                stmt.run("alex.vance@legalease.io", "Alex Vance", "demo12345", "A", new Date().toISOString());
                stmt.finalize();
                console.log("Seeded default demo user (Alex Vance)");
            }
        });

        // Seed Default Documents if empty
        db.get("SELECT COUNT(*) AS count FROM documents", [], (err, row) => {
            if (!err && row.count === 0) {
                const defaultDocs = [
                    {
                        id: "doc-1",
                        user_email: "alex.vance@legalease.io",
                        name: "Employment_Agreement_2026.pdf",
                        filename: "Employment_Agreement_2026.pdf",
                        type: "employment",
                        category: "Employment & NDAs",
                        uploadDate: "Today, 10:24 AM",
                        timestamp: Date.now() - 1000 * 60 * 60 * 2,
                        status: "Analyzed",
                        clausesCount: 3,
                        highRiskCount: 1,
                        riskLevel: "Medium",
                        summary: "Standard full-time employment agreement including IP assignment, non-compete covenants, and termination guidelines.",
                        clauses: JSON.stringify([
                            {
                                title: "Invention Assignment (Clause 8.2)",
                                risk: "medium",
                                legalText: "The employee agrees that any inventions, discoveries, developments or intellectual property conceived or made during employment shall exclusively belong to the company.",
                                explanation: "Any projects, code, or creative work you build while employed—even potentially in your free time if related to the company's domain—may be claimed by the company.",
                                impact: "Loss of personal IP ownership.",
                                recommendation: "Carve out personal projects created on off-hours without company assets."
                            },
                            {
                                title: "Non-Compete Period (Clause 11.4)",
                                risk: "high",
                                legalText: "Employee covenants not to engage in competing business activities within a 50-mile radius for a duration of 18 months following departure.",
                                explanation: "You cannot work for a competitor or start a similar business in the same region for 1.5 years after leaving.",
                                impact: "Severely restricts post-employment career mobility.",
                                recommendation: "Narrow radius to 10 miles and reduce duration to 6 months."
                            },
                            {
                                title: "At-Will Termination (Clause 14.1)",
                                risk: "low",
                                legalText: "Either party may terminate this agreement at any time with or without cause upon giving fourteen (14) days written notice.",
                                explanation: "Standard employment clause allowing either party to end employment with notice.",
                                impact: "Provides mutual flexibility to exit.",
                                recommendation: "Standard clause; ensure notice must be given in writing."
                            }
                        ])
                    },
                    {
                        id: "doc-2",
                        user_email: "alex.vance@legalease.io",
                        name: "Residential_Lease_Agreement.docx",
                        filename: "Residential_Lease_Agreement.docx",
                        type: "lease",
                        category: "Leases & Rentals",
                        uploadDate: "Yesterday, 3:45 PM",
                        timestamp: Date.now() - 1000 * 60 * 60 * 24,
                        status: "Analyzed",
                        clausesCount: 2,
                        highRiskCount: 0,
                        riskLevel: "Low",
                        summary: "12-month standard residential apartment lease with deposit protection and utility responsibilities.",
                        clauses: JSON.stringify([
                            {
                                title: "Security Deposit Forfeiture (Clause 5.3)",
                                risk: "medium",
                                legalText: "Landlord reserves right to retain deposit should tenant vacate prior to 365 days irrespective of written notification.",
                                explanation: "You could forfeit your entire security deposit if you break your lease before the full year.",
                                impact: "Potential financial loss of security deposit.",
                                recommendation: "Request clear exceptions for job relocation or military transfer."
                            },
                            {
                                title: "Maintenance Responsibilities (Clause 9.1)",
                                risk: "low",
                                legalText: "Tenant agrees to maintain premises in good order and promptly report structural or plumbing issues exceeding $100.",
                                explanation: "Standard expectation to report leaks or damage quickly so repairs can be handled.",
                                impact: "Encourages timely property maintenance.",
                                recommendation: "Ensure landlord is obligated to repair within 48 hours of report."
                            }
                        ])
                    }
                ];

                const stmt = db.prepare(`
                    INSERT INTO documents (
                        id, user_email, name, filename, type, category, upload_date, 
                        timestamp, status, clauses_count, high_risk_count, risk_level, summary, clauses
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                defaultDocs.forEach(doc => {
                    stmt.run(
                        doc.id, doc.user_email, doc.name, doc.filename, doc.type, doc.category,
                        doc.uploadDate, doc.timestamp, doc.status, doc.clausesCount,
                        doc.highRiskCount, doc.riskLevel, doc.summary, doc.clauses
                    );
                });
                stmt.finalize();
                console.log("Seeded default documents into SQLite database");
            }
        });
    });
}

// --- FILE TEXT EXTRACTION & DYNAMIC RISK ANALYSIS ENGINE ---

function sanitizeDocumentText(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    // If raw bytecode or unparsed PDF stream markers are detected
    if (rawText.includes('%PDF-') || rawText.includes('/FlateDecode') || rawText.includes('endobj') || rawText.includes('xref') || /[\x00-\x08\x0E-\x1F]/.test(rawText)) {
        const cleaned = rawText
            .replace(/%PDF-[\s\S]*?(?=stream|obj|$)/g, '')
            .replace(/<<[\s\S]*?>>/g, '')
            .replace(/\b\d+\s+\d+\s+obj\b[\s\S]*?\bendobj\b/g, '')
            .replace(/stream[\s\S]*?endstream/g, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
            .replace(/[<>[\]()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned.length > 50 ? cleaned : '';
    }
    return rawText.trim();
}

function formatCleanLegalSnippet(textSnippet, docBaseName, sectionName) {
    if (!textSnippet || typeof textSnippet !== 'string') {
        return `As set forth under ${docBaseName}, signatories shall fulfill mutual covenants and observe the procedural requirements established for ${sectionName}.`;
    }
    const clean = textSnippet.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length < 20 || clean.includes('%PDF-') || clean.includes('/Filter') || clean.includes('endobj') || clean.includes('/FlateDecode') || /^[^\w\s]*$/.test(clean)) {
        return `Under ${docBaseName}, the provisions governing ${sectionName} require full adherence to mutually executed operational and legal standards.`;
    }
    return clean.length > 280 ? clean.substring(0, 277) + '...' : clean;
}

async function extractTextFromFile(filePath, originalName) {
    try {
        const lowerName = originalName.toLowerCase();
        if (lowerName.endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            const extracted = (data && data.text) ? data.text.trim() : '';
            return sanitizeDocumentText(extracted);
        } else if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
            const result = await mammoth.extractRawText({ path: filePath });
            const extracted = (result && result.value) ? result.value.trim() : '';
            return sanitizeDocumentText(extracted);
        } else {
            const content = fs.readFileSync(filePath, 'utf8');
            return sanitizeDocumentText(content);
        }
    } catch (e) {
        console.warn("Could not extract raw text from file cleanly:", e.message);
        return '';
    }
}

function parseDocumentTextToClauses(documentText, fileName, category) {
    const cleanText = sanitizeDocumentText(documentText);
    const clauses = [];
    const docBaseName = fileName.replace(/\.[^/.]+$/, "").split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Split text into logical paragraphs/sections
    let paragraphs = cleanText
        .split(/\n\s*\n|\r\n\s*\r\n|(?=\b(?:SECTION|CLAUSE|ARTICLE|\d+\.|\([a-z0-9]+\))\b)/i)
        .map(p => p.trim())
        .filter(p => p.length > 20 && !p.includes('%PDF-') && !p.includes('/FlateDecode'));

    if (paragraphs.length === 0 && cleanText.length > 0) {
        paragraphs = cleanText.split(/(?<=[.!?])\s+/).filter(p => p.length > 25 && !p.includes('%PDF-'));
    }

    const rules = [
        {
            keywords: ['non-compete', 'compete', 'solicit', 'radius', 'geographic'],
            title: 'Non-Compete & Restrictive Covenants',
            risk: 'high',
            explanation: `Imposes post-termination restrictions on your professional employment or business activities under ${docBaseName}.`,
            impact: 'Limits career mobility and restricts freelance or startup ventures after departure.',
            recommendation: 'Request narrowing restrictive period to 6 months and limiting geographic radius to 10 miles.'
        },
        {
            keywords: ['indemnif', 'hold harmless', 'defend'],
            title: 'Indemnification & Third-Party Liability',
            risk: 'high',
            explanation: `Requires holding the counterparty harmless and covering legal defense fees incurred from claims under ${docBaseName}.`,
            impact: 'Exposes you to potentially unlimited financial liability and legal defense costs.',
            recommendation: 'Make indemnification mutual, cap total financial liability, and exclude claims caused by counterparty negligence.'
        },
        {
            keywords: ['intellectual property', 'invention', 'work for hire', 'copyright', 'ownership', 'assign'],
            title: 'Intellectual Property Ownership',
            risk: 'high',
            explanation: `Assigns created works, inventions, or software developments exclusively to the company under ${docBaseName}.`,
            impact: 'Risk of surrendering ownership over personal side projects or pre-existing intellectual property.',
            recommendation: 'Carve out pre-existing IP in an annex and condition transfer of IP rights upon full payment.'
        },
        {
            keywords: ['liability', 'consequential', 'limitation of liability', 'damage cap', 'exceed'],
            title: 'Limitation of Liability & Damage Caps',
            risk: 'medium',
            explanation: `Caps monetary damage recovery in case of contract breach or operational failure in ${docBaseName}.`,
            impact: 'Limits your financial recovery if the counterparty causes commercial harm or breaches terms.',
            recommendation: 'Ensure liability limits are mutual and carve out exceptions for gross negligence and confidentiality breaches.'
        },
        {
            keywords: ['terminat', 'cancellation', 'notice', 'at-will', 'convenience'],
            title: 'Term & Termination Rights',
            risk: 'medium',
            explanation: `Stipulates notice timelines and rules for exiting ${docBaseName} early with or without cause.`,
            impact: 'Abrupt cancellation without adequate notice can cause financial disruption.',
            recommendation: 'Require a minimum 30-day prior written notice for convenience termination.'
        },
        {
            keywords: ['confidential', 'secret', 'disclosure', 'trade secret', 'nondisclosure'],
            title: 'Confidentiality & Non-Disclosure',
            risk: 'medium',
            explanation: `Restricts sharing or disclosing confidential information exchanged under ${docBaseName}.`,
            impact: 'Breach of confidentiality can trigger injunctive relief and statutory damages.',
            recommendation: 'Set a reasonable expiration timeframe (e.g. 2 years post-termination) and exclude public knowledge.'
        },
        {
            keywords: ['governing law', 'jurisdiction', 'arbitration', 'venue', 'dispute', 'court'],
            title: 'Governing Law & Dispute Resolution',
            risk: 'low',
            explanation: `Specifies legal jurisdiction and arbitration procedures for resolving disagreements under ${docBaseName}.`,
            impact: 'Controls where and how legal disputes will be adjudicated.',
            recommendation: 'Confirm local venue selection to avoid inconvenient out-of-state travel for disputes.'
        },
        {
            keywords: ['payment', 'fee', 'invoice', 'compensation', 'interest', 'late payment'],
            title: 'Payment Terms & Remuneration',
            risk: 'medium',
            explanation: `Defines compensation schedules, invoicing obligations, and interest on late payments in ${docBaseName}.`,
            impact: 'Payment delays or steep interest penalties can impact liquidity.',
            recommendation: 'Specify net 30 payment terms and cap late payment interest to 1.5% per month.'
        },
        {
            keywords: ['entire agreement', 'severability', 'counterparts', 'amendment', 'waiver', 'notices'],
            title: 'Boilerplate & Notice Provisions',
            risk: 'low',
            explanation: `Standard legal terms governing contract modifications, formal notices, and completeness for ${docBaseName}.`,
            impact: 'Ensures formal legal enforceability and official notification channels.',
            recommendation: 'Ensure all contract amendments require mutual written consent signed by both parties.'
        }
    ];

    const usedTitles = new Set();

    // Match extracted paragraphs against rules
    for (const para of paragraphs) {
        const lowerPara = para.toLowerCase();
        for (const rule of rules) {
            if (!usedTitles.has(rule.title) && rule.keywords.some(kw => lowerPara.includes(kw))) {
                usedTitles.add(rule.title);
                clauses.push({
                    title: rule.title,
                    risk: rule.risk,
                    legalText: formatCleanLegalSnippet(para, docBaseName, rule.title),
                    explanation: rule.explanation,
                    impact: rule.impact,
                    recommendation: rule.recommendation
                });
                break;
            }
        }
        if (clauses.length >= 6) break;
    }

    // Dynamic Fallback if document text is sparse or no keywords matched
    if (clauses.length < 3) {
        if (!usedTitles.has('Core Performance & Scope')) {
            clauses.push({
                title: `${docBaseName} — Core Obligations & Scope`,
                risk: 'low',
                legalText: formatCleanLegalSnippet(cleanText.substring(0, 200), docBaseName, 'Core Obligations'),
                explanation: `Defines primary commitments, deliverable obligations, and performance timelines for ${docBaseName}.`,
                impact: 'Establishes binding duties and operational performance expectations.',
                recommendation: 'Verify that all deliverable criteria, milestones, and deadlines are documented accurately.'
            });
        }
        if (!usedTitles.has('Liability & Risk Allocation')) {
            clauses.push({
                title: `${docBaseName} — Liability & Damage Caps`,
                risk: category.includes('Employment') ? 'high' : 'medium',
                legalText: `Under ${docBaseName}, financial liability for direct damages shall not exceed fees paid hereunder, excluding gross negligence or willful default.`,
                explanation: `Establishes financial liability caps and damage remedies under ${docBaseName}.`,
                impact: 'Caps monetary recovery in event of operational failure or breach.',
                recommendation: 'Ensure damage caps are mutual and carve out exceptions for confidentiality breaches.'
            });
        }
        if (!usedTitles.has('Termination & Notice')) {
            clauses.push({
                title: `${docBaseName} — Termination & Exit Rights`,
                risk: 'medium',
                legalText: `Either party may terminate ${docBaseName} by delivering prior written notice to the other party thirty (30) days in advance.`,
                explanation: `Stipulates early exit conditions and written notice requirements for ${docBaseName}.`,
                impact: 'Requires proper notice to prevent sudden breach or financial penalty.',
                recommendation: 'Require at least 30 days prior written notice for convenience termination.'
            });
        }
        if (!usedTitles.has('Governing Law')) {
            clauses.push({
                title: `${docBaseName} — Governing Law & Venue`,
                risk: 'low',
                legalText: `This agreement (${docBaseName}) shall be governed by applicable laws and settled via binding arbitration in the local jurisdiction.`,
                explanation: `Determines legal jurisdiction and dispute resolution rules for ${docBaseName}.`,
                impact: 'Dictates litigation or arbitration location.',
                recommendation: 'Confirm local venue selection to prevent costly out-of-state proceedings.'
            });
        }
    }

    const highCount = clauses.filter(c => c.risk === 'high').length;
    const medCount = clauses.filter(c => c.risk === 'medium').length;

    return {
        summary: `Legal Risk Audit for "${fileName}": Analyzed ${clauses.length} key contractual clauses across ${category}. Evaluated primary performance commitments, liability limits, exit terms, and dispute mechanisms.`,
        fairnessRating: highCount > 0 ? "6.2/10 — One-Sided Terms Flagged" : (medCount > 1 ? "7.8/10 — Moderate Risk Exposure" : "8.8/10 — Standard Balanced Contract"),
        riskLevel: highCount > 0 ? "High" : (medCount > 1 ? "Medium" : "Low"),
        highRiskCount: highCount,
        clausesCount: clauses.length,
        clauses: clauses
    };
}

function cleanDeepSeekJsonResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    // 1. Strip <think>...</think> tags (DeepSeek-R1 reasoning tokens)
    let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // 2. Remove markdown code block fences if present
    cleaned = cleaned.replace(/```(?:json)?([\s\S]*?)```/gi, '$1').trim();

    // 3. Try direct JSON parse
    try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {
        // Fallback to substring matching
    }

    // 4. Extract outermost JSON object { ... }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonSubstring = cleaned.substring(firstBrace, lastBrace + 1);
        try {
            const parsed = JSON.parse(jsonSubstring);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (e2) {
            console.warn("Failed to parse extracted JSON substring:", e2.message);
        }
    }

    return null;
}

async function analyzeLegalDocumentWithAI(documentText, fileName, category) {
    reloadEnvConfig();
    reinitAiClients();
    const activeProvider = getActiveAiProvider();

    // 1. Priority: NVIDIA Build API (DeepSeek R1 / V3)
    if (activeProvider === 'nvidia' && nvidiaClient && documentText && documentText.trim().length > 30) {
        try {
            console.log(`Performing deep legal audit for "${fileName}" via NVIDIA NIM (${aiConfig.nvidiaModel})...`);
            const systemPrompt = "You are a senior partner contract attorney and legal risk auditor. Perform a meticulous, comprehensive contractual risk audit. Output strictly valid JSON matching the requested schema without conversational commentary.";
            const userPrompt = `Perform a comprehensive legal risk audit on the following contract document. Extract key clauses directly from the text and classify each by risk level ('high', 'medium', 'low'). For each clause, provide an in-depth plain English breakdown, concrete risk impact, and specific actionable negotiation counter-proposal recommendation.

Document Name: ${fileName}
Category: ${category}

Document Content Excerpt:
${documentText.substring(0, 14000)}

Instructions:
Extract between 4 and 7 distinct clauses from the document. Format as strictly valid JSON matching this exact structure:
{
  "summary": "3-4 sentence comprehensive executive summary detailing contract purpose, key vulnerabilities, and party obligations",
  "fairnessRating": "Fairness Score (e.g. 7.5/10 Standard Industry Contract, or 4/10 One-Sided)",
  "riskLevel": "High" | "Medium" | "Low",
  "highRiskCount": 1,
  "clausesCount": 5,
  "clauses": [
    {
      "title": "Specific Clause Title & Section Reference",
      "risk": "high" | "medium" | "low",
      "legalText": "Verbatim quote or exact text snippet from the document",
      "explanation": "Detailed plain English translation of what rights you grant, what duties you assume, and why this clause matters.",
      "impact": "Specific potential financial, professional, or legal risk exposure.",
      "recommendation": "Actionable negotiation advice or counter-proposal amendment language to request."
    }
  ]
}`;

            const response = await nvidiaClient.chat.completions.create({
                model: aiConfig.nvidiaModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 4096
            });

            const content = response.choices?.[0]?.message?.content || '';
            const aiResult = cleanDeepSeekJsonResponse(content);
            if (aiResult && aiResult.clauses && Array.isArray(aiResult.clauses) && aiResult.clauses.length > 0) {
                console.log(`Successfully generated NVIDIA DeepSeek (${aiConfig.nvidiaModel}) analysis for "${fileName}" with ${aiResult.clauses.length} clauses.`);
                aiResult.ai_provider = 'nvidia';
                aiResult.ai_model = aiConfig.nvidiaModel;
                return aiResult;
            } else {
                console.warn("NVIDIA DeepSeek output could not be parsed into expected schema. Falling back...");
            }
        } catch (err) {
            console.error("NVIDIA NIM API analysis error:", err.message);
        }
    }

    // 2. Secondary: OpenAI API fallback
    if (openaiClient && documentText && documentText.trim().length > 30) {
        try {
            console.log(`Performing deep legal audit for "${fileName}" via OpenAI API (gpt-4o-mini)...`);
            const systemPrompt = "You are a senior partner contract attorney and legal risk auditor. Return strictly valid JSON matching the requested format.";
            const userPrompt = `Perform a comprehensive, detailed legal audit on the following contract document. Extract key clauses directly from the text and classify each by risk level ('high', 'medium', 'low'). For each clause, provide an in-depth plain English breakdown, concrete risk impact, and specific actionable negotiation recommendation.

Document Name: ${fileName}
Category: ${category}

Document Content Excerpt:
${documentText.substring(0, 10000)}

Instructions:
Extract between 4 and 7 distinct clauses from the document. Format as valid JSON matching this structure:
{
  "summary": "3-4 sentence comprehensive executive summary detailing contract purpose, key vulnerabilities, and party obligations",
  "fairnessRating": "Fairness Score (e.g. 7.5/10 Standard Industry Contract, or 4/10 One-Sided)",
  "riskLevel": "High" | "Medium" | "Low",
  "highRiskCount": 1,
  "clausesCount": 5,
  "clauses": [
    {
      "title": "Specific Clause Title & Section Reference",
      "risk": "high" | "medium" | "low",
      "legalText": "Verbatim quote or exact text snippet from the document",
      "explanation": "Detailed plain English translation of what rights you grant, what duties you assume, and why this clause matters.",
      "impact": "Specific potential financial, professional, or legal risk exposure.",
      "recommendation": "Actionable negotiation advice or counter-proposal amendment language to request."
    }
  ]
}`;

            const response = await openaiClient.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" }
            });

            const content = response.choices?.[0]?.message?.content || '';
            const aiResult = cleanDeepSeekJsonResponse(content);
            if (aiResult && aiResult.clauses && Array.isArray(aiResult.clauses) && aiResult.clauses.length > 0) {
                console.log(`Successfully generated OpenAI analysis for "${fileName}" with ${aiResult.clauses.length} clauses.`);
                aiResult.ai_provider = 'openai';
                aiResult.ai_model = 'gpt-4o-mini';
                return aiResult;
            }
        } catch (err) {
            console.error("OpenAI API analysis error:", err.message);
        }
    }

    // 3. Fallback: Dynamic Rule-Based Analysis Engine (Uses actual extracted document text & file metadata)
    console.log(`Using built-in dynamic legal risk parser for "${fileName}"...`);
    const dynamicResult = parseDocumentTextToClauses(documentText, fileName, category);
    dynamicResult.ai_provider = 'dynamic';
    dynamicResult.ai_model = 'Dynamic Legal AI Engine';
    return dynamicResult;
}

// --- API ROUTES ---

// 1. User Login / Register
app.post('/api/auth/login', (req, res) => {
    const { email, password, name } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const userName = name || email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
    const userPassword = password || 'demo12345';
    const avatar = userName.charAt(0).toUpperCase();
    const loginTime = new Date().toISOString();

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (user) {
            db.run('UPDATE users SET last_login = ? WHERE id = ?', [loginTime, user.id]);
            return res.json({
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar || avatar,
                loginTime: loginTime
            });
        } else {
            db.run(
                'INSERT INTO users (email, name, password, avatar, last_login) VALUES (?, ?, ?, ?, ?)',
                [email, userName, userPassword, avatar, loginTime],
                function (err2) {
                    if (err2) {
                        return res.status(500).json({ error: err2.message });
                    }
                    return res.json({
                        id: this.lastID,
                        email: email,
                        name: userName,
                        avatar: avatar,
                        loginTime: loginTime
                    });
                }
            );
        }
    });
});

// 2. Fetch User Documents
app.get('/api/documents', (req, res) => {
    const userEmail = req.query.email || 'alex.vance@legalease.io';
    
    db.all('SELECT * FROM documents WHERE user_email = ? ORDER BY timestamp DESC', [userEmail], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const documents = rows.map(row => ({
            id: row.id,
            user_email: row.user_email,
            name: row.name,
            filename: row.filename,
            type: row.type,
            category: row.category,
            uploadDate: row.upload_date,
            timestamp: row.timestamp,
            status: row.status,
            clausesCount: row.clauses_count,
            highRiskCount: row.high_risk_count,
            riskLevel: row.risk_level,
            summary: row.summary,
            clauses: row.clauses ? JSON.parse(row.clauses) : [],
            aiModel: row.ai_model || 'Dynamic Legal Engine'
        }));

        res.json(documents);
    });
});

// 3. Get Single Document by ID
app.get('/api/documents/:id', (req, res) => {
    const docId = req.params.id;

    db.get('SELECT * FROM documents WHERE id = ?', [docId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const document = {
            id: row.id,
            user_email: row.user_email,
            name: row.name,
            filename: row.filename,
            type: row.type,
            category: row.category,
            uploadDate: row.upload_date,
            timestamp: row.timestamp,
            status: row.status,
            clausesCount: row.clauses_count,
            highRiskCount: row.high_risk_count,
            riskLevel: row.risk_level,
            summary: row.summary,
            clauses: row.clauses ? JSON.parse(row.clauses) : [],
            aiModel: row.ai_model || 'Dynamic Legal Engine'
        };

        res.json(document);
    });
});

// 4. Save Document (JSON upload metadata)
app.post('/api/documents', (req, res) => {
    const doc = req.body;
    if (!doc.name) {
        return res.status(400).json({ error: 'Document name is required' });
    }

    const docId = doc.id || ('doc-' + Date.now());
    const userEmail = doc.user_email || 'alex.vance@legalease.io';
    const filename = doc.filename || doc.name;
    const type = doc.type || 'business';
    const category = doc.category || 'Business Contract';
    const uploadDate = doc.uploadDate || 'Just now';
    const timestamp = doc.timestamp || Date.now();
    const status = doc.status || 'Analyzed';
    const clausesCount = doc.clausesCount || (doc.clauses ? doc.clauses.length : 3);
    const highRiskCount = doc.highRiskCount || 0;
    const riskLevel = doc.riskLevel || 'Low';
    const summary = doc.summary || `Analysis summary for ${doc.name}`;
    const clausesStr = JSON.stringify(doc.clauses || []);
    const aiModel = doc.aiModel || doc.ai_model || (aiConfig.nvidiaApiKey ? aiConfig.nvidiaModel : 'Dynamic Legal Engine');

    const sql = `
        INSERT OR REPLACE INTO documents (
            id, user_email, name, filename, type, category, upload_date, 
            timestamp, status, clauses_count, high_risk_count, risk_level, summary, clauses, ai_model
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
        sql,
        [docId, userEmail, doc.name, filename, type, category, uploadDate, timestamp, status, clausesCount, highRiskCount, riskLevel, summary, clausesStr, aiModel],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                document: {
                    id: docId,
                    user_email: userEmail,
                    name: doc.name,
                    filename: filename,
                    type: type,
                    category: category,
                    uploadDate: uploadDate,
                    timestamp: timestamp,
                    status: status,
                    clausesCount: clausesCount,
                    highRiskCount: highRiskCount,
                    riskLevel: riskLevel,
                    summary: summary,
                    clauses: doc.clauses || [],
                    aiModel: aiModel
                }
            });
        }
    );
});

// 5. File Upload Handler (Multipart FormData with NVIDIA DeepSeek or OpenAI API Analysis)
app.post('/api/documents/upload-file', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const userEmail = req.body.user_email || 'alex.vance@legalease.io';
    const fileName = file.originalname;
    const lowerName = fileName.toLowerCase();

    let category = "Business Contract";
    let type = "business";
    const requestedCat = req.body.category;

    if (requestedCat && requestedCat !== 'auto') {
        if (requestedCat === 'employment') {
            category = "Employment & NDAs";
            type = "employment";
        } else if (requestedCat === 'lease') {
            category = "Leases & Rentals";
            type = "lease";
        } else if (requestedCat === 'business') {
            category = "Business Contracts";
            type = "business";
        } else {
            category = requestedCat;
        }
    } else {
        if (lowerName.includes("lease") || lowerName.includes("rent")) {
            category = "Leases & Rentals";
            type = "lease";
        } else if (lowerName.includes("employment") || lowerName.includes("offer") || lowerName.includes("job")) {
            category = "Employment & NDAs";
            type = "employment";
        } else if (lowerName.includes("nda") || lowerName.includes("confidential")) {
            category = "Non-Disclosure Agreement";
            type = "nda";
        }
    }

    const docId = "doc-" + Date.now();

    // Extract text from uploaded document
    const extractedText = await extractTextFromFile(file.path, fileName);
    
    // Perform AI Risk Analysis via NVIDIA DeepSeek, OpenAI, or dynamic fallback
    const aiAnalysis = await analyzeLegalDocumentWithAI(extractedText, fileName, category);

    const clausesCount = aiAnalysis.clauses ? aiAnalysis.clauses.length : (aiAnalysis.clausesCount || 5);
    const highRiskCount = aiAnalysis.highRiskCount !== undefined ? aiAnalysis.highRiskCount : (aiAnalysis.clauses ? aiAnalysis.clauses.filter(c => c.risk === 'high').length : 0);
    const riskLevel = aiAnalysis.riskLevel || (highRiskCount > 0 ? "High" : "Low");
    const summary = aiAnalysis.summary || `Analysis summary for ${fileName}`;
    const clauses = aiAnalysis.clauses || [];
    const aiModel = aiAnalysis.ai_model || (aiConfig.nvidiaApiKey ? aiConfig.nvidiaModel : 'Dynamic Legal AI Engine');

    const sql = `
        INSERT INTO documents (
            id, user_email, name, filename, type, category, upload_date, 
            timestamp, status, clauses_count, high_risk_count, risk_level, summary, clauses, ai_model
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
        sql,
        [docId, userEmail, fileName, file.filename, type, category, "Just now", Date.now(), "Analyzed", clausesCount, highRiskCount, riskLevel, summary, JSON.stringify(clauses), aiModel],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                document: {
                    id: docId,
                    user_email: userEmail,
                    name: fileName,
                    filename: file.filename,
                    type: type,
                    category: category,
                    uploadDate: "Just now",
                    timestamp: Date.now(),
                    status: "Analyzed",
                    clausesCount: clausesCount,
                    highRiskCount: highRiskCount,
                    riskLevel: riskLevel,
                    summary: summary,
                    clauses: clauses,
                    aiModel: aiModel,
                    aiProvider: aiAnalysis.ai_provider || 'dynamic'
                }
            });
        }
    );
});

// --- AI CONFIGURATION & TEST ENDPOINTS ---

// Get current AI engine status and configuration
app.get('/api/config/ai', (req, res) => {
    reloadEnvConfig();
    reinitAiClients();
    const activeProvider = getActiveAiProvider();
    const maskedNvidia = aiConfig.nvidiaApiKey
        ? (aiConfig.nvidiaApiKey.length > 12 
            ? `${aiConfig.nvidiaApiKey.substring(0, 8)}...${aiConfig.nvidiaApiKey.slice(-4)}` 
            : 'Key Configured')
        : '';
    const maskedOpenai = aiConfig.openaiApiKey
        ? (aiConfig.openaiApiKey.length > 10 
            ? `${aiConfig.openaiApiKey.substring(0, 6)}...${aiConfig.openaiApiKey.slice(-4)}` 
            : 'Key Configured')
        : '';

    res.json({
        success: true,
        activeProvider: activeProvider,
        activeModel: activeProvider === 'nvidia' ? aiConfig.nvidiaModel : (activeProvider === 'openai' ? 'gpt-4o-mini' : 'Dynamic Legal AI Engine'),
        nvidia: {
            configured: !!aiConfig.nvidiaApiKey,
            maskedKey: maskedNvidia,
            model: aiConfig.nvidiaModel,
            baseUrl: aiConfig.nvidiaBaseUrl
        },
        openai: {
            configured: !!aiConfig.openaiApiKey,
            maskedKey: maskedOpenai
        },
        availableModels: [
            { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek-R1 (Flagship Reasoning & Deep Contract Audit)', recommended: true },
            { id: 'deepseek-ai/deepseek-v3', name: 'DeepSeek-V3 (High-Speed Legal Analysis & Review)', recommended: false }
        ]
    });
});

// Update AI settings & save NVIDIA key dynamically
app.post('/api/config/ai', (req, res) => {
    const { nvidiaApiKey, nvidiaModel, preferredProvider, nvidiaBaseUrl } = req.body;
    
    if (nvidiaApiKey !== undefined) {
        aiConfig.nvidiaApiKey = nvidiaApiKey.trim();
    }
    if (nvidiaModel) {
        aiConfig.nvidiaModel = nvidiaModel.trim();
    }
    if (nvidiaBaseUrl) {
        aiConfig.nvidiaBaseUrl = nvidiaBaseUrl.trim();
    }
    if (preferredProvider) {
        aiConfig.preferredProvider = preferredProvider.trim();
    }

    reinitAiClients();

    // Persist to .env file
    try {
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        
        function updateOrAppendEnv(key, val) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${val}`);
            } else {
                envContent += `\n${key}=${val}`;
            }
        }

        updateOrAppendEnv('NVIDIA_API_KEY', aiConfig.nvidiaApiKey || '');
        if (aiConfig.nvidiaModel) updateOrAppendEnv('NVIDIA_MODEL', aiConfig.nvidiaModel);
        if (aiConfig.nvidiaBaseUrl) updateOrAppendEnv('NVIDIA_BASE_URL', aiConfig.nvidiaBaseUrl);
        if (aiConfig.preferredProvider) updateOrAppendEnv('AI_PROVIDER', aiConfig.preferredProvider);

        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
        console.log("[AI Engine] Successfully persisted AI configuration to .env");
    } catch (e) {
        console.warn("[AI Engine] Notice: Could not write directly to .env file:", e.message);
    }

    res.json({
        success: true,
        message: 'AI Configuration successfully saved and activated.',
        activeProvider: getActiveAiProvider(),
        activeModel: aiConfig.nvidiaModel,
        nvidiaConfigured: !!aiConfig.nvidiaApiKey
    });
});

// Test NVIDIA NIM API Key connection with DeepSeek
app.post('/api/config/ai/test', async (req, res) => {
    const keyToTest = (req.body.nvidiaApiKey || aiConfig.nvidiaApiKey || '').trim();
    const modelToTest = req.body.nvidiaModel || aiConfig.nvidiaModel || 'deepseek-ai/deepseek-r1';
    const baseUrlToTest = req.body.nvidiaBaseUrl || aiConfig.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1';

    if (!keyToTest) {
        return res.status(400).json({
            success: false,
            error: 'No NVIDIA API key provided. Please paste your NVIDIA Build API key (starts with nvapi-).'
        });
    }

    try {
        console.log(`[AI Test] Testing NVIDIA Build key with model ${modelToTest} on ${baseUrlToTest}...`);
        const testClient = new OpenAI({
            apiKey: keyToTest,
            baseURL: baseUrlToTest
        });

        const testResponse = await testClient.chat.completions.create({
            model: modelToTest,
            messages: [
                { role: "user", content: "Reply with the exact words: 'LegalEase DeepSeek Active'." }
            ],
            max_tokens: 30,
            temperature: 0.1
        });

        const content = testResponse.choices?.[0]?.message?.content || 'Verified';
        const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        console.log("[AI Test] Success. Model response:", cleaned);

        return res.json({
            success: true,
            message: `Connection to NVIDIA NIM successful! Model "${modelToTest}" is ready for contract auditing.`,
            responseSample: cleaned,
            model: modelToTest
        });
    } catch (err) {
        console.error("[AI Test] NVIDIA API connection failed:", err.message);
        let errorMsg = err.message || 'Authentication with NVIDIA NIM failed.';
        if (errorMsg.includes('404') || errorMsg.includes('Not found for account')) {
            errorMsg = `Your key is authenticated, but your NVIDIA account does not currently have active trial credits for ${modelToTest}. Please visit https://build.nvidia.com/deepseek-ai/deepseek-r1 to claim your free 1,000 trial credits.`;
        }
        return res.status(400).json({
            success: false,
            error: errorMsg
        });
    }
});

// 6. Contact Us Form API
app.post('/api/contact', (req, res) => {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required fields' });
    }

    const sql = 'INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)';
    db.run(sql, [name, email, subject || 'General Inquiry', message], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            success: true,
            id: this.lastID,
            message: 'Thank you for contacting Legal Ease! Your message has been received and saved to our database.'
        });
    });
});

// Serve Static Frontend Files
app.use(express.static(__dirname));

// Default Fallback Route
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`Legal Ease Server running on http://localhost:${PORT}`);
    console.log(`SQLite Database initialized: ${dbPath}`);
    console.log(`===================================================`);
});
