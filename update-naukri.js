const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    const profilePath = path.join(__dirname, 'browser-profile');
    const resumePath = path.join(__dirname, 'animeshpandeyresume.pdf');

    const resumeFileName = path.basename(resumePath);

    // --------------------------------------------------
    // Check resume exists
    // --------------------------------------------------

    if (!fs.existsSync(resumePath)) {
        throw new Error(`Resume file not found: ${resumePath}`);
    }

    console.log(`Resume found: ${resumePath}`);

    const context = await chromium.launchPersistentContext(profilePath, {
        headless: false,
        viewport: {
            width: 1366,
            height: 768
        }
    });

    const page = await context.newPage();

    try {
        // --------------------------------------------------
        // STEP 1: Open Naukri
        // --------------------------------------------------

        console.log('Opening Naukri profile...');

        await page.goto('https://www.naukri.com/mnjuser/profile', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(3000);

        console.log('Naukri profile opened.');

        // --------------------------------------------------
        // STEP 2: Click Update Resume
        // --------------------------------------------------

        console.log('Clicking Update resume...');

        await page.getByRole('button', {
            name: 'Update resume'
        }).click();

        console.log('Update Resume section opened.');

        await page.waitForTimeout(1000);

        // --------------------------------------------------
        // STEP 3: Find Resume upload field
        // --------------------------------------------------

        console.log('Looking for resume upload field...');

        const resumeInput = page.locator('#attachCV');

        await resumeInput.waitFor({
            state: 'attached',
            timeout: 10000
        });

        console.log('Resume upload field found.');

        // --------------------------------------------------
        // STEP 4: Select resume automatically
        // --------------------------------------------------

        console.log('Selecting resume automatically...');

        await resumeInput.setInputFiles(resumePath);

        console.log('setInputFiles completed.');

        // Naukri may replace the input after selecting the file.
        await page.waitForTimeout(1500);

        console.log('Resume selected.');

        // --------------------------------------------------
        // STEP 5: Click Update Resume
        // --------------------------------------------------

        console.log('Submitting resume...');

        await page.getByRole('button', {
            name: 'Update resume'
        }).click();

        console.log('Resume upload submitted.');

        // --------------------------------------------------
        // STEP 6: Wait for Naukri to process upload
        // --------------------------------------------------

        console.log('Waiting for upload to complete...');

        await page.waitForTimeout(3000);

        // --------------------------------------------------
        // STEP 7: Verify resume filename
        // --------------------------------------------------

        const bodyText = await page.locator('body').innerText();

        if (bodyText.includes(resumeFileName)) {
            console.log(
                `Resume filename verified: ${resumeFileName}`
            );
        } else {
            throw new Error(
                `Resume filename not found after upload: ${resumeFileName}`
            );
        }

        // --------------------------------------------------
        // STEP 8: Calculate today's date in India
        // --------------------------------------------------

        const today = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(new Date());

        const expectedUploadText = `Uploaded on ${today}`;

        console.log(
            `Expected upload date: ${expectedUploadText}`
        );

        // --------------------------------------------------
        // STEP 9: Verify today's upload date
        // --------------------------------------------------

        console.log('Checking upload date...');

        let uploadDateVerified = false;
        let detectedUploadText = null;

        for (let attempt = 1; attempt <= 10; attempt++) {
            const currentBodyText = await page.locator('body').innerText();

            // Look for "Uploaded on ..."
            const uploadMatch = currentBodyText.match(
                /Uploaded on\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/
            );

            if (uploadMatch) {
                detectedUploadText = uploadMatch[0];

                console.log(
                    `Detected: ${detectedUploadText}`
                );

                if (detectedUploadText === expectedUploadText) {
                    uploadDateVerified = true;
                    break;
                }
            }

            console.log(
                `Upload date not updated yet. Attempt ${attempt}/10`
            );

            await page.waitForTimeout(2000);
        }

        // --------------------------------------------------
        // STEP 10: Final verification
        // --------------------------------------------------

        if (!uploadDateVerified) {
            const screenshotPath = path.join(
                __dirname,
                'naukri-upload-verification-failed.png'
            );

            await page.screenshot({
                path: screenshotPath,
                fullPage: true
            });

            throw new Error(
                `Resume uploaded but today's upload date could not be verified.\n` +
                `Expected: ${expectedUploadText}\n` +
                `Detected: ${detectedUploadText || 'Not found'}\n` +
                `Screenshot saved: ${screenshotPath}`
            );
        }

        // --------------------------------------------------
        // SUCCESS
        // --------------------------------------------------

        console.log('');
        console.log('========================================');
        console.log('RESUME UPDATE SUCCESSFUL');
        console.log('========================================');
        console.log(`Resume: ${resumeFileName}`);
        console.log(`Upload date: ${expectedUploadText}`);
        console.log('========================================');
        console.log('');

        // Keep browser visible briefly
        await page.waitForTimeout(3000);

    } catch (error) {
        console.error('');
        console.error('========================================');
        console.error('RESUME UPDATE FAILED');
        console.error('========================================');
        console.error(error.message);
        console.error('========================================');
        console.error('');

        // Take screenshot if something goes wrong
        try {
            const errorScreenshot = path.join(
                __dirname,
                'naukri-error.png'
            );

            await page.screenshot({
                path: errorScreenshot,
                fullPage: true
            });

            console.error(
                `Error screenshot saved: ${errorScreenshot}`
            );
        } catch (screenshotError) {
            console.error('Could not save error screenshot.');
        }

        // Keep browser open for inspection
        await page.waitForTimeout(10000);

    } finally {
        await context.close();

        console.log('Browser closed.');
    }
})();