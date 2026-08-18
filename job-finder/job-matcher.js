const profile = require("./profile");

function normalize(text = "") {
    return text
        .toLowerCase()
        .replace(/[^\w\s.+#-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function containsSkill(text, skill) {
    const normalizedText = normalize(text);
    const normalizedSkill = normalize(skill);

    return normalizedText.includes(normalizedSkill);
}

function findMatches(text, skills) {
    return skills.filter(skill => containsSkill(text, skill));
}

function parseExperience(experience = "") {
    const text = experience.toLowerCase();

    const range = text.match(
        /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/
    );

    if (range) {
        return {
            min: Number(range[1]),
            max: Number(range[2])
        };
    }

    const single = text.match(/(\d+(?:\.\d+)?)\s*\+?/);

    if (single) {
        const value = Number(single[1]);

        return {
            min: value,
            max: value
        };
    }

    return null;
}

function experienceScore(experience) {
    const parsed = parseExperience(experience);

    if (!parsed) {
        return {
            score: 5,
            reason: "Experience not clearly specified"
        };
    }

    const userExperience = profile.experience.years;

    if (
        userExperience >= parsed.min &&
        userExperience <= parsed.max
    ) {
        return {
            score: 20,
            reason: "Experience match"
        };
    }

    if (
        userExperience + 1 >= parsed.min &&
        userExperience - 1 <= parsed.max
    ) {
        return {
            score: 12,
            reason: "Near experience match"
        };
    }

    if (parsed.min > userExperience + 2) {
        return {
            score: 0,
            reason: "Requires significantly more experience"
        };
    }

    return {
        score: 5,
        reason: "Partial experience match"
    };
}

function locationScore(location = "") {
    const normalizedLocation = normalize(location);

    const matchedLocation = profile.preferredLocations.find(
        loc => normalizedLocation.includes(normalize(loc))
    );

    if (matchedLocation) {
        return {
            score: 15,
            reason: `Preferred location: ${matchedLocation}`
        };
    }

    if (
        normalizedLocation.includes("remote") ||
        normalizedLocation.includes("work from home")
    ) {
        return {
            score: 15,
            reason: "Remote opportunity"
        };
    }

    if (
        normalizedLocation.includes("mumbai") ||
        normalizedLocation.includes("hyderabad") ||
        normalizedLocation.includes("delhi")
    ) {
        return {
            score: 8,
            reason: "Acceptable location"
        };
    }

    return {
        score: 0,
        reason: "Location not preferred"
    };
}

function roleScore(title = "") {
    const normalizedTitle = normalize(title);

    const matchedRole = profile.preferredRoles.find(
        role => normalizedTitle.includes(normalize(role))
    );

    if (matchedRole) {
        return {
            score: 15,
            reason: `Preferred role: ${matchedRole}`
        };
    }

    if (
        normalizedTitle.includes("frontend") ||
        normalizedTitle.includes("front end") ||
        normalizedTitle.includes("angular") ||
        normalizedTitle.includes("ui developer")
    ) {
        return {
            score: 10,
            reason: "Relevant frontend role"
        };
    }

    return {
        score: 0,
        reason: "Role not strongly aligned"
    };
}

function technologyPenalty(text = "") {
    const normalizedText = normalize(text);

    const reactOnly =
        normalizedText.includes("react") &&
        !normalizedText.includes("angular");

    const vueOnly =
        normalizedText.includes("vue") &&
        !normalizedText.includes("angular");

    if (reactOnly || vueOnly) {
        return {
            penalty: 15,
            reason: "Primary technology differs from Angular"
        };
    }

    return {
        penalty: 0,
        reason: null
    };
}

function calculateMatch(job) {
    const combinedText = `
        ${job.title || ""}
        ${job.company || ""}
        ${job.location || ""}
        ${job.experience || ""}
        ${job.description || ""}
    `;

    const primaryMatches = findMatches(
        combinedText,
        profile.primarySkills
    );

    const secondaryMatches = findMatches(
        combinedText,
        profile.secondarySkills
    );

    const exp = experienceScore(job.experience);
    const location = locationScore(job.location);
    const role = roleScore(job.title);

    let score = 0;
    const reasons = [];

    // Primary technology / skills
    if (primaryMatches.length > 0) {
        score += Math.min(
            30,
            primaryMatches.length * 7
        );

        reasons.push(
            `Skills: ${primaryMatches.join(", ")}`
        );
    }

    // Secondary skills
    if (secondaryMatches.length > 0) {
        score += Math.min(
            10,
            secondaryMatches.length * 2
        );
    }

    score += exp.score;
    score += location.score;
    score += role.score;

    reasons.push(exp.reason);
    reasons.push(location.reason);
    reasons.push(role.reason);

    const penalty = technologyPenalty(combinedText);

    score -= penalty.penalty;

    if (penalty.reason) {
        reasons.push(penalty.reason);
    }

    score = Math.max(0, Math.min(100, score));

    let category;

    if (score >= 85) {
        category = "EXCELLENT";
    } else if (score >= 70) {
        category = "GOOD";
    } else if (score >= 55) {
        category = "POSSIBLE";
    } else {
        category = "SKIP";
    }

    return {
        ...job,
        matchScore: score,
        category,
        matchingSkills: [
            ...new Set([
                ...primaryMatches,
                ...secondaryMatches
            ])
        ],
        reasons: [...new Set(reasons)]
    };
}

module.exports = {
    calculateMatch
};