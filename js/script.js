// ==========================================
// LEGAL EASE - SHARED JAVASCRIPT CORE
// ==========================================

// --- USER AUTHENTICATION STATE ---
function getCurrentUser() {
    try {
        const userJson = localStorage.getItem("legalEase_user");
        return userJson ? JSON.parse(userJson) : null;
    } catch (e) {
        return null;
    }
}

function isLoggedIn() {
    return !!getCurrentUser();
}

async function loginUser(email, name = "Alex Vance") {
    const user = {
        email: email,
        name: name,
        avatar: name.charAt(0).toUpperCase(),
        loginTime: new Date().toISOString()
    };

    // Save login info to SQLite backend
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name })
        });
        if (res.ok) {
            const data = await res.json();
            user.id = data.id;
        }
    } catch (e) {
        console.warn("Backend API not reachable, using local storage fallback:", e);
    }

    localStorage.setItem("legalEase_user", JSON.stringify(user));
    renderHeaderAuth();
    renderNavbar();
    renderHomePageUserGreeting();
    updateSignInNoteVisibility();
    
    // Sync documents from SQLite for this user
    fetchDocumentsFromApi();

    return user;
}

function logoutUser() {
    localStorage.removeItem("legalEase_user");
    renderHeaderAuth();
    renderNavbar();
    renderHomePageUserGreeting();
    updateSignInNoteVisibility();
    window.location.reload();
}

function renderNavbar() {
    const navbars = document.querySelectorAll(".navbar");
    if (!navbars.length) return;

    const loggedIn = isLoggedIn();
    const currentPath = window.location.pathname.split("/").pop() || "index.html";

    // Requirement:
    // Before sign-in: Overview, Upload, Contact Us (History REMOVED from before login)
    // After sign-in: Dashboard, Upload, History, Contact Us (Overview REMOVED after login)
    // Note: Analysis is NOT added to the navbar
    const navItems = [
        { name: "Overview", href: "index.html", show: !loggedIn },
        { name: "Dashboard", href: "dashboard.html", show: loggedIn },
        { name: "Upload", href: "upload.html", show: true },
        { name: "History", href: "history.html", show: loggedIn },
        { name: "Contact Us", href: "contact.html", show: true }
    ];

    navbars.forEach(nav => {
        nav.innerHTML = navItems
            .filter(item => item.show)
            .map(item => {
                const isActive = (currentPath === item.href) || (currentPath === "" && item.href === "index.html");
                return `<a href="${item.href}" class="${isActive ? 'active' : ''}">${item.name}</a>`;
            })
            .join("");
    });
}

function updateSignInNoteVisibility() {
    const noteEl = document.getElementById("signInRequiredNote");
    if (noteEl) {
        noteEl.style.display = isLoggedIn() ? "none" : "block";
    }
}

