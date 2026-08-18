const fs = require('fs');
const path = require('path');

const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const cheerio = require('cheerio');

// =====================================================
// CONFIGURATION
// =====================================================

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly'
];

const CREDENTIALS_PATH = path.join(
    __dirname,
    '..',
    'credentials',
    'credentials.json'
);

const OUTPUT_DIR = path.join(
    __dirname,
    'email-dump'
);

const JOBS_FILE = path.join(
    __dirname,
    'jobs.json'
);

// =====================================================
// REGEX
// =====================================================

const EXPERIENCE_REGEX =
    /\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*Years?\b/i;

// =====================================================
// HELPERS
// =====================================================

function cleanText(value) {
    return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeBase64(data) {
    if (!data) {
        return '';
    }

    return Buffer
        .from(
            data
                .replace(/-/g, '+')
                .replace(/_/g, '/'),
            'base64'
        )
        .toString('utf8');
}

function getHeader(headers, name) {
    const header = headers.find(
        item =>
            item.name.toLowerCase() ===
            name.toLowerCase()
    );

    return header
        ? header.value
        : '';
}

// =====================================================
// EXTRACT HTML BODY
// =====================================================

function extractHtml(payload) {

    if (!payload) {
        return '';
    }

    if (
        payload.mimeType === 'text/html' &&
        payload.body &&
        payload.body.data
    ) {
        return decodeBase64(
            payload.body.data
        );
    }

    if (payload.parts) {

        for (const part of payload.parts) {

            const html =
                extractHtml(part);

            if (html) {
                return html;
            }
        }
    }

    return '';
}

// =====================================================
// VALID JOB URL
// =====================================================

function isValidJobUrl(url) {

    if (!url) {
        return false;
    }

    if (
        !url.startsWith(
            'https://www.naukri.com/'
        )
    ) {
        return false;
    }

    const lower =
        url.toLowerCase();

    /*
     * These are definitely NOT job links.
     */
    const invalid = [
        'feedback',
        'fdbck',
        'security',
        'termsconditions',
        'unsubscribe',
        '/durl/',
        'settings',
        'view_all'
    ];

    return !invalid.some(
        value =>
            lower.includes(value)
    );
}

// =====================================================
// EXTRACT JOBS FROM NAUKRI HTML
// =====================================================

function extractJobsFromHtml(
    html,
    emailSubject,
    emailDate
) {
    const $ = cheerio.load(html);

    const jobs = [];

    /*
     * Naukri email structure:
     *
     * One job card contains:
     *
     *   td.jb_title  -> Job Title
     *   td.jb_dt     -> Location
     *   td.jb_dt     -> Experience
     *   td.jb_title  -> Company
     *
     * Therefore we MUST process the CARD,
     * not every td.jb_title individually.
     */

    $('td.jb_title').each(
        (index, titleElement) => {

            /*
             * Only process the FIRST jb_title
             * belonging to a job card.
             *
             * If this jb_title is already inside
             * another jb_title/card structure,
             * don't treat it as a new job.
             */

            const title =
                cleanText(
                    $(titleElement)
                        .clone()
                        .children()
                        .remove()
                        .end()
                        .text()
                );

            if (!title) {
                return;
            }

            /*
             * Find the nearest parent anchor.
             */
            const cardLink =
                $(titleElement).closest('a');

            if (!cardLink.length) {
                return;
            }

            const href =
                cardLink.attr('href') || '';

            /*
             * Ignore footer/navigation links.
             */
            if (
                /security|feedback|fdbck|termsconditions|unsubscribe/i
                    .test(href)
            ) {
                return;
            }

            /*
             * Get the complete card text.
             */
            const cardText =
                cleanText(
                    cardLink.text()
                );

            /*
             * A real job card MUST contain experience.
             */
            const experienceMatch =
                cardText.match(
                    EXPERIENCE_REGEX
                );

            if (!experienceMatch) {
                return;
            }

            /*
             * A real job card MUST contain a location.
             */
            let location = '';

            cardLink
                .find('td.jb_dt')
                .each(
                    (i, element) => {

                        const text =
                            cleanText(
                                $(element).text()
                            );

                        if (
                            !location &&
                            /Bengaluru|Bangalore|Mumbai|Delhi|NCR|Noida|Gurgaon|Gurugram|Pune|Hyderabad|Chennai|Kolkata|Lucknow|Remote/i
                                .test(text)
                        ) {
                            location = text;
                        }
                    }
                );

            if (!location) {
                return;
            }

            /*
             * Get all jb_title elements in THIS card.
             *
             * Example:
             *
             * [0] Gen AI Automation
             * [1] Apeksha
             *
             * [0] = JOB TITLE
             * [1] = COMPANY
             */
            const cardTitles = [];

            cardLink
                .find('td.jb_title')
                .each(
                    (i, element) => {

                        const text =
                            cleanText(
                                $(element)
                                    .clone()
                                    .children()
                                    .remove()
                                    .end()
                                    .text()
                            );

                        if (text) {
                            cardTitles.push(text);
                        }
                    }
                );

            /*
             * VERY IMPORTANT:
             *
             * We only create a job from the FIRST
             * jb_title.
             *
             * Therefore:
             *
             * Gen AI Automation -> JOB
             * Apeksha           -> COMPANY
             *
             * and NOT:
             *
             * Apeksha -> another JOB
             */

            if (
                cardTitles.length === 0 ||
                cardTitles[0] !== title
            ) {
                return;
            }

            /*
             * Company is the second jb_title.
             */
            const company =
                cardTitles.length > 1
                    ? cardTitles[1]
                    : '';

            /*
             * Build job object.
             */
            const job = {

                title: title,

                company: company,

                recruiter: company,

                location: location,

                experience:
                    experienceMatch[0],

                salary: '',

                url:
                    isValidJobUrl(href)
                        ? href
                        : '',

                matchScore: 0,

                emailSubject:
                    emailSubject,

                emailDate:
                    emailDate,

                source:
                    'Naukri Gmail Alert'
            };

            /*
             * Calculate profile match.
             */
            job.matchScore =
                calculateMatchScore(job);

            /*
             * Prevent duplicate jobs.
             */
            const alreadyExists =
                jobs.some(
                    existing =>
                        existing.title
                            .toLowerCase() ===
                        job.title
                            .toLowerCase()
                        &&
                        existing.company
                            .toLowerCase() ===
                        job.company
                            .toLowerCase()
                );

            if (!alreadyExists) {
                jobs.push(job);
            }
        }
    );

    return jobs;
}

// =====================================================
// MATCH SCORE
// =====================================================

function calculateMatchScore(job) {

    let score = 0;

    const text = `
        ${job.title}
        ${job.company}
        ${job.location}
        ${job.experience}
    `.toLowerCase();

    /*
     * Angular
     */
    if (
        text.includes('angular')
    ) {
        score += 40;
    }

    /*
     * Frontend
     */
    if (
        text.includes('frontend') ||
        text.includes('front-end') ||
        text.includes('front end')
    ) {
        score += 25;
    }

    /*
     * TypeScript
     */
    if (
        text.includes('typescript')
    ) {
        score += 15;
    }

    /*
     * JavaScript
     */
    if (
        text.includes('javascript')
    ) {
        score += 10;
    }

    /*
     * Node.js
     */
    if (
        text.includes('node.js') ||
        text.includes('nodejs') ||
        text.includes('node js')
    ) {
        score += 10;
    }

    /*
     * Preferred locations.
     */
    if (
        /lucknow|noida|gurgaon|gurugram|bangalore|bengaluru|pune/i
            .test(job.location)
    ) {
        score += 10;
    }

    return Math.min(
        score,
        100
    );
}

// =====================================================
// GOOGLE AUTHENTICATION
// =====================================================

async function getGmailClient() {

    console.log(
        'Starting Google authentication...'
    );

    const auth =
        await authenticate({

            scopes: SCOPES,

            keyfilePath:
                CREDENTIALS_PATH

        });

    console.log(
        'Google authentication successful.'
    );

    return google.gmail({

        version: 'v1',

        auth

    });
}

// =====================================================
// MAIN
// =====================================================

async function getNaukriEmails() {

    const gmail =
        await getGmailClient();

    console.log('');
    console.log(
        'Testing Gmail API connection...'
    );

    const profile =
        await gmail.users.getProfile({

            userId: 'me'

        });

    console.log(
        `Gmail account: ${profile.data.emailAddress}`
    );

    console.log('');
    console.log(
        'Searching Gmail for Naukri job alerts...'
    );

    const response =
        await gmail.users.messages.list({

            userId: 'me',

            q:
                'from:(naukri) newer_than:1d',

            maxResults: 20

        });

    const messages =
        response.data.messages || [];

    console.log(
        `Found ${messages.length} Naukri email(s).`
    );

    /*
     * Create email dump directory.
     */
    if (
        !fs.existsSync(
            OUTPUT_DIR
        )
    ) {

        fs.mkdirSync(
            OUTPUT_DIR,
            {
                recursive: true
            }
        );
    }

    const allJobs = [];

    let emailNumber = 1;

    for (
        const message
        of messages
    ) {

        console.log('');
        console.log(
            `Processing email ${emailNumber}/${messages.length}...`
        );

        const email =
            await gmail.users.messages.get({

                userId: 'me',

                id: message.id,

                format: 'full'

            });

        const payload =
            email.data.payload;

        const headers =
            payload.headers || [];

        const subject =
            getHeader(
                headers,
                'Subject'
            );

        const date =
            getHeader(
                headers,
                'Date'
            );

        console.log(
            `Subject: ${subject}`
        );

        const html =
            extractHtml(
                payload
            );

        if (!html) {

            console.log(
                'No HTML content found.'
            );

            emailNumber++;

            continue;
        }

        /*
         * Save HTML for debugging.
         */
        const htmlPath =
            path.join(
                OUTPUT_DIR,
                `email-${emailNumber}.html`
            );

        fs.writeFileSync(
            htmlPath,
            html,
            'utf8'
        );

        console.log(
            `HTML saved: ${htmlPath}`
        );

        /*
         * Extract jobs.
         */
        const jobs =
            extractJobsFromHtml(
                html,
                subject,
                date
            );

        console.log(
            `Jobs extracted from this email: ${jobs.length}`
        );

        allJobs.push(
            ...jobs
        );

        emailNumber++;
    }

    /*
     * Remove duplicates across emails.
     */
    const uniqueJobs = [];

    for (
        const job
        of allJobs
    ) {

        const duplicate =
            uniqueJobs.some(
                existing =>
                    existing.title
                        .toLowerCase() ===
                    job.title
                        .toLowerCase()
                    &&
                    existing.company
                        .toLowerCase() ===
                    job.company
                        .toLowerCase()
            );

        if (!duplicate) {

            uniqueJobs.push(
                job
            );
        }
    }

    /*
     * Sort by match score.
     */
    uniqueJobs.sort(
        (a, b) =>
            b.matchScore -
            a.matchScore
    );

    /*
     * Save JSON.
     */
    fs.writeFileSync(

        JOBS_FILE,

        JSON.stringify(
            uniqueJobs,
            null,
            2
        ),

        'utf8'
    );

    // =================================================
    // OUTPUT
    // =================================================

    console.log('');
    console.log(
        '========================================'
    );

    console.log(
        `TOTAL UNIQUE JOBS: ${uniqueJobs.length}`
    );

    console.log(
        '========================================'
    );

    uniqueJobs.forEach(
        (job, index) => {

            console.log('');

            console.log(
                `${index + 1}. ${job.title}`
            );

            console.log(
                `   Company: ${job.company || 'Not detected'}`
            );

            console.log(
                `   Location: ${job.location || 'Not detected'}`
            );

            console.log(
                `   Experience: ${job.experience || 'Not detected'}`
            );

            console.log(
                `   Match Score: ${job.matchScore}/100`
            );

            console.log(
                `   URL: ${job.url || 'Not detected'}`
            );
        }
    );

    console.log('');
    console.log(
        '========================================'
    );

    console.log(
        'GMAIL JOB FINDER SUCCESSFUL'
    );

    console.log(
        `Jobs saved to: ${JOBS_FILE}`
    );

    console.log(
        '========================================'
    );
}

// =====================================================
// START
// =====================================================

getNaukriEmails()
    .catch(error => {

        console.error('');
        console.error(
            '========================================'
        );

        console.error(
            'GMAIL AUTOMATION FAILED'
        );

        console.error(
            '========================================'
        );

        console.error(
            error
        );

    });