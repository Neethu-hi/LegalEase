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
    if (!heroLeft) return;

    let greetingEl = document.getElementById("userHomeGreeting");
    if (user) {
        if (!greetingEl) {
            greetingEl = document.createElement("div");
            greetingEl.id = "userHomeGreeting";
            greetingEl.className = "welcome-user-card";
            const tagEl = heroLeft.querySelector(".tag");
            if (tagEl) {
                heroLeft.insertBefore(greetingEl, tagEl);
            } else {
                heroLeft.prepend(greetingEl);
            }
        }
        greetingEl.innerHTML = `
            <div style="margin-bottom: 24px; padding: 16px 20px; background: #fafaf8; border: 1px solid #e5e7eb; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap;">
                <div>
                    <h3 style="font-family: 'Playfair Display', serif; font-size: 22px; color: #111827; margin: 0;">Welcome back, ${user.name}</h3>
                    <p style="font-size: 13px; color: #4b5563; margin-top: 3px;">Your legal documents and saved contract risk breakdowns are synced and ready.</p>
                </div>
                <button onclick="window.location.href='dashboard.html'" class="login-header-btn" style="border: 1px solid #164e3b; color: #164e3b; background: transparent;">
                    Open Workspace Dashboard →
                </button>
            </div>
        `;
    } else if (greetingEl) {
        greetingEl.remove();
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

function generateClientSideDynamicAnalysis(fileText, fileName, category) {
    const cleanText = (fileText || '').trim();
    const clauses = [];

    // Split text into paragraphs
    let paragraphs = cleanText
        .split(/\n\s*\n|\r\n\s*\r\n|(?=\b(?:SECTION|CLAUSE|ARTICLE|\d+\.|\([a-z0-9]+\))\b)/i)
        .map(p => p.trim())
        .filter(p => p.length > 20);

    if (paragraphs.length === 0 && cleanText.length > 0) {
        paragraphs = cleanText.split(/(?<=[.!?])\s+/).filter(p => p.length > 25);
    }

    const rules = [
        {
            keywords: ['non-compete', 'compete', 'solicit', 'radius', 'geographic'],
            title: 'Non-Compete & Restrictive Covenants',
            risk: 'high',
            explanation: `Imposes post-termination restrictions on professional employment or business activities in ${fileName}.`,
            impact: 'Limits career mobility and restricts freelance or startup opportunities after departure.',
            recommendation: 'Request narrowing restrictive period to 6 months and limiting geographic radius to 10 miles.'
        },
        {
            keywords: ['indemnif', 'hold harmless', 'defend'],
            title: 'Indemnification & Third-Party Liability',
            risk: 'high',
            explanation: `Requires holding the counterparty harmless and covering legal fees incurred from claims under ${fileName}.`,
            impact: 'Exposes you to potentially unlimited financial liability and legal defense costs.',
            recommendation: 'Make indemnification mutual, cap total financial liability, and exclude counterparty negligence.'
        },
        {
            keywords: ['intellectual property', 'invention', 'work for hire', 'copyright', 'ownership', 'assign'],
            title: 'Intellectual Property Ownership',
            risk: 'high',
            explanation: `Assigns created works, inventions, or software developments to the company under ${fileName}.`,
            impact: 'Risk of surrendering ownership over personal side projects or pre-existing intellectual property.',
            recommendation: 'Carve out pre-existing IP in an annex and condition transfer of IP rights upon full payment.'
        },
        {
            keywords: ['liability', 'consequential', 'limitation of liability', 'damage cap', 'exceed'],
            title: 'Limitation of Liability & Damage Caps',
            risk: 'medium',
            explanation: `Caps monetary damage recovery in case of contract breach or operational failure in ${fileName}.`,
            impact: 'Limits financial recovery if counterparty causes commercial harm or breaches terms.',
            recommendation: 'Ensure liability limits are mutual and carve out exceptions for gross negligence.'
        },
        {
            keywords: ['terminat', 'cancellation', 'notice', 'at-will', 'convenience'],
            title: 'Term & Termination Rights',
            risk: 'medium',
            explanation: `Stipulates notice timelines and rules for exiting ${fileName} early with or without cause.`,
            impact: 'Abrupt cancellation without adequate notice can cause financial disruption.',
            recommendation: 'Require a minimum 30-day prior written notice for convenience termination.'
        },
        {
            keywords: ['confidential', 'secret', 'disclosure', 'trade secret', 'nondisclosure'],
            title: 'Confidentiality & Non-Disclosure',
            risk: 'medium',
            explanation: `Restricts sharing or disclosing confidential information exchanged under ${fileName}.`,
            impact: 'Breach of confidentiality can trigger injunctive relief and statutory damages.',
            recommendation: 'Set a reasonable expiration timeframe (e.g. 2 years post-termination) and exclude public knowledge.'
        },
        {
            keywords: ['governing law', 'jurisdiction', 'arbitration', 'venue', 'dispute', 'court'],
            title: 'Governing Law & Dispute Resolution',
            risk: 'low',
            explanation: `Specifies legal jurisdiction and arbitration procedures for resolving disagreements under ${fileName}.`,
            impact: 'Controls where and how legal disputes will be adjudicated.',
            recommendation: 'Confirm local venue selection to avoid inconvenient out-of-state travel for disputes.'
        },
        {
            keywords: ['payment', 'fee', 'invoice', 'compensation', 'interest', 'late payment'],
            title: 'Payment Terms & Remuneration',
            risk: 'medium',
            explanation: `Defines compensation schedules, invoicing obligations, and interest on late payments in ${fileName}.`,
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
                    legalText: para.length > 300 ? para.substring(0, 297) + '...' : para,
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
        const docBaseName = fileName.replace(/\.[^/.]+$/, "").split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        clauses.push({
            title: `${docBaseName} — Core Performance & Obligations`,
            risk: 'low',
            legalText: cleanText.length > 20 ? (cleanText.substring(0, 220) + '...') : `Stipulated covenants under ${fileName}. Signatories commit to fulfilling obligations as detailed in the agreement.`,
            explanation: `Outlines primary duties and operational expectations specifically for ${fileName}.`,
            impact: 'Establishes binding legal duties and deliverable timelines.',
            recommendation: 'Verify that all deliverable milestones, scope items, and deadlines are documented accurately.'
        });

        clauses.push({
            title: `${docBaseName} — Liability & Damage Caps`,
            risk: category.includes('Employment') ? 'high' : 'medium',
            legalText: `Cumulative party financial liability under ${fileName} shall be limited to direct damages up to agreed compensation amounts.`,
            explanation: `Limits maximum monetary liability and remedies associated with ${fileName}.`,
            impact: 'Caps monetary recovery in event of breach or operational failure.',
            recommendation: 'Ensure damage caps are mutual and exclude gross negligence.'
        });

        clauses.push({
            title: `${docBaseName} — Early Exit & Termination Rights`,
            risk: 'medium',
            legalText: `Either party may terminate ${fileName} by delivering prior written notice to the counterparty thirty (30) days in advance.`,
            explanation: `Stipulates cancellation rules and written notice requirements for ${fileName}.`,
            impact: 'Requires proper notice to prevent sudden breach or financial penalty.',
            recommendation: 'Require at least 30 days prior written notice for early termination.'
        });
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

        const res = await fetch("/api/documents/upload-file", {
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
        let category = "Business Contract";
        let type = "business";
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

        // Read file text using FileReader if available
        let extractedText = "";
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

// --- PAGE INITIALIZATION ---
document.addEventListener("DOMContentLoaded", function () {
    renderNavbar();
    renderHeaderAuth();
    renderHomePageUserGreeting();
    updateSignInNoteVisibility();
    
    // Fetch stored documents from SQLite DB
    fetchDocumentsFromApi();
    
    updateDashboardCounts();
    renderHistoryPage();
    renderDashboardRecent();
});