const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { authenticate } = require("@google-cloud/local-auth");
const cheerio = require("cheerio");

// ============================================================
// CONFIGURATION
// ============================================================

const ROOT_DIR = path.join(__dirname, "..");

const CREDENTIALS_PATH = path.join(
    ROOT_DIR,
    "credentials",
    "credentials.json"
);

const TOKEN_PATH = path.join(
    ROOT_DIR,
    "credentials",
    "token.json"
);

const EMAIL_DUMP_DIR = path.join(
    __dirname,
    "email-dump"
);

const JOBS_PATH = path.join(
    __dirname,
    "jobs.json"
);

const MATCHED_JOBS_PATH = path.join(
    __dirname,
    "matched-jobs.json"
);

const PROFILE = {
    name: "Animesh Pandey",

    experienceYears: 4.1,

    targetRoles: [
        "angular developer",
        "senior angular developer",
        "lead angular developer",
        "frontend developer",
        "senior frontend developer",
        "ui developer",
        "ui engineer",
        "frontend engineer",
        "software engineer frontend",
        "software developer frontend"
    ],

    preferredLocations: [
        "bengaluru",
        "bangalore",
        "pune",
        "noida",
        "lucknow"
    ],

    acceptableLocations: [
        "delhi",
        "delhi ncr",
        "gurugram",
        "gurgaon",
        "hyderabad",
        "remote",
        "hybrid"
    ],

    primarySkills: [
        "angular",
        "typescript",
        "javascript",
        "html",
        "css",
        "frontend",
        "front end",
        "rxjs",
        "angular material"
    ],

    secondarySkills: [
        "node.js",
        "nodejs",
        "express",
        "rest api",
        "restful",
        "git",
        "azure devops",
        "playwright",
        "d3.js",
        "excel",
        "npm"
    ],

    transferableSkills: [
        "react",
        "react.js",
        "reactjs"
    ]
};

// Gmail scopes
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send"
];

// ============================================================
// UTILITIES
// ============================================================

function ensureDirectories() {
    fs.mkdirSync(path.dirname(TOKEN_PATH), {
        recursive: true
    });

    fs.mkdirSync(EMAIL_DUMP_DIR, {
        recursive: true
    });
}

function normalizeText(value = "") {
    return value
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanText(value = "") {
    return normalizeText(
        value
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
    );
}

function lower(value = "") {
    return normalizeText(value).toLowerCase();
}

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function decodeHtml(value = "") {
    return value
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&nbsp;/gi, " ");
}

// ============================================================
// GOOGLE AUTH
// ============================================================

async function authorize() {
    console.log("Starting Google authentication...");

    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error(
            `Gmail credentials not found:\n${CREDENTIALS_PATH}`
        );
    }

    let auth;

    if (fs.existsSync(TOKEN_PATH)) {
        try {
            const token = JSON.parse(
                fs.readFileSync(TOKEN_PATH, "utf8")
            );

            const installed =
                token.installed ||
                token.web ||
                token;

            const clientId =
                installed.client_id;

            const clientSecret =
                installed.client_secret;

            const redirectUri =
                installed.redirect_uris?.[0] ||
                "http://localhost";

            if (clientId && clientSecret) {
                auth = new google.auth.OAuth2(
                    clientId,
                    clientSecret,
                    redirectUri
                );

                auth.setCredentials(token);

                console.log(
                    "Existing Gmail authentication loaded."
                );
            }
        } catch (error) {
            console.log(
                "Existing token could not be loaded. Re-authenticating..."
            );
        }
    }

    if (!auth) {
        auth = await authenticate({
            keyfilePath: CREDENTIALS_PATH,
            scopes: SCOPES
        });

        fs.writeFileSync(
            TOKEN_PATH,
            JSON.stringify(auth.credentials, null, 2)
        );

        console.log(
            "New Gmail authentication saved."
        );
    }

    console.log("Google authentication successful.");

    return auth;
}

// ============================================================
// GMAIL HELPERS
// ============================================================

function decodeBase64(data = "") {
    return Buffer.from(
        data.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
    ).toString("utf8");
}

function extractBody(payload) {
    if (!payload) {
        return {
            html: "",
            text: ""
        };
    }

    let html = "";
    let text = "";

    function walk(part) {
        if (!part) return;

        const mimeType = part.mimeType || "";

        if (
            mimeType === "text/html" &&
            part.body &&
            part.body.data
        ) {
            html += decodeBase64(part.body.data);
        }

        if (
            mimeType === "text/plain" &&
            part.body &&
            part.body.data
        ) {
            text += decodeBase64(part.body.data);
        }

        if (Array.isArray(part.parts)) {
            for (const child of part.parts) {
                walk(child);
            }
        }
    }

    walk(payload);

    return {
        html,
        text
    };
}

function getHeader(headers, name) {
    const header = headers?.find(
        h => lower(h.name) === lower(name)
    );

    return header?.value || "";
}

// ============================================================
// EXPERIENCE EXTRACTION
// ============================================================

function parseExperience(text = "") {
    const value = normalizeText(text);

    const patterns = [
        /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,

        /(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/i,

        /experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,

        /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:experience)?/i
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);

        if (!match) continue;

        if (match[2]) {
            return {
                min: Number(match[1]),
                max: Number(match[2]),
                text: `${match[1]} - ${match[2]} Years`
            };
        }

        if (match[1]) {
            const min = Number(match[1]);

            return {
                min,
                max: min,
                text: `${min}+ Years`
            };
        }
    }

    return null;
}

function extractExperienceFromUrl(url = "") {
    if (!url) return null;

    const decoded = decodeURIComponent(url);

    // Example:
    // bengaluru-3-to-7-years-130826009822
    let match = decoded.match(
        /(\d+(?:\.\d+)?)-to-(\d+(?:\.\d+)?)-years/i
    );

    if (match) {
        return {
            min: Number(match[1]),
            max: Number(match[2]),
            text: `${match[1]} - ${match[2]} Years`
        };
    }

    match = decoded.match(
        /(\d+(?:\.\d+)?)[-_](\d+(?:\.\d+)?)[-_]years/i
    );

    if (match) {
        return {
            min: Number(match[1]),
            max: Number(match[2]),
            text: `${match[1]} - ${match[2]} Years`
        };
    }

    return null;
}

// ============================================================
// LOCATION
// ============================================================

function extractLocation(text = "", url = "") {
    const combined = normalizeText(
        `${text} ${url}`
    );

    const locations = [
        "bengaluru",
        "bangalore",
        "pune",
        "noida",
        "lucknow",
        "mumbai",
        "hyderabad",
        "delhi",
        "delhi ncr",
        "gurugram",
        "gurgaon",
        "kolkata",
        "chennai",
        "remote",
        "hybrid"
    ];

    const found = [];

    const lowerText = lower(combined);

    for (const location of locations) {
        if (lowerText.includes(location)) {
            found.push(location);
        }
    }

    if (found.length === 0) {
        return "Not detected";
    }

    const unique = [...new Set(found)];

    if (
        unique.includes("bengaluru") &&
        unique.includes("bangalore")
    ) {
        return "Bengaluru";
    }

    return unique
        .map(x =>
            x.charAt(0).toUpperCase() + x.slice(1)
        )
        .join(", ");
}

// ============================================================
// JOB ID / URL
// ============================================================

function extractJobId(url = "") {
    if (!url) return null;

    const match = url.match(
        /job-listings-[^?#]*-(\d{8,})/i
    );

    if (match) {
        return match[1];
    }

    const direct = url.match(
        /(?:jobId|jobid|job_id)=(\d{6,})/i
    );

    return direct ? direct[1] : null;
}

function cleanNaukriUrl(url = "") {
    if (!url) return "";

    try {
        const parsed = new URL(url);

        if (
            parsed.hostname.includes("naukri.com")
        ) {
            const pathName = parsed.pathname;

            if (
                pathName.includes("/jd/job-listings-")
            ) {
                return `https://www.naukri.com${pathName}`;
            }
        }
    } catch {
        // Ignore invalid URL
    }

    return url;
}

// ============================================================
// TITLE EXTRACTION
// ============================================================

function cleanJobTitle(title = "") {
    let result = normalizeText(title);

    result = result
        .replace(
            /\s+\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*Years?.*$/i,
            ""
        )
        .replace(
            /\s+\d+(?:\.\d+)?\s*to\s*\d+(?:\.\d+)?\s*Years?.*$/i,
            ""
        );

    result = result
        .replace(/\s*[-|]\s*Bengaluru.*$/i, "")
        .replace(/\s*[-|]\s*Bangalore.*$/i, "")
        .replace(/\s*[-|]\s*Pune.*$/i, "")
        .replace(/\s*[-|]\s*Mumbai.*$/i, "")
        .replace(/\s*[-|]\s*Delhi.*$/i, "");

    return normalizeText(result);
}

function extractTitleFromUrl(url = "") {
    if (!url) return "";

    try {
        const parsed = new URL(url);

        const path = parsed.pathname;

        const match = path.match(
            /job-listings-(.+)-\d{8,}$/i
        );

        if (!match) return "";

        let title = match[1];

        title = title.replace(
            /-(?:bengaluru|bangalore|pune|mumbai|delhi|hyderabad|chennai|noida|lucknow).*$/i,
            ""
        );

        title = title.replace(
            /-\d+(?:\.\d+)?-to-\d+(?:\.\d+)?-years.*$/i,
            ""
        );

        title = title.replace(/-/g, " ");

        return cleanJobTitle(title);
    } catch {
        return "";
    }
}

// ============================================================
// COMPANY EXTRACTION
// ============================================================

function extractCompanyFromUrl(url = "") {
    if (!url) return "";

    try {
        const parsed = new URL(url);

        const path = parsed.pathname;

        const match = path.match(
            /job-listings-(.+)-\d{8,}$/i
        );

        if (!match) return "";

        const slug = match[1];

        const experienceMatch = slug.match(
            /-(\d+(?:\.\d+)?)-to-(\d+(?:\.\d+)?)-years/i
        );

        let beforeExperience = experienceMatch
            ? slug.substring(
                0,
                experienceMatch.index
            )
            : slug;

        const locationMatch =
            beforeExperience.match(
                /-(bengaluru|bangalore|pune|mumbai|delhi|hyderabad|chennai|noida|lucknow|gurgaon|gurugram).*$/i
            );

        if (locationMatch) {
            beforeExperience =
                beforeExperience.substring(
                    0,
                    locationMatch.index
                );
        }

        const titleKeywords = [
            "angular-developer",
            "senior-angular-developer",
            "lead-angular-developer",
            "frontend-developer",
            "front-end-developer",
            "senior-frontend-developer",
            "react-developer",
            "react-js-developer",
            "ui-developer",
            "ui-engineer",
            "front-end-engineer"
        ];

        for (const keyword of titleKeywords) {
            if (
                beforeExperience.startsWith(
                    keyword + "-"
                )
            ) {
                beforeExperience =
                    beforeExperience.substring(
                        keyword.length + 1
                    );
                break;
            }
        }

        if (!beforeExperience) {
            return "";
        }

        return beforeExperience
            .replace(/-/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();

    } catch {
        return "";
    }
}

// ============================================================
// SKILLS
// ============================================================

function findSkills(text = "") {
    const content = lower(text);

    const primary = PROFILE.primarySkills.filter(
        skill => content.includes(lower(skill))
    );

    const secondary = PROFILE.secondarySkills.filter(
        skill => content.includes(lower(skill))
    );

    const transferable =
        PROFILE.transferableSkills.filter(
            skill => content.includes(lower(skill))
        );

    return {
        primary: [...new Set(primary)],
        secondary: [...new Set(secondary)],
        transferable: [...new Set(transferable)]
    };
}

// ============================================================
// ROLE DETECTION
// ============================================================

function detectRoleType(title = "", text = "") {
    const combined = lower(
        `${title} ${text}`
    );

    return {
        angular:
            /\bangular\b/i.test(combined),

        frontend:
            /\b(frontend|front-end|ui developer|ui engineer)\b/i.test(
                combined
            ),

        react:
            /\b(react|react\.js|reactjs)\b/i.test(
                combined
            ),

        senior:
            /\b(senior|sr\.?)\b/i.test(
                combined
            ),

        lead:
            /\b(lead|principal)\b/i.test(
                combined
            )
    };
}

// ============================================================
// MATCH SCORING
// ============================================================

function calculateMatch(job) {
    const title = lower(job.title);
    const description = lower(
        `${job.title} ${job.rawText}`
    );

    const role = detectRoleType(
        job.title,
        description
    );

    const skills = findSkills(description);

    let score = 0;

    const reasons = [];

    // --------------------------------------------------------
    // Angular - strongest signal
    // --------------------------------------------------------

    if (role.angular) {
        score += 30;
        reasons.push("Strong Angular match");
    }

    // --------------------------------------------------------
    // Target frontend role
    // --------------------------------------------------------

    if (
        role.frontend ||
        PROFILE.targetRoles.some(
            r => title.includes(r)
        )
    ) {
        score += 12;
        reasons.push("Target frontend role");
    }

    // --------------------------------------------------------
    // Primary technologies
    // --------------------------------------------------------

    if (
        skills.primary.includes("typescript")
    ) {
        score += 8;
    }

    if (
        skills.primary.includes("javascript")
    ) {
        score += 6;
    }

    if (
        skills.primary.includes("rxjs")
    ) {
        score += 5;
    }

    if (
        skills.primary.includes("angular material")
    ) {
        score += 4;
    }

    // --------------------------------------------------------
    // Secondary technologies
    // --------------------------------------------------------

    const relevantSecondary =
        skills.secondary.filter(
            skill =>
                skill !== "git" &&
                skill !== "npm"
        );

    if (relevantSecondary.length > 0) {
        score += Math.min(
            relevantSecondary.length * 2,
            6
        );
    }

    // --------------------------------------------------------
    // Experience
    // --------------------------------------------------------

    if (job.experience) {
        const min = job.experience.min;
        const max = job.experience.max;
        const userExp = PROFILE.experienceYears;

        if (
            userExp >= min &&
            userExp <= max
        ) {
            score += 20;
            reasons.push(
                "Experience range matches"
            );
        } else if (
            userExp >= min - 1 &&
            userExp <= max + 1
        ) {
            score += 12;
            reasons.push(
                "Experience range is close"
            );
        } else if (
            userExp >= min - 2 &&
            userExp <= max + 2
        ) {
            score += 6;
            reasons.push(
                "Experience is reasonably close"
            );
        }
    }

    // --------------------------------------------------------
    // Location
    // --------------------------------------------------------

    const location = lower(
        job.location
    );

    const preferred =
        PROFILE.preferredLocations.some(
            x => location.includes(x)
        );

    const acceptable =
        PROFILE.acceptableLocations.some(
            x => location.includes(x)
        );

    if (preferred) {
        score += 15;
        reasons.push(
            "Preferred location"
        );
    } else if (acceptable) {
        score += 7;
        reasons.push(
            "Acceptable location"
        );
    }

    // --------------------------------------------------------
    // Senior / Lead
    // --------------------------------------------------------

    if (role.senior) {
        score += 6;
        reasons.push(
            "Senior-level role"
        );
    }

    if (role.lead) {
        score += 5;
        reasons.push(
            "Lead-level opportunity"
        );
    }

    // --------------------------------------------------------
    // React penalty
    // --------------------------------------------------------

    if (
        role.react &&
        !role.angular
    ) {
        score -= 12;

        reasons.push(
            "React-focused rather than Angular-focused"
        );
    }

    // --------------------------------------------------------
    // Full stack penalty
    // --------------------------------------------------------

    if (
        /\bfull\s*stack\b/i.test(title)
    ) {
        score -= 8;

        reasons.push(
            "Full-stack focused role"
        );
    }

    // --------------------------------------------------------
    // Clamp
    // --------------------------------------------------------

    score = Math.max(
        0,
        Math.min(100, score)
    );

    let category;

    if (score >= 80) {
        category = "EXCELLENT";
    } else if (score >= 65) {
        category = "GOOD";
    } else if (score >= 45) {
        category = "POSSIBLE";
    } else {
        category = "SKIP";
    }

    return {
        score,
        category,
        reasons,
        skills
    };
}

// ============================================================
// JOB EXTRACTION
// ============================================================

function extractJobCards(html) {
    const $ = cheerio.load(html);

    const jobs = [];

    const links = $("a[href]");

    links.each((index, element) => {
        const href = $(element).attr("href");

        if (!href) return;

        if (
            !href.includes("naukri.com/jd/job-listings")
        ) {
            return;
        }

        const url = cleanNaukriUrl(
            href
        );

        const jobId =
            extractJobId(url);

        if (!jobId) return;

        const anchorText =
            normalizeText(
                $(element).text()
            );

        const parentText =
            normalizeText(
                $(element)
                    .parent()
                    .text()
            );

        const grandParentText =
            normalizeText(
                $(element)
                    .parent()
                    .parent()
                    .text()
            );

        const rawText =
            normalizeText(
                `${anchorText} ${parentText} ${grandParentText}`
            );

        // ----------------------------------------------------
        // Title
        // ----------------------------------------------------

        let title =
            extractTitleFromUrl(url);

        if (!title) {
            title =
                cleanJobTitle(
                    anchorText
                );
        }

        // ----------------------------------------------------
        // Experience
        // ----------------------------------------------------

        let experience =
            parseExperience(rawText);

        if (!experience) {
            experience =
                extractExperienceFromUrl(
                    url
                );
        }

        // ----------------------------------------------------
        // Location
        // ----------------------------------------------------

        const location =
            extractLocation(
                rawText,
                url
            );

        // ----------------------------------------------------
        // Company
        // ----------------------------------------------------

        let company =
            extractCompanyFromUrl(
                url
            );

        if (!company) {
            company =
                extractCompanyFromText(
                    rawText,
                    title
                );
        }

        jobs.push({
            jobId,
            title:
                title ||
                "Unknown Job",
            company:
                company ||
                "Company Not Detected",
            location,
            experience,
            url,
            rawText
        });
    });

    return jobs;
}

function extractCompanyFromText(
    text = "",
    title = ""
) {
    const normalized =
        normalizeText(text);

    if (!normalized) {
        return "";
    }

    if (!title) {
        return "";
    }

    const titleIndex =
        lower(normalized).indexOf(
            lower(title)
        );

    if (titleIndex === -1) {
        return "";
    }

    let remainder =
        normalized.substring(
            titleIndex + title.length
        );

    remainder =
        remainder
            .replace(
                /^\s*[-|,:]\s*/,
                ""
            );

    const experience =
        remainder.match(
            /\d+(?:\.\d+)?\s*(?:-|to)\s*\d+(?:\.\d+)?\s*(?:years?|yrs?)/i
        );

    if (experience) {
        remainder =
            remainder.substring(
                0,
                experience.index
            );
    }

    remainder =
        remainder
            .split("|")[0]
            .split("·")[0]
            .trim();

    if (
        remainder.length > 2 &&
        remainder.length < 100
    ) {
        return remainder;
    }

    return "";
}

// ============================================================
// EMAIL PARSING
// ============================================================

async function getNaukriEmails(auth) {
    const gmail =
        google.gmail({
            version: "v1",
            auth
        });

    console.log(
        "\nTesting Gmail API connection..."
    );

    const profile =
        await gmail.users.getProfile({
            userId: "me"
        });

    console.log(
        `Gmail account: ${profile.data.emailAddress}`
    );

    console.log(
        "\nSearching Gmail for Naukri job alerts..."
    );

    const response =
        await gmail.users.messages.list({
            userId: "me",
            q:
                "from:(naukri) newer_than:1d",
            maxResults: 20
        });

    const messages =
        response.data.messages || [];

    console.log(
        `Found ${messages.length} Naukri email(s).`
    );

    return {
        gmail,
        messages
    };
}

async function processEmail(
    gmail,
    messageId,
    index
) {
    const response =
        await gmail.users.messages.get({
            userId: "me",
            id: messageId,
            format: "full"
        });

    const message =
        response.data;

    const headers =
        message.payload?.headers || [];

    const subject =
        getHeader(
            headers,
            "Subject"
        );

    const from =
        getHeader(
            headers,
            "From"
        );

    const date =
        getHeader(
            headers,
            "Date"
        );

    console.log(
        `\nProcessing email ${index}...`
    );

    console.log(
        `Subject: ${subject}`
    );

    console.log(
        `From: ${from}`
    );

    const body =
        extractBody(
            message.payload
        );

    const html =
        body.html || "";

    const text =
        body.text || "";

    const htmlPath =
        path.join(
            EMAIL_DUMP_DIR,
            `email-${index}.html`
        );

    const textPath =
        path.join(
            EMAIL_DUMP_DIR,
            `email-${index}.txt`
        );

    fs.writeFileSync(
        htmlPath,
        html,
        "utf8"
    );

    fs.writeFileSync(
        textPath,
        text,
        "utf8"
    );

    console.log(
        `HTML saved: ${htmlPath}`
    );

    const jobs =
        extractJobCards(html);

    console.log(
        `Jobs extracted from this email: ${jobs.length}`
    );

    return {
        subject,
        from,
        date,
        jobs
    };
}

// ============================================================
// DEDUPLICATION
// ============================================================

function deduplicateJobs(jobs) {
    const map =
        new Map();

    for (const job of jobs) {
        if (!job.jobId) continue;

        if (!map.has(job.jobId)) {
            map.set(
                job.jobId,
                job
            );
        }
    }

    return [...map.values()];
}

// ============================================================
// REPORT GENERATION
// ============================================================

function scoreBadge(category) {
    if (category === "EXCELLENT") {
        return "🔥";
    }

    if (category === "GOOD") {
        return "⭐";
    }

    if (category === "POSSIBLE") {
        return "👀";
    }

    return "⏭️";
}

function buildJobCard(job) {
    const badge =
        scoreBadge(
            job.category
        );

    const experience =
        job.experience?.text ||
        "Not detected";

    const skills =
        [
            ...job.match.skills.primary,
            ...job.match.skills.secondary
        ];

    const uniqueSkills =
        [...new Set(skills)];

    const skillHtml =
        uniqueSkills.length
            ? uniqueSkills
                .slice(0, 8)
                .map(
                    skill =>
                        `<span class="skill">${escapeHtml(skill)}</span>`
                )
                .join("")
            : `<span class="muted">No additional skills detected</span>`;

    const reasonsHtml =
        job.match.reasons
            .map(
                reason =>
                    `<li>${escapeHtml(reason)}</li>`
            )
            .join("");

    return `
        <div class="job-card">

            <div class="job-header">

                <div>
                    <div class="category">
                        ${badge} ${escapeHtml(job.category)}
                    </div>

                    <h2>
                        ${escapeHtml(job.title)}
                    </h2>

                    <div class="company">
                        ${escapeHtml(job.company)}
                    </div>
                </div>

                <div class="score">
                    ${job.match.score}
                    <span>/100</span>
                </div>

            </div>

            <div class="metadata">

                <div>
                    📍
                    <strong>Location</strong><br>
                    ${escapeHtml(job.location)}
                </div>

                <div>
                    💼
                    <strong>Experience</strong><br>
                    ${escapeHtml(experience)}
                </div>

                <div>
                    🆔
                    <strong>Job ID</strong><br>
                    ${escapeHtml(job.jobId)}
                </div>

            </div>

            <div class="section-title">
                Why this matches you
            </div>

            <ul class="reasons">
                ${reasonsHtml}
            </ul>

            <div class="section-title">
                Relevant skills detected
            </div>

            <div class="skills">
                ${skillHtml}
            </div>

            <div class="actions">

                <a
                    class="apply-button"
                    href="${escapeHtml(job.url)}"
                    target="_blank"
                >
                    Apply Now →
                </a>

            </div>

        </div>
    `;
}

function buildEmailHtml(jobs) {
    const excellent =
        jobs.filter(
            j => j.category === "EXCELLENT"
        ).length;

    const good =
        jobs.filter(
            j => j.category === "GOOD"
        ).length;

    const possible =
        jobs.filter(
            j => j.category === "POSSIBLE"
        ).length;

    const today =
        new Date().toLocaleDateString(
            "en-IN",
            {
                day: "numeric",
                month: "short",
                year: "numeric"
            }
        );

    const cards =
        jobs
            .filter(
                job =>
                    job.category !== "SKIP"
            )
            .sort(
                (a, b) =>
                    b.match.score -
                    a.match.score
            )
            .map(
                buildJobCard
            )
            .join("");

    return `
<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<title>
Naukri Job Match Report
</title>

<style>

body {
    margin: 0;
    padding: 0;
    background: #f4f6f8;
    font-family:
        Arial,
        Helvetica,
        sans-serif;
    color: #1f2937;
}

.container {
    max-width: 760px;
    margin: 30px auto;
    padding: 0 16px;
}

.header {
    background: #111827;
    color: white;
    padding: 28px;
    border-radius: 16px 16px 0 0;
}

.header h1 {
    margin: 0 0 8px;
    font-size: 25px;
}

.header p {
    margin: 0;
    color: #d1d5db;
}

.summary {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    background: white;
    padding: 18px;
    border-bottom: 1px solid #e5e7eb;
}

.summary-item {
    flex: 1;
    min-width: 120px;
    padding: 14px;
    border-radius: 10px;
    background: #f9fafb;
    text-align: center;
}

.summary-number {
    font-size: 24px;
    font-weight: 700;
}

.summary-label {
    margin-top: 4px;
    font-size: 12px;
    color: #6b7280;
}

.job-card {
    background: white;
    margin-top: 16px;
    padding: 22px;
    border-radius: 14px;
    border: 1px solid #e5e7eb;
}

.job-header {
    display: flex;
    justify-content: space-between;
    gap: 15px;
}

.category {
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 7px;
}

.job-card h2 {
    margin: 0;
    font-size: 20px;
}

.company {
    margin-top: 6px;
    color: #4b5563;
    font-weight: 600;
}

.score {
    font-size: 27px;
    font-weight: 800;
    white-space: nowrap;
}

.score span {
    font-size: 13px;
    color: #9ca3af;
}

.metadata {
    display: grid;
    grid-template-columns:
        repeat(3, 1fr);
    gap: 10px;
    margin-top: 18px;
}

.metadata > div {
    background: #f9fafb;
    padding: 12px;
    border-radius: 9px;
    font-size: 13px;
    line-height: 1.5;
}

.section-title {
    margin-top: 20px;
    margin-bottom: 8px;
    font-weight: 700;
    font-size: 14px;
}

.reasons {
    margin: 0;
    padding-left: 20px;
}

.reasons li {
    margin-bottom: 5px;
    font-size: 14px;
}

.skills {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
}

.skill {
    background: #eef2ff;
    color: #3730a3;
    padding: 5px 9px;
    border-radius: 20px;
    font-size: 12px;
}

.muted {
    color: #9ca3af;
    font-size: 13px;
}

.actions {
    margin-top: 22px;
}

.apply-button {
    display: inline-block;
    padding: 11px 18px;
    background: #111827;
    color: white !important;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 700;
    font-size: 14px;
}

.footer {
    text-align: center;
    padding: 25px;
    color: #9ca3af;
    font-size: 12px;
}

@media(max-width:600px) {

    .metadata {
        grid-template-columns: 1fr;
    }

    .job-header {
        flex-direction: column;
    }

}

</style>

</head>

<body>

<div class="container">

    <div class="header">

        <h1>
            🎯 Your Naukri Job Match Report
        </h1>

        <p>
            Curated for ${escapeHtml(PROFILE.name)}
            · ${today}
        </p>

    </div>

    <div class="summary">

        <div class="summary-item">
            <div class="summary-number">
                ${excellent}
            </div>
            <div class="summary-label">
                🔥 Excellent
            </div>
        </div>

        <div class="summary-item">
            <div class="summary-number">
                ${good}
            </div>
            <div class="summary-label">
                ⭐ Good
            </div>
        </div>

        <div class="summary-item">
            <div class="summary-number">
                ${possible}
            </div>
            <div class="summary-label">
                👀 Possible
            </div>
        </div>

        <div class="summary-item">
            <div class="summary-number">
                ${jobs.length}
            </div>
            <div class="summary-label">
                Total Matches
            </div>
        </div>

    </div>

    ${cards || `
        <div class="job-card">
            <h2>
                No meaningful jobs found
            </h2>
            <p>
                No jobs crossed the current matching threshold.
            </p>
        </div>
    `}

    <div class="footer">

        Generated automatically from Naukri job alerts.

        <br><br>

        Angular & Frontend focused matching
        based on your current profile.

    </div>

</div>

</body>

</html>
`;
}

// ============================================================
// SEND EMAIL
// ============================================================

function encodeBase64Url(value) {
    return Buffer
        .from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function sendEmailReport(
    gmail,
    jobs
) {
    if (!jobs.length) {
        console.log(
            "No meaningful jobs found."
        );

        console.log(
            "No email report will be sent."
        );

        return;
    }

    const html =
        buildEmailHtml(
            jobs
        );

    const excellent =
        jobs.filter(
            j => j.category === "EXCELLENT"
        ).length;

    const good =
        jobs.filter(
            j => j.category === "GOOD"
        ).length;

    const possible =
        jobs.filter(
            j => j.category === "POSSIBLE"
        ).length;

const subject =
    `Naukri Job Matches: ${excellent} Excellent, ${good} Good, ${possible} Possible`;

    const message = [
        `From: Animesh Pandey`,
        `To: animeshpandeyit@gmail.com`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        "",
        html
    ].join("\r\n");

    const encoded =
        encodeBase64Url(
            message
        );

    await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: encoded
        }
    });

    console.log(
        "\nEmail report sent to animeshpandeyit@gmail.com"
    );
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    ensureDirectories();

    const auth =
        await authorize();

    const {
        gmail,
        messages
    } = await getNaukriEmails(
        auth
    );

    const allJobs = [];

    for (
        let i = 0;
        i < messages.length;
        i++
    ) {
        const result =
            await processEmail(
                gmail,
                messages[i].id,
                i + 1
            );

        allJobs.push(
            ...result.jobs
        );
    }

    const uniqueJobs =
        deduplicateJobs(
            allJobs
        );

    console.log(
        `\n========================================`
    );

    console.log(
        `TOTAL UNIQUE JOBS: ${uniqueJobs.length}`
    );

    // --------------------------------------------------------
    // Match every job
    // --------------------------------------------------------

    const processedJobs =
        uniqueJobs.map(job => {

            const match =
                calculateMatch(
                    job
                );

            return {
                ...job,
                match,
                score: match.score,
                category: match.category
            };
        });

    const meaningfulJobs =
        processedJobs
            .filter(
                job =>
                    job.category !== "SKIP"
            )
            .sort(
                (a, b) =>
                    b.score -
                    a.score
            );

    console.log(
        `MEANINGFUL JOBS: ${meaningfulJobs.length}`
    );

    // --------------------------------------------------------
    // Print jobs
    // --------------------------------------------------------

    for (
        let i = 0;
        i < meaningfulJobs.length;
        i++
    ) {
        const job =
            meaningfulJobs[i];

        console.log(
            `\n${i + 1}. ${job.title}`
        );

        console.log(
            `   Company: ${job.company}`
        );

        console.log(
            `   Location: ${job.location}`
        );

        console.log(
            `   Experience: ${job.experience?.text ||
            "Not detected"
            }`
        );

        console.log(
            `   Match Score: ${job.score}/100`
        );

        console.log(
            `   Category: ${job.category}`
        );

        console.log(
            `   Why: ${job.match.reasons.join(
                " | "
            )}`
        );

        console.log(
            `   Job ID: ${job.jobId}`
        );

        console.log(
            `   URL: ${job.url}`
        );
    }

    // --------------------------------------------------------
    // Summary
    // --------------------------------------------------------

    const excellent =
        processedJobs.filter(
            j => j.category === "EXCELLENT"
        ).length;

    const good =
        processedJobs.filter(
            j => j.category === "GOOD"
        ).length;

    const possible =
        processedJobs.filter(
            j => j.category === "POSSIBLE"
        ).length;

    const skip =
        processedJobs.filter(
            j => j.category === "SKIP"
        ).length;

    console.log(
        `\n========================================`
    );

    console.log(
        `JOB MATCH SUMMARY`
    );

    console.log(
        `========================================`
    );

    console.log(
        `EXCELLENT : ${excellent}`
    );

    console.log(
        `GOOD      : ${good}`
    );

    console.log(
        `POSSIBLE  : ${possible}`
    );

    console.log(
        `SKIP      : ${skip}`
    );

    console.log(
        `========================================`
    );

    // --------------------------------------------------------
    // Save all jobs
    // --------------------------------------------------------

    fs.writeFileSync(
        JOBS_PATH,
        JSON.stringify(
            processedJobs,
            null,
            2
        ),
        "utf8"
    );

    fs.writeFileSync(
        MATCHED_JOBS_PATH,
        JSON.stringify(
            meaningfulJobs,
            null,
            2
        ),
        "utf8"
    );

    // --------------------------------------------------------
    // Email
    // --------------------------------------------------------

    await sendEmailReport(
        gmail,
        meaningfulJobs
    );

    console.log(
        `\n========================================`
    );

    console.log(
        `GMAIL JOB FINDER SUCCESSFUL`
    );

    console.log(
        `========================================`
    );

    console.log(
        `All jobs saved to: ${JOBS_PATH}`
    );

    console.log(
        `Relevant jobs saved to: ${MATCHED_JOBS_PATH}`
    );

    if (meaningfulJobs.length) {
        console.log(
            `Email report sent to: animeshpandeyit@gmail.com`
        );
    }

    console.log(
        `========================================`
    );
}

// ============================================================
// RUN
// ============================================================

main().catch(error => {

    console.error(
        "\n========================================"
    );

    console.error(
        "GMAIL JOB FINDER FAILED"
    );

    console.error(
        "========================================"
    );

    console.error(
        error
    );

    process.exit(1);
});