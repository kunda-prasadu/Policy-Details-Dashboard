/**
 * @fileoverview Mock data generator for the Policy Hub dashboard.
 *
 * Generates 250 realistic insurance policy records using @faker-js/faker
 * and writes them to mock-api/db.json so json-server can serve them as a
 * REST API at http://localhost:3000/policies.
 *
 * WHY THIS APPROACH: Faker-based generation rather than hand-crafted JSON
 * gives us realistic names, dates, and UUIDs without manual effort. The
 * evenly-distributed enum values ensure every filter/chart combination in
 * the dashboard is exercised by the mock data.
 *
 * Usage:
 *   node mock-api/generate-data.js
 *
 * Output:
 *   mock-api/db.json
 */

// DECISION: Use @faker-js/faker (scoped package) not the deprecated `faker` package.
// ALTERNATIVES CONSIDERED: Manual JSON, chance.js
// REASON: @faker-js/faker is the actively-maintained fork with TypeScript support
//         and locale-aware data generation.

import { faker } from '@faker-js/faker';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ---------------------------------------------------------------------------
// Domain value lists — all 8 regions and all LOBs evenly distributed
// ---------------------------------------------------------------------------

/** All 8 APAC regions served by Chubb APAC operations. */
const REGIONS = [
  'Singapore',
  'Hong Kong',
  'Australia',
  'Japan',
  'Thailand',
  'Indonesia',
  'Malaysia',
  'Philippines',
];

/** Lines of business underwritten by Chubb APAC. */
const LINES_OF_BUSINESS = ['Property', 'Casualty', 'Marine', 'A&H'];

/** Policy lifecycle statuses. */
const STATUSES = ['Active', 'Pending', 'Expired', 'Cancelled'];

/** Currency codes aligned to region (simplified — multiple currencies per region possible). */
const CURRENCIES = ['SGD', 'HKD', 'AUD', 'JPY', 'USD', 'THB'];

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Returns the value at `index % array.length` — used to cycle through enum
 * arrays so all values are evenly represented across N records.
 *
 * WHY THIS APPROACH: Pure round-robin guarantees every enum value appears
 * at least Math.floor(N / array.length) times, ensuring every dashboard
 * filter returns results. Random selection could leave some values with 0
 * records at small N.
 *
 * @param {string[]} arr - The array to cycle through.
 * @param {number}   index - The current record index.
 * @returns {string} The cycled value.
 */
function cycled(arr, index) {
  return arr[index % arr.length];
}

/**
 * Generates a policy number in the format POL-XXXXXX where X is a digit.
 *
 * @returns {string} e.g. "POL-048271"
 */
function generatePolicyNumber() {
  return `POL-${faker.string.numeric({ length: 6, allowLeadingZeros: true })}`;
}

/**
 * Generates an ISO-8601 date string between two anchor dates.
 *
 * @param {Date} from - Start of the range.
 * @param {Date} to   - End of the range.
 * @returns {string}  ISO date string (YYYY-MM-DD).
 */
function isoDate(from, to) {
  return faker.date.between({ from, to }).toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Record generation
// ---------------------------------------------------------------------------

const TOTAL_RECORDS = 250;

// Anchor dates: policies span a 5-year window centered on today
const WINDOW_START = new Date('2021-01-01');
const WINDOW_END   = new Date('2026-12-31');

/**
 * Generates a single mock insurance policy record.
 *
 * Each call produces a unique UUID, realistic personal name, evenly-cycled
 * enum values, a random premium in the specified range, and correlated
 * effective/expiry dates (expiry is always 1 year after effective).
 *
 * @param {number} index - Zero-based record index used for round-robin distribution.
 * @returns {Object} A fully-populated policy record.
 */
function generatePolicy(index) {
  const effectiveDate = isoDate(WINDOW_START, WINDOW_END);
  const effectiveDateObj = new Date(effectiveDate);

  // Expiry is exactly 1 year after effective date (standard annual policy term)
  const expiryDateObj = new Date(effectiveDateObj);
  expiryDateObj.setFullYear(expiryDateObj.getFullYear() + 1);
  const expiryDate = expiryDateObj.toISOString().split('T')[0];

  // WHY CYCLED ENUMS: Ensures all 8 regions, 4 LOBs and 4 statuses appear
  // proportionally rather than randomly skewed toward a subset.
  const region          = cycled(REGIONS, index);
  const lineOfBusiness  = cycled(LINES_OF_BUSINESS, index);
  const status          = cycled(STATUSES, index);
  const currency        = cycled(CURRENCIES, index);

  return {
    /** UUID v4 — used as the json-server primary key and Angular route param */
    id: faker.string.uuid(),

    /** Human-readable policy identifier in POL-XXXXXX format */
    policyNumber: generatePolicyNumber(),

    /** Full name of the insured entity (individual or corporate) */
    policyHolderName: faker.person.fullName(),

    /** Chubb APAC line of business */
    lineOfBusiness,

    /** Current lifecycle status of the policy */
    status,

    /** APAC region where the risk is domiciled */
    region,

    /**
     * Annual gross written premium in the specified currency.
     * Range: 10,000 – 2,000,000 (rounded to nearest 100 for realism).
     */
    premiumAmount: Math.round(faker.number.int({ min: 100, max: 20000 }) * 100),

    /** ISO 4217 currency code for the premiumAmount */
    currency,

    /** Policy inception date (YYYY-MM-DD) */
    effectiveDate,

    /** Policy expiry date — always 1 year after effectiveDate (YYYY-MM-DD) */
    expiryDate,

    /**
     * Full name of the assigned underwriter.
     * Used for filtering and the underwriter workload chart.
     */
    underwriter: faker.person.fullName(),

    /**
     * Whether this policy has been flagged for manual underwriter review.
     * Approximately 15% of policies are flagged (weighted random).
     */
    flaggedForReview: faker.number.int({ min: 1, max: 100 }) <= 15,
  };
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const policies = Array.from({ length: TOTAL_RECORDS }, (_, i) => generatePolicy(i));

/**
 * db.json structure required by json-server.
 * Each top-level key becomes a REST resource: GET /policies, GET /policies/:id, etc.
 */
const db = { policies };

// Resolve output path relative to this script's directory so the script can
// be run from any working directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const outputPath = join(__dirname, 'db.json');

writeFileSync(outputPath, JSON.stringify(db, null, 2), 'utf-8');

console.log(`✅ Generated ${TOTAL_RECORDS} policy records → ${outputPath}`);
console.log(`   Regions (${REGIONS.length}):          ${REGIONS.join(', ')}`);
console.log(`   Lines of Business (${LINES_OF_BUSINESS.length}): ${LINES_OF_BUSINESS.join(', ')}`);
console.log(`   Statuses (${STATUSES.length}):          ${STATUSES.join(', ')}`);
console.log(`   Currencies (${CURRENCIES.length}):       ${CURRENCIES.join(', ')}`);