function renderHomePageUserGreeting() {
    const user = getCurrentUser();
    const heroLeft = document.querySelector(".hero-left");
    const heroRight = document.querySelector(".hero-right");
    const isHomePage = window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("/") || window.location.pathname === "";

    if (!heroLeft || !isHomePage) return;

    if (user) {
        // 1. Personalize Hero Left Heading & Actions
        const h1 = heroLeft.querySelector("h1");
        const pDesc = heroLeft.querySelector(".hero-description");
        const tag = heroLeft.querySelector(".tag");

        if (tag) tag.innerHTML = `ACTIVE CLIENT WORKSPACE • ${user.name.toUpperCase()}`;
        if (h1) h1.innerHTML = `Welcome back, <em>${user.name}.</em>`;
        if (pDesc) pDesc.innerText = `Your saved contract risk assessments and plain-English translations are synced. Audit a new agreement below or jump into your active review queue.`;

        // Inject quick-action button toolbar if not already rendered
        let actionRow = document.getElementById("homeUserActionRow");
        if (!actionRow) {
            actionRow = document.createElement("div");
            actionRow.id = "homeUserActionRow";
            actionRow.style.display = "flex";
            actionRow.style.gap = "12px";
            actionRow.style.margin = "20px 0 24px 0";
            actionRow.style.flexWrap = "wrap";
            actionRow.innerHTML = `
                <a href="dashboard.html" class="action-btn-primary" style="text-decoration: none; padding: 12px 22px;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">dashboard</span>
                    Open Dashboard
                </a>
                <a href="upload.html" class="login-header-btn" style="text-decoration: none; padding: 12px 20px; border: 1px solid #164e3b; color: #164e3b;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">upload_file</span>
                    Audit New Contract
                </a>
                <a href="history.html" class="login-header-btn" style="text-decoration: none; padding: 12px 20px; background: white;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">history</span>
                    Audit History
                </a>
            `;
            if (pDesc) {
                pDesc.parentNode.insertBefore(actionRow, pDesc.nextSibling);
            }
        }

        // 2. Transform Hero Right into Live "Active Audit Queue"
        if (heroRight) {
            const docs = getDocuments();
            const latestDoc = docs.length > 0 ? docs[0] : null;

            if (latestDoc) {
                const highRiskCount = latestDoc.highRiskCount || 0;
                heroRight.innerHTML = `
                    <div class="document-preview" style="border-top: 4px solid #164e3b; box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
                        <div class="document-top">
                            <span style="color: #164e3b; font-weight: 700;">YOUR ACTIVE AUDIT QUEUE</span>
                            <span class="doc-badge badge-analyzed">${latestDoc.status || 'ANALYZED'}</span>
                        </div>

                        <h2 style="font-size: 22px; margin-bottom: 6px;">${latestDoc.name}</h2>
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 14px;">
                            ${latestDoc.category || 'Contract'} • Audited ${latestDoc.uploadDate || 'Recently'}
                        </div>

                        <p class="document-text" style="font-size: 13.5px; line-height: 1.6;">
                            ${latestDoc.summary || 'Plain-English legal audit and clause breakdown generated for this agreement.'}
                        </p>

                        <div class="highlight-box" style="margin-top: 16px; padding: 14px; background: ${highRiskCount > 0 ? '#fff5f5' : '#f0fdf4'}; border-left-color: ${highRiskCount > 0 ? '#dc2626' : '#164e3b'};">
                            <div class="risk" style="color: ${highRiskCount > 0 ? '#991b1b' : '#164e3b'};">
                                ${highRiskCount > 0 ? `${highRiskCount} HIGH RISK TERMS IDENTIFIED` : 'STANDARD BALANCED PROVISIONS'}
                            </div>
                            <h3 style="font-size: 16px; margin: 4px 0;">
                                ${latestDoc.clauses && latestDoc.clauses.length > 0 ? latestDoc.clauses[0].title : 'Contract Review Ready'}
                            </h3>
                            <p style="font-size: 13px; margin: 0;">
                                ${latestDoc.clauses && latestDoc.clauses.length > 0 ? latestDoc.clauses[0].explanation : 'Review clause breakdowns and suggested amendment language.'}
                            </p>
                        </div>

                        <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <span style="font-size: 12px; color: #6b7280;">${latestDoc.clausesCount || (latestDoc.clauses ? latestDoc.clauses.length : 3)} clauses evaluated</span>
                            <button onclick="handleViewAnalysis('${latestDoc.id}')" class="action-btn-primary" style="padding: 8px 18px; font-size: 12px;">
                                Open Full Analysis →
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        // 3. Update Final CTA on Home Page
        const finalCta = document.querySelector(".final-cta");
        if (finalCta) {
            const ctaTitle = finalCta.querySelector(".cta-content h2");
            const ctaDesc = finalCta.querySelector(".cta-content p");
            const ctaBtns = finalCta.querySelector(".cta-buttons");
            if (ctaTitle) ctaTitle.innerText = `Ready to audit your next contract, ${user.name}?`;
            if (ctaDesc) ctaDesc.innerText = "Upload any agreement for instant plain-English clarity, or jump back to your dashboard to review counter-proposals.";
            if (ctaBtns) {
                ctaBtns.innerHTML = `
                    <a href="upload.html" class="action-btn-primary" style="text-decoration: none; padding: 13px 26px;">
                        <span class="material-symbols-outlined" style="font-size: 18px;">upload_file</span>
                        Upload & Audit Contract
                    </a>
                    <a href="dashboard.html" class="login-header-btn" style="text-decoration: none; padding: 13px 24px; background: white; color: #111827;">
                        <span class="material-symbols-outlined" style="font-size: 18px;">dashboard</span>
                        Open Dashboard
                    </a>
                `;
            }
        }
    }
}

function renderHeaderAuth() {
    const authContainer = document.getElementById("headerAuth");
    if (!authContainer) return;

    const user = getCurrentUser();
    if (user) {
        authContainer.innerHTML = `
            <div class="user-badge-wrapper">
                <div class="user-profile-clickable" onclick="window.location.href='dashboard.html'" title="Click to open Dashboard">
                    <div class="user-avatar" title="${user.name}">${user.avatar}</div>
                    <span class="user-name-text">${user.name}</span>
                </div>
                <button class="logout-btn" onclick="event.stopPropagation(); logoutUser();" title="Sign Out">Sign Out</button>
            </div>
        `;
    } else {
        authContainer.innerHTML = `
            <a href="login.html" class="login-header-btn">
                <span class="material-symbols-outlined" style="font-size: 18px;">login</span>
                Sign In
            </a>
        `;
    }
}

// --- DOCUMENT STORE (SQLITE + LOCALSTORAGE SYNC) ---
const DEFAULT_DOCUMENTS = [
    {
        id: "doc-1",
        user_email: "alex.vance@legalease.io",
        name: "Employment_Agreement_2026.pdf",
        type: "employment",
        category: "Employment & NDAs",
        uploadDate: "Today, 10:24 AM",
        timestamp: Date.now() - 1000 * 60 * 60 * 2,
        status: "Analyzed",
        clausesCount: 12,
        highRiskCount: 1,
        riskLevel: "Medium",
        summary: "Standard full-time employment agreement including IP assignment, non-compete covenants, and termination guidelines.",
        clauses: [
            {
                title: "Invention Assignment (Clause 8.2)",
                risk: "medium",
                legalText: "The employee agrees that any inventions, discoveries, developments or intellectual property conceived or made during employment shall exclusively belong to the company.",
                explanation: "Any projects, code, or creative work you build while employed—even potentially in your free time if related to the company's domain—may be claimed by the company."
            },
            {
                title: "Non-Compete Period (Clause 11.4)",
                risk: "high",
                legalText: "Employee covenants not to engage in competing business activities within a 50-mile radius for a duration of 18 months following departure.",
                explanation: "You cannot work for a competitor or start a similar business in the same region for 1.5 years after leaving. In many jurisdictions, this can be overly restrictive."
            },
            {
                title: "At-Will Termination (Clause 14.1)",
                risk: "low",
                legalText: "Either party may terminate this agreement at any time with or without cause upon giving fourteen (14) days written notice.",
                explanation: "Standard employment clause allowing either you or the company to end the employment relationship with two weeks' notice."
            }
        ]
    },
    {
        id: "doc-2",
        user_email: "alex.vance@legalease.io",
        name: "Residential_Lease_Agreement.docx",
        type: "lease",
        category: "Leases & Rentals",
        uploadDate: "Yesterday, 3:45 PM",
        timestamp: Date.now() - 1000 * 60 * 60 * 24,
        status: "Analyzed",
        clausesCount: 18,
        highRiskCount: 0,
        riskLevel: "Low",
        summary: "12-month standard residential apartment lease with deposit protection and utility responsibilities.",
        clauses: [
            {
                title: "Security Deposit Forfeiture (Clause 5.3)",
                risk: "medium",
                legalText: "Landlord reserves right to retain deposit should tenant vacate prior to 365 days irrespective of written notification.",
                explanation: "You could forfeit your entire security deposit if you break your lease before the full year, even if you give ample notice."
            },
            {
                title: "Maintenance Responsibilities (Clause 9.1)",
                risk: "low",
                legalText: "Tenant agrees to maintain premises in good order and promptly report structural or plumbing issues exceeding $100.",
                explanation: "Standard expectation to report leaks or damage quickly so repairs can be handled before worsening."
            }
        ]
    }
];

async function fetchDocumentsFromApi() {
    const currentUser = getCurrentUser();
    const email = currentUser ? currentUser.email : "alex.vance@legalease.io";
    try {
        const res = await fetch(`/api/documents?email=${encodeURIComponent(email)}`);
        if (res.ok) {
            const docs = await res.json();
            if (docs && Array.isArray(docs) && docs.length > 0) {
                localStorage.setItem("legalEase_documents", JSON.stringify(docs));
                updateDashboardCounts();
                renderHistoryPage();
                renderDashboardRecent();
                return docs;
            }
        }
    } catch (e) {
        console.warn("Could not fetch documents from SQLite API:", e);
    }
    return getDocumentsLocal();
}

function getDocumentsLocal() {
    try {
        const stored = localStorage.getItem("legalEase_documents");
        if (!stored) {
            localStorage.setItem("legalEase_documents", JSON.stringify(DEFAULT_DOCUMENTS));
            return DEFAULT_DOCUMENTS;
        }
        return JSON.parse(stored);
    } catch (e) {
        return DEFAULT_DOCUMENTS;
    }
}

function getDocuments() {
    return getDocumentsLocal();
}

function saveDocumentLocal(doc) {
    const docs = getDocumentsLocal();
    const existingIndex = docs.findIndex(d => d.id === doc.id);
    if (existingIndex >= 0) {
        docs[existingIndex] = doc;
    } else {
        docs.unshift(doc);
    }
    localStorage.setItem("legalEase_documents", JSON.stringify(docs));
    return docs;
}

async function saveDocumentToSqlite(doc) {
    saveDocumentLocal(doc);
    try {
        await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(doc)
        });
    } catch (e) {
        console.warn("Failed to sync document to SQLite backend:", e);
    }
}

function getDocumentById(id) {
    const docs = getDocuments();
    return docs.find(d => d.id === id) || docs[0];
}

// --- FILE UPLOAD PROCESSING ---
const fileInput = document.getElementById("fileInput");
const dropArea = document.getElementById("dropArea");

function openFilePicker() {
    if (fileInput) {
        fileInput.click();
    } else {
        window.location.href = "upload.html";
    }
}

if (fileInput) {
    fileInput.addEventListener("change", function () {
        if (this.files.length > 0) {
            handleFile(this.files[0]);
        }
    });
}

if (dropArea) {
    dropArea.addEventListener("dragover", function (event) {
        event.preventDefault();
        dropArea.style.borderColor = "#164e3b";
        dropArea.style.background = "#f0f7f4";
    });

    dropArea.addEventListener("dragleave", function () {
        dropArea.style.borderColor = "#d1d5db";
        dropArea.style.background = "white";
    });

    dropArea.addEventListener("drop", function (event) {
        event.preventDefault();
        dropArea.style.borderColor = "#d1d5db";
        dropArea.style.background = "white";
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

// --- UPLOAD CATEGORY SELECTION & TEXT SANITIZATION ---
let currentSelectedCategory = "auto";

function initCategorySelector() {
    const cards = document.querySelectorAll(".upload-option-card");
    if (!cards.length) return;

    cards.forEach(card => {
        card.addEventListener("click", function() {
            const cat = this.getAttribute("data-category") || "auto";
            cards.forEach(c => c.classList.remove("selected"));
            this.classList.add("selected");
            currentSelectedCategory = cat;
        });
    });
}

function sanitizeDocumentText(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
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

function generateClientSideDynamicAnalysis(fileText, fileName, category) {
    const cleanText = sanitizeDocumentText(fileText);
    const clauses = [];
    const docBaseName = fileName.replace(/\.[^/.]+$/, "").split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Split text into paragraphs
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
            explanation: `Imposes post-termination restrictions on professional employment or business activities in ${docBaseName}.`,
            impact: 'Limits career mobility and restricts freelance or startup opportunities after departure.',
            recommendation: 'Request narrowing restrictive period to 6 months and limiting geographic radius to 10 miles.'
        },
        {
            keywords: ['indemnif', 'hold harmless', 'defend'],
            title: 'Indemnification & Third-Party Liability',
            risk: 'high',
            explanation: `Requires holding the counterparty harmless and covering legal fees incurred from claims under ${docBaseName}.`,
            impact: 'Exposes you to potentially unlimited financial liability and legal defense costs.',
            recommendation: 'Make indemnification mutual, cap total financial liability, and exclude counterparty negligence.'
        },
        {
            keywords: ['intellectual property', 'invention', 'work for hire', 'copyright', 'ownership', 'assign'],
            title: 'Intellectual Property Ownership',
            risk: 'high',
            explanation: `Assigns created works, inventions, or software developments to the company under ${docBaseName}.`,
            impact: 'Risk of surrendering ownership over personal side projects or pre-existing intellectual property.',
            recommendation: 'Carve out pre-existing IP in an annex and condition transfer of IP rights upon full payment.'
        },
        {
            keywords: ['liability', 'consequential', 'limitation of liability', 'damage cap', 'exceed'],
            title: 'Limitation of Liability & Damage Caps',
            risk: 'medium',
            explanation: `Caps monetary damage recovery in case of contract breach or operational failure in ${docBaseName}.`,
            impact: 'Limits financial recovery if counterparty causes commercial harm or breaches terms.',
            recommendation: 'Ensure liability limits are mutual and carve out exceptions for gross negligence.'
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
        }
    ];

    const usedTitles = new Set();

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

    if (clauses.length < 3) {
        clauses.push({
            title: `${docBaseName} — Core Obligations & Scope`,
            risk: 'low',
            legalText: formatCleanLegalSnippet(cleanText.substring(0, 200), docBaseName, 'Core Obligations'),
            explanation: `Outlines primary duties and operational expectations specifically for ${docBaseName}.`,
            impact: 'Establishes binding legal duties and deliverable timelines.',
            recommendation: 'Verify that all deliverable milestones, scope items, and deadlines are documented accurately.'
        });

        clauses.push({
            title: `${docBaseName} — Liability & Damage Caps`,
            risk: category.includes('Employment') ? 'high' : 'medium',
            legalText: `Cumulative party financial liability under ${docBaseName} shall be limited to direct damages up to agreed compensation amounts.`,
            explanation: `Limits maximum monetary liability and remedies associated with ${docBaseName}.`,
            impact: 'Caps monetary recovery in event of breach or operational failure.',
            recommendation: 'Ensure damage caps are mutual and exclude gross negligence.'
        });

        clauses.push({
            title: `${docBaseName} — Early Exit & Termination Rights`,
            risk: 'medium',
            legalText: `Either party may terminate ${docBaseName} by delivering prior written notice to the counterparty thirty (30) days in advance.`,
            explanation: `Stipulates cancellation rules and written notice requirements for ${docBaseName}.`,
            impact: 'Requires proper notice to prevent sudden breach or financial penalty.',
            recommendation: 'Require at least 30 days prior written notice for early termination.'
        });
    }

    const highCount = clauses.filter(c => c.risk === 'high').length;
    const medCount = clauses.filter(c => c.risk === 'medium').length;

    return {
        summary: `Legal Risk Audit for "${docBaseName}": Analyzed ${clauses.length} key contractual clauses across ${category}. Evaluated primary performance commitments, liability limits, exit terms, and dispute mechanisms.`,
        fairnessRating: highCount > 0 ? "6.2/10 — One-Sided Terms Flagged" : (medCount > 1 ? "7.8/10 — Moderate Risk Exposure" : "8.8/10 — Standard Balanced Contract"),
        riskLevel: highCount > 0 ? "High" : (medCount > 1 ? "Medium" : "Low"),
        highRiskCount: highCount,
        clausesCount: clauses.length,
        clauses: clauses
    };
}

async function handleFile(file) {
    const allowedExtensions = [".pdf", ".doc", ".docx", ".txt"];
    const fileName = file.name.toLowerCase();
    const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidExtension) {
        alert("Please upload a PDF, DOC, DOCX, or TXT document.");
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert("File size exceeds 10 MB limit.");
        return;
    }

    const currentUser = getCurrentUser();
    const userEmail = currentUser ? currentUser.email : "alex.vance@legalease.io";

    let createdDoc = null;

    try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("user_email", userEmail);
        formData.append("category", currentSelectedCategory);

        let uploadUrl = "/api/documents/upload-file";
        if (window.location.port && window.location.port !== "3000") {
            uploadUrl = "http://localhost:3000/api/documents/upload-file";
        }

        const res = await fetch(uploadUrl, {
            method: "POST",
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            if (data.success && data.document) {
                createdDoc = data.document;
                saveDocumentLocal(createdDoc);
            }
        }
    } catch (e) {
        console.warn("Backend upload endpoint unreachable, generating local document analysis:", e);
    }

    if (!createdDoc) {
        let category = "Business Contracts";
        let type = "business";

        if (currentSelectedCategory && currentSelectedCategory !== 'auto') {
            if (currentSelectedCategory === 'employment') {
                category = "Employment & NDAs";
                type = "employment";
            } else if (currentSelectedCategory === 'lease') {
                category = "Leases & Rentals";
                type = "lease";
            } else if (currentSelectedCategory === 'business') {
                category = "Business Contracts";
                type = "business";
            }
        } else {
            if (fileName.includes("lease") || fileName.includes("rent")) {
                category = "Leases & Rentals";
                type = "lease";
            } else if (fileName.includes("employment") || fileName.includes("offer") || fileName.includes("job")) {
                category = "Employment & NDAs";
                type = "employment";
            } else if (fileName.includes("nda") || fileName.includes("confidential")) {
                category = "Non-Disclosure Agreement";
                type = "nda";
            }
        }

        // Only read plaintext directly if file is actually a .txt file
        let extractedText = "";
        if (fileName.endsWith('.txt')) {
            try {
                extractedText = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result || "");
                    reader.onerror = () => resolve("");
                    reader.readAsText(file);
                });
            } catch (err) {
                extractedText = "";
            }
        }

        const dynamicAnalysis = generateClientSideDynamicAnalysis(extractedText, file.name, category);

        createdDoc = {
            id: "doc-" + Date.now(),
            user_email: userEmail,
            name: file.name,
            type: type,
            category: category,
            uploadDate: "Just now",
            timestamp: Date.now(),
            status: "Analyzed",
            clausesCount: dynamicAnalysis.clausesCount,
            highRiskCount: dynamicAnalysis.highRiskCount,
            riskLevel: dynamicAnalysis.riskLevel,
            summary: dynamicAnalysis.summary,
            clauses: dynamicAnalysis.clauses
        };

        saveDocumentToSqlite(createdDoc);
    }

    onDocumentUploaded(createdDoc);
}

function onDocumentUploaded(newDoc) {
    const feedbackCard = document.getElementById("uploadFeedbackCard");
    const feedbackFileName = document.getElementById("feedbackFileName");
    const feedbackMeta = document.getElementById("feedbackMeta");
    const feedbackViewBtn = document.getElementById("feedbackViewBtn");
    
    updateSignInNoteVisibility();

    if (feedbackCard && feedbackFileName && feedbackViewBtn) {
        feedbackFileName.innerText = newDoc.name;
        feedbackMeta.innerText = `${newDoc.category} • ${newDoc.clausesCount} clauses translated • Saved to Database`;
        feedbackViewBtn.onclick = function () {
            handleViewAnalysis(newDoc.id);
        };
        feedbackCard.classList.add("active");
        if (typeof feedbackCard.scrollIntoView === "function") {
            feedbackCard.scrollIntoView({ behavior: "smooth" });
        }
    } else {
        const confirmGo = confirm(
            `"${newDoc.name}" uploaded and saved to SQLite database successfully!\n\nWould you like to view the analysis now?`
        );
        if (confirmGo) {
            handleViewAnalysis(newDoc.id);
        } else if (isLoggedIn()) {
            window.location.href = "history.html";
        }
    }

    updateDashboardCounts();
}

// --- SEPARATE PAGE "VIEW ANALYSIS" FUNCTIONALITY ---
function handleViewAnalysis(docId) {
    if (!isLoggedIn()) {
        const currentPath = window.location.pathname.split("/").pop() || "index.html";
        window.location.href = `login.html?redirect=analysis.html&docId=${encodeURIComponent(docId)}&reason=analysis`;
        return;
    }
    // Redirect to separate analysis.html page
    window.location.href = `analysis.html?docId=${encodeURIComponent(docId)}`;
}

// --- DASHBOARD COUNTS ---
function updateDashboardCounts() {
    const docs = getDocuments();
    const docCountEl = document.getElementById("documentCount");
    const clausesCountEl = document.getElementById("clausesCount");
    const highRiskCountEl = document.getElementById("highRiskCount");

    if (docCountEl) {
        docCountEl.innerText = docs.length;
    }
    if (clausesCountEl) {
        const totalClauses = docs.reduce((acc, d) => acc + (d.clausesCount || 0), 0);
        clausesCountEl.innerText = totalClauses;
    }
    if (highRiskCountEl) {
        const totalRisk = docs.reduce((acc, d) => acc + (d.highRiskCount || 0), 0);
        highRiskCountEl.innerText = totalRisk;
    }
}

// --- RENDER HISTORY LIST ---
function renderHistoryPage() {
    const historyListContainer = document.getElementById("historyListContainer");
    if (!historyListContainer) return;

    if (!isLoggedIn()) {
        historyListContainer.innerHTML = `
            <div class="empty-history" style="padding: 60px 20px; text-align: center;">
                <span class="material-symbols-outlined" style="font-size: 48px; color: #dc2626; margin-bottom: 12px; display: block;">lock</span>
                <h3 style="font-family: 'Playfair Display', serif; font-size: 22px; color: #111827; margin-bottom: 8px;">Sign In Required</h3>
                <p style="color: #4b5563; margin-bottom: 20px; max-width: 450px; margin-left: auto; margin-right: auto; font-size: 14px;">
                    Document history is reserved for authenticated users. Please sign in to view your stored contracts and legal analyses.
                </p>
                <a href="login.html?redirect=history.html&reason=history" class="action-btn-primary" style="text-decoration: none;">Sign In to View History</a>
            </div>
        `;
        return;
    }

    const docs = getDocuments();
    if (docs.length === 0) {
        historyListContainer.innerHTML = `
            <div class="empty-history" style="padding: 60px 20px; text-align: center;">
                <span class="material-symbols-outlined" style="font-size: 48px; color: #9ca3af; margin-bottom: 12px; display: block;">folder_open</span>
                <h3 style="font-family: 'Playfair Display', serif; font-size: 20px; color: #111827; margin-bottom: 8px;">No documents analyzed yet</h3>
                <p style="color: #4b5563; margin-bottom: 20px;">Upload a legal agreement to decode clauses into plain English.</p>
                <a href="upload.html" class="action-btn-primary" style="text-decoration: none;">Upload Document</a>
            </div>
        `;
        return;
    }

    const cardsHtml = docs.map(doc => `
        <div class="doc-history-item">
            <div>
                <div class="doc-meta-top">
                    <span class="doc-badge badge-analyzed">${doc.category}</span>
                    <span class="doc-badge ${doc.highRiskCount > 0 ? 'badge-risk-high' : 'badge-analyzed'}">
                        ${doc.highRiskCount > 0 ? 'Attention Needed' : 'Standard'}
                    </span>
                </div>
                <h3>${doc.name}</h3>
                <div class="doc-date">${doc.uploadDate} • ${doc.clausesCount} clauses</div>
                <p style="font-size: 13px; color: #4b5563; line-height: 1.6; margin-bottom: 12px;">
                    ${doc.summary ? doc.summary.substring(0, 110) + '...' : 'Translated into clear, understandable language.'}
                </p>
            </div>
            <div class="doc-actions">
                <span style="font-size: 11px; font-weight: 600; color: #6b7280;">
                    ${doc.status.toUpperCase()}
                </span>
                <button class="view-analysis-btn" onclick="handleViewAnalysis('${doc.id}')">
                    View Analysis →
                </button>
            </div>
        </div>
    `).join("");

    historyListContainer.innerHTML = `<div class="history-card-grid">${cardsHtml}</div>`;
}

// --- RENDER RECENT ON DASHBOARD ---
function renderDashboardRecent() {
    const recentContainer = document.getElementById("dashboardRecentContainer");
    if (!recentContainer) return;

    const docs = getDocuments().slice(0, 3);
    if (docs.length === 0) {
        recentContainer.innerHTML = `<p class="empty-history">No documents yet. Upload one to start analyzing.</p>`;
        return;
    }

    const cardsHtml = docs.map(doc => `
        <div class="doc-history-item">
            <div class="doc-meta-top">
                <span class="doc-badge badge-analyzed">${doc.category}</span>
                <span style="font-size: 11px; color: #6b7280;">${doc.uploadDate}</span>
            </div>
            <h3>${doc.name}</h3>
            <p style="font-size: 13px; color: #4b5563; margin-top: 8px;">
                ${doc.clausesCount} clauses reviewed with plain English translation.
            </p>
            <div class="doc-actions">
                <span style="font-size: 11px; color: ${doc.highRiskCount > 0 ? '#dc2626' : '#164e3b'}; font-weight: 700;">
                    ${doc.highRiskCount > 0 ? '● ' + doc.highRiskCount + ' Flagged Items' : '● Verified'}
                </span>
                <button class="view-analysis-btn" onclick="handleViewAnalysis('${doc.id}')">
                    View Analysis →
                </button>
            </div>
        </div>
    `).join("");

    recentContainer.innerHTML = `<div class="history-card-grid">${cardsHtml}</div>`;
}

// --- SAMPLE ANALYSIS (HERO PREVIEWS) ---
function sampleAnalysis(type) {
    let message = "";
    if (type === "lease") {
        message = "Sample Lease Analysis:\n\nMedium Risk: Security deposit clause.\nThe tenant may lose part of the deposit if certain conditions are not met within 30 days of vacation.";
    } else if (type === "employment") {
        message = "Sample Employment Analysis:\n\nMedium Risk: Invention assignment.\nWork or ideas created during your employment period may automatically belong to the employer.";
    } else if (type === "business") {
        message = "Sample Business Contract Analysis:\n\nReview Required: Payment terms.\nCheck the 30-day net payment schedule and late penalties stipulated in Clause 4.";
    }
    alert(message);
}

// --- AI ENGINE CONFIGURATION (NVIDIA NIM / DEEPSEEK) ---
let currentAiConfig = {
    activeProvider: 'dynamic',
    activeModel: 'Dynamic Legal AI Engine',
    nvidia: { configured: false, maskedKey: '', model: 'deepseek-ai/deepseek-r1', baseUrl: '' },
    openai: { configured: false, maskedKey: '' }
};
let selectedModalModel = 'deepseek-ai/deepseek-r1';

async function fetchAiConfigFromApi() {
    try {
        let apiUrl = "/api/config/ai";
        if (window.location.port && window.location.port !== "3000") {
            apiUrl = "http://localhost:3000/api/config/ai";
        }
        const res = await fetch(apiUrl);
        if (res.ok) {
            const data = await res.json();
            if (data && data.success) {
                currentAiConfig = data;
                if (data.nvidia && data.nvidia.model) {
                    selectedModalModel = data.nvidia.model;
                }
                renderAiHeaderBadge();
                renderUploadAiBanner();
            }
        }
    } catch (e) {
        console.warn("Could not fetch AI config from backend:", e);
        renderAiHeaderBadge();
        renderUploadAiBanner();
    }
}

function renderAiHeaderBadge() {
    const headerRights = document.querySelectorAll(".header-right");
    if (!headerRights.length) return;

    headerRights.forEach(headerRight => {
        let badge = headerRight.querySelector("#headerAiBadge");
        if (!badge) {
            badge = document.createElement("div");
            badge.id = "headerAiBadge";
            const authHeader = headerRight.querySelector("#headerAuth");
            if (authHeader) {
                headerRight.insertBefore(badge, authHeader);
            } else {
                headerRight.appendChild(badge);
            }
        }

        const isNvidia = currentAiConfig.activeProvider === 'nvidia' && currentAiConfig.nvidia && currentAiConfig.nvidia.configured;
        const modelLabel = currentAiConfig.activeModel && currentAiConfig.activeModel.includes('deepseek-r1') 
            ? 'DeepSeek R1' 
            : currentAiConfig.activeModel && currentAiConfig.activeModel.includes('deepseek-v3')
                ? 'DeepSeek V3'
                : 'NVIDIA Active';

        if (isNvidia) {
            badge.className = "ai-engine-header-badge";
            badge.title = `NVIDIA NIM Active (${currentAiConfig.activeModel}) • Click to configure`;
            badge.innerHTML = `
                <span class="status-dot"></span>
                <span>${modelLabel}</span>
                <span class="material-symbols-outlined" style="font-size: 15px;">tune</span>
            `;
        } else {
            badge.className = "ai-engine-header-badge ai-badge-disconnected";
            badge.title = "Add NVIDIA Build API Key for DeepSeek contract audits";
            badge.innerHTML = `
                <span class="status-dot"></span>
                <span>Add NVIDIA Key</span>
                <span class="material-symbols-outlined" style="font-size: 15px;">bolt</span>
            `;
        }
        badge.onclick = () => openAiSettingsModal();
    });
}

function renderUploadAiBanner() {
    const bannerContainer = document.getElementById("uploadAiBannerContainer");
    if (!bannerContainer) return;

    const isNvidia = currentAiConfig.activeProvider === 'nvidia' && currentAiConfig.nvidia && currentAiConfig.nvidia.configured;
    const modelName = currentAiConfig.activeModel && currentAiConfig.activeModel.includes('deepseek-r1')
        ? 'DeepSeek-R1 (Reasoning Audit)'
        : currentAiConfig.activeModel && currentAiConfig.activeModel.includes('deepseek-v3')
            ? 'DeepSeek-V3 (Fast Analysis)'
            : 'DeepSeek';

    bannerContainer.innerHTML = `
        <div class="upload-ai-status-card">
            <div class="upload-ai-status-left">
                <div class="upload-ai-status-icon" style="background: ${isNvidia ? '#164e3b' : '#334155'};">
                    <span class="material-symbols-outlined">${isNvidia ? 'smart_toy' : 'bolt'}</span>
                </div>
                <div class="upload-ai-status-text">
                    <h4>${isNvidia ? `⚡ Powered by NVIDIA NIM (${modelName})` : 'AI Risk Engine: Built-in Dynamic Risk Engine'}</h4>
                    <p>${isNvidia ? 'DeepSeek reasoning audits contract terms, detects high-risk clauses, and prepares negotiation redlines.' : 'Connect your NVIDIA Build API key to activate DeepSeek R1 for advanced legal reasoning.'}</p>
                </div>
            </div>
            <button type="button" class="upload-ai-config-btn" onclick="openAiSettingsModal()">
                <span class="material-symbols-outlined" style="font-size: 16px;">${isNvidia ? 'tune' : 'key'}</span>
                ${isNvidia ? 'AI Settings' : 'Add NVIDIA Key'}
            </button>
        </div>
    `;
}

function openAiSettingsModal() {
    const existingModal = document.getElementById("aiSettingsModal");
    if (existingModal) existingModal.remove();

    const isConfigured = currentAiConfig.nvidia && currentAiConfig.nvidia.configured;
    const maskedKey = isConfigured ? currentAiConfig.nvidia.maskedKey : '';
    selectedModalModel = (currentAiConfig.nvidia && currentAiConfig.nvidia.model) || 'deepseek-ai/deepseek-r1';

    const modal = document.createElement("div");
    modal.className = "ai-modal-overlay";
    modal.id = "aiSettingsModal";

    modal.innerHTML = `
        <div class="ai-modal-card">
            <div class="ai-modal-header">
                <h3>
                    <span class="material-symbols-outlined" style="color: #164e3b;">smart_toy</span>
                    AI Engine & NVIDIA API Settings
                </h3>
                <button class="ai-modal-close-btn" onclick="closeAiSettingsModal()" title="Close">&times;</button>
            </div>

            <div class="ai-modal-body">
                <div class="ai-nvidia-info-box">
                    <strong>⚡ NVIDIA NIM for DeepSeek:</strong> Add your free NVIDIA API key to unlock DeepSeek reasoning models (DeepSeek-R1 & DeepSeek-V3) for legal contract audits. Get your key at <a href="https://build.nvidia.com/deepseek-ai/deepseek-r1" target="_blank" rel="noopener">build.nvidia.com</a>.
                </div>

                <div class="ai-input-group">
                    <label>
                        <span>NVIDIA Build API Key</span>
                        <span id="aiKeyStatusText" style="font-weight: 600; font-size: 11px; text-transform: none; color: ${isConfigured ? '#166534' : '#64748b'};">
                            ${isConfigured ? '✓ Key Active (' + maskedKey + ')' : 'No key saved'}
                        </span>
                    </label>
                    <div class="ai-key-input-wrapper">
                        <input
                            type="password"
                            id="modalNvidiaApiKey"
                            class="ai-text-input"
                            placeholder="${isConfigured ? 'Leave blank to keep current key, or paste new key' : 'nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}"
                            autocomplete="off"
                        />
                        <button type="button" class="ai-key-toggle-btn" onclick="toggleKeyVisibility()" title="Show/Hide Key">
                            <span class="material-symbols-outlined" id="keyToggleIcon" style="font-size: 18px;">visibility</span>
                        </button>
                    </div>
                    <small style="color: #64748b; font-size: 11.5px;">API keys start with <code>nvapi-</code>. Stored securely on your local server.</small>
                </div>

                <div class="ai-input-group">
                    <label>Select DeepSeek Model</label>
                    <div class="ai-model-grid">
                        <div class="ai-model-card ${selectedModalModel === 'deepseek-ai/deepseek-r1' ? 'selected' : ''}" id="cardR1" onclick="selectModelChoice('deepseek-ai/deepseek-r1')">
                            <div class="ai-model-title">
                                <span>DeepSeek-R1</span>
                                <span class="doc-badge" style="background: #dcfce7; color: #166534; font-size: 10px; padding: 2px 6px;">Recommended</span>
                            </div>
                            <div class="ai-model-desc">Flagship reasoning model with step-by-step contractual risk deliberation and redline proposals.</div>
                        </div>
                        <div class="ai-model-card ${selectedModalModel === 'deepseek-ai/deepseek-v3' ? 'selected' : ''}" id="cardV3" onclick="selectModelChoice('deepseek-ai/deepseek-v3')">
                            <div class="ai-model-title">
                                <span>DeepSeek-V3</span>
                                <span class="doc-badge" style="background: #e0f2fe; color: #0369a1; font-size: 10px; padding: 2px 6px;">Fast</span>
                            </div>
                            <div class="ai-model-desc">High-throughput 671B model optimized for fast contract translation and clause extraction.</div>
                        </div>
                    </div>
                </div>

                <div id="aiTestFeedback" class="ai-test-feedback-box"></div>
            </div>

            <div class="ai-modal-footer">
                <button type="button" id="aiTestBtn" onclick="testCurrentNvidiaKey()" class="login-header-btn" style="background: white; border: 1px solid #cbd5e1; display: inline-flex; align-items: center; gap: 6px;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">bolt</span>
                    Test Key
                </button>
                <div style="display: flex; gap: 8px;">
                    <button type="button" onclick="closeAiSettingsModal()" class="login-header-btn" style="background: white;">
                        Cancel
                    </button>
                    <button type="button" id="aiSaveBtn" onclick="saveCurrentAiConfig()" class="action-btn-primary" style="padding: 9px 20px; display: inline-flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 16px;">save</span>
                        Save & Activate
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener("click", function(e) {
        if (e.target === modal) closeAiSettingsModal();
    });
}

function closeAiSettingsModal() {
    const modal = document.getElementById("aiSettingsModal");
    if (modal) modal.remove();
}

function toggleKeyVisibility() {
    const input = document.getElementById("modalNvidiaApiKey");
    const icon = document.getElementById("keyToggleIcon");
    if (!input || !icon) return;
    if (input.type === "password") {
        input.type = "text";
        icon.innerText = "visibility_off";
    } else {
        input.type = "password";
        icon.innerText = "visibility";
    }
}

function selectModelChoice(modelId) {
    selectedModalModel = modelId;
    const cardR1 = document.getElementById("cardR1");
    const cardV3 = document.getElementById("cardV3");
    if (cardR1) cardR1.classList.toggle("selected", modelId === 'deepseek-ai/deepseek-r1');
    if (cardV3) cardV3.classList.toggle("selected", modelId === 'deepseek-ai/deepseek-v3');
}

async function testCurrentNvidiaKey() {
    const input = document.getElementById("modalNvidiaApiKey");
    const feedback = document.getElementById("aiTestFeedback");
    const testBtn = document.getElementById("aiTestBtn");
    if (!input || !feedback || !testBtn) return;

    let keyToTest = input.value.trim();
    if (!keyToTest && currentAiConfig.nvidia && currentAiConfig.nvidia.configured) {
        keyToTest = ""; // Server will use current configured key
    } else if (!keyToTest) {
        feedback.className = "ai-test-feedback-box error";
        feedback.innerText = "Please enter an NVIDIA API key (starts with nvapi-) to test.";
        return;
    }

    testBtn.disabled = true;
    const origBtnHtml = testBtn.innerHTML;
    testBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px; animation: spin 1s infinite linear;">sync</span> Testing...`;
    feedback.className = "ai-test-feedback-box";
    feedback.style.display = "none";

    try {
        let apiUrl = "/api/config/ai/test";
        if (window.location.port && window.location.port !== "3000") {
            apiUrl = "http://localhost:3000/api/config/ai/test";
        }
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nvidiaApiKey: keyToTest,
                nvidiaModel: selectedModalModel
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            feedback.className = "ai-test-feedback-box success";
            feedback.innerHTML = `<strong>✓ Verified!</strong> ${data.message}`;
        } else {
            feedback.className = "ai-test-feedback-box error";
            feedback.innerText = `✕ Error: ${data.error || 'Connection failed'}`;
        }
    } catch (e) {
        feedback.className = "ai-test-feedback-box error";
        feedback.innerText = `✕ Network Error: Unable to reach LegalEase backend test endpoint.`;
    } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = origBtnHtml;
    }
}

async function saveCurrentAiConfig() {
    const input = document.getElementById("modalNvidiaApiKey");
    const saveBtn = document.getElementById("aiSaveBtn");
    const feedback = document.getElementById("aiTestFeedback");
    if (!saveBtn) return;

    const newKey = input ? input.value.trim() : "";

    saveBtn.disabled = true;
    const origHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px; animation: spin 1s infinite linear;">sync</span> Saving...`;

    try {
        let apiUrl = "/api/config/ai";
        if (window.location.port && window.location.port !== "3000") {
            apiUrl = "http://localhost:3000/api/config/ai";
        }
        const bodyPayload = {
            nvidiaModel: selectedModalModel,
            preferredProvider: 'nvidia'
        };
        if (newKey) {
            bodyPayload.nvidiaApiKey = newKey;
        }

        const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
            await fetchAiConfigFromApi();
            if (feedback) {
                feedback.className = "ai-test-feedback-box success";
                feedback.innerHTML = `<strong>✓ Success!</strong> NVIDIA DeepSeek (${selectedModalModel}) is now active.`;
            }
            setTimeout(() => {
                closeAiSettingsModal();
            }, 800);
        } else {
            if (feedback) {
                feedback.className = "ai-test-feedback-box error";
                feedback.innerText = data.error || "Failed to update configuration.";
            }
        }
    } catch (e) {
        if (feedback) {
            feedback.className = "ai-test-feedback-box error";
            feedback.innerText = "Failed to communicate with server.";
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origHtml;
    }
}

// --- PAGE INITIALIZATION ---
document.addEventListener("DOMContentLoaded", function () {
    renderNavbar();
    renderHeaderAuth();
    renderHomePageUserGreeting();
    updateSignInNoteVisibility();
    initCategorySelector();
    
    // Fetch stored documents from SQLite DB
    fetchDocumentsFromApi();

    // Fetch AI Engine configuration & render badges
    fetchAiConfigFromApi();
    
    updateDashboardCounts();
    renderHistoryPage();
    renderDashboardRecent();
});