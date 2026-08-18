const { google } = require("googleapis");

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function categoryColor(category) {
    switch (category) {
        case "EXCELLENT":
            return "#198754";

        case "GOOD":
            return "#0d6efd";

        case "POSSIBLE":
            return "#f0ad4e";

        default:
            return "#6c757d";
    }
}

function buildJobCard(job) {
    const color = categoryColor(job.category);

    const skills = job.matchingSkills?.length
        ? job.matchingSkills
            .map(skill => `<span class="skill">✓ ${escapeHtml(skill)}</span>`)
            .join("")
        : `<span class="muted">No strong skill matches detected</span>`;

    const reasons = job.reasons?.length
        ? job.reasons
            .map(reason => `<li>${escapeHtml(reason)}</li>`)
            .join("")
        : "";

    const applyButton = job.url
        ? `
            <a
                href="${escapeHtml(job.url)}"
                target="_blank"
                class="apply-button"
            >
                APPLY NOW →
            </a>
        `
        : `
            <span class="no-link">
                Job link not detected
            </span>
        `;

    return `
        <div class="job-card">

            <div class="job-header">

                <div>
                    <h2>${escapeHtml(job.title || "Job Opportunity")}</h2>

                    <div class="company">
                        ${escapeHtml(job.company || "Company not detected")}
                    </div>
                </div>

                <div
                    class="score"
                    style="background:${color}"
                >
                    ${job.matchScore}/100
                </div>

            </div>

            <div class="details">

                <span>
                    📍 ${escapeHtml(job.location || "Location not specified")}
                </span>

                <span>
                    💼 ${escapeHtml(job.experience || "Not specified")}
                </span>

            </div>

            <div class="category">
                ${escapeHtml(job.category)}
            </div>

            <div class="section-title">
                Matching skills
            </div>

            <div class="skills">
                ${skills}
            </div>

            <div class="section-title">
                Why it matches
            </div>

            <ul class="reasons">
                ${reasons}
            </ul>

            ${applyButton}

        </div>
    `;
}

function buildEmailHtml(jobs) {

    const excellent = jobs.filter(
        job => job.category === "EXCELLENT"
    );

    const good = jobs.filter(
        job => job.category === "GOOD"
    );

    const possible = jobs.filter(
        job => job.category === "POSSIBLE"
    );

    const sections = [];

    if (excellent.length) {
        sections.push(`
            <h1 class="section-heading excellent-heading">
                ⭐ Excellent Matches
            </h1>

            ${excellent.map(buildJobCard).join("")}
        `);
    }

    if (good.length) {
        sections.push(`
            <h1 class="section-heading">
                🟢 Good Matches
            </h1>

            ${good.map(buildJobCard).join("")}
        `);
    }

    if (possible.length) {
        sections.push(`
            <h1 class="section-heading">
                🟡 Possible Matches
            </h1>

            ${possible.map(buildJobCard).join("")}
        `);
    }

    return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<style>

body {
    margin: 0;
    padding: 0;
    background: #f4f6f8;
    font-family: Arial, Helvetica, sans-serif;
    color: #212529;
}

.container {
    max-width: 800px;
    margin: auto;
    padding: 30px 20px;
}

.header {
    background: #111827;
    color: white;
    padding: 30px;
    border-radius: 14px;
    margin-bottom: 30px;
}

.header h1 {
    margin: 0 0 10px;
}

.header p {
    margin: 0;
    opacity: 0.85;
}

.summary {
    display: flex;
    gap: 10px;
    margin-top: 20px;
    flex-wrap: wrap;
}

.summary-box {
    background: white;
    color: #111827;
    padding: 12px 18px;
    border-radius: 8px;
}

.job-card {
    background: white;
    border-radius: 14px;
    padding: 25px;
    margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}

.job-header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
}

.job-header h2 {
    margin: 0 0 8px;
    font-size: 21px;
}

.company {
    color: #6c757d;
    font-weight: bold;
}

.score {
    color: white;
    font-weight: bold;
    padding: 12px;
    border-radius: 50px;
    height: fit-content;
    white-space: nowrap;
}

.details {
    display: flex;
    gap: 20px;
    margin: 18px 0;
    color: #555;
    flex-wrap: wrap;
}

.category {
    display: inline-block;
    background: #f1f3f5;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: bold;
}

.section-title {
    margin-top: 20px;
    margin-bottom: 10px;
    font-weight: bold;
}

.skills {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
}

.skill {
    background: #e8f5e9;
    color: #1b5e20;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
}

.reasons {
    color: #555;
    padding-left: 20px;
}

.apply-button {
    display: inline-block;
    background: #111827;
    color: white !important;
    text-decoration: none;
    padding: 12px 22px;
    border-radius: 7px;
    margin-top: 15px;
    font-weight: bold;
}

.no-link {
    display: inline-block;
    color: #999;
    margin-top: 15px;
}

.section-heading {
    margin-top: 35px;
}

.excellent-heading {
    color: #198754;
}

.muted {
    color: #888;
}

.footer {
    text-align: center;
    color: #888;
    font-size: 12px;
    margin-top: 30px;
}

</style>

</head>

<body>

<div class="container">

    <div class="header">

        <h1>🎯 Daily Job Matches</h1>

        <p>
            Personalized job recommendations for Animesh Pandey
        </p>

        <div class="summary">

            <div class="summary-box">
                ⭐ Excellent: ${excellent.length}
            </div>

            <div class="summary-box">
                🟢 Good: ${good.length}
            </div>

            <div class="summary-box">
                🟡 Possible: ${possible.length}
            </div>

        </div>

    </div>

    ${sections.join("")}

    <div class="footer">
        Generated automatically from Naukri job alerts.
    </div>

</div>

</body>

</html>
`;
}

function createRawEmail(to, subject, html) {

    const message = [
        `From: me`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        html
    ].join("\r\n");

    return Buffer
        .from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function sendJobReport(auth, jobs, recipient) {

    const gmail = google.gmail({
        version: "v1",
        auth
    });

    const excellent = jobs.filter(
        job => job.category === "EXCELLENT"
    ).length;

    const good = jobs.filter(
        job => job.category === "GOOD"
    ).length;

    const possible = jobs.filter(
        job => job.category === "POSSIBLE"
    ).length;

    const subject =
        `🎯 Daily Job Matches — ${jobs.length} Relevant Jobs`;

    const html = buildEmailHtml(jobs);

    const raw = createRawEmail(
        recipient,
        subject,
        html
    );

    await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw
        }
    });

    console.log("");
    console.log("========================================");
    console.log("JOB REPORT EMAIL SENT");
    console.log("========================================");
    console.log(`To       : ${recipient}`);
    console.log(`Excellent: ${excellent}`);
    console.log(`Good     : ${good}`);
    console.log(`Possible : ${possible}`);
    console.log("========================================");
}

module.exports = {
    sendJobReport
};