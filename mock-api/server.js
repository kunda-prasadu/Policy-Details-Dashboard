// DECISION: Custom Express mock server instead of vanilla `json-server`.
// ALTERNATIVES CONSIDERED:
//   1. json-server (the previous approach).
//   2. MSW (Mock Service Worker).
// REASON: The dashboard requires TRUE server-side filtering, free-text search,
//         sorting, pagination AND server-computed summary aggregates. json-server
//         cannot express an OR free-text search across three specific fields
//         (repeating `_like` params is ANDed, which returns near-empty results),
//         and it has no notion of a domain "summary" endpoint. A ~150-line Express
//         server gives us exact control over the contract the Angular client
//         depends on, with Express already present as an SSR dependency (no new
//         package). State is held in memory — PATCH mutations are intentionally
//         NOT persisted to db.json so the seed file stays pristine in git and a
//         server restart returns to a known dataset.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// ---------------------------------------------------------------------------
// In-memory data store (seeded from db.json once at startup)
// ---------------------------------------------------------------------------

/** @type {Array<Record<string, unknown>>} */
let policies = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')).policies;

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// CORS — the Angular dev server (http://localhost:4200) is a different origin
// from this API (http://localhost:3000). Allow it explicitly. No external
// `cors` package needed for this small surface.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PATCH,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Filtering — shared by GET /policies and GET /policies/summary so both views
// derive from an identical predicate (single source of truth for "what matches").
// ---------------------------------------------------------------------------

/** Coerce a query param that may be a single value or an array into an array. */
function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Applies all supported filters to the dataset.
 * @param {Array} data
 * @param {Record<string, unknown>} q - Express req.query
 */
function applyFilters(data, q) {
  const search = typeof q.search === 'string' ? q.search.trim().toLowerCase() : '';
  const statuses = asArray(q.status);
  const regions = asArray(q.region);
  const lobs = asArray(q.lineOfBusiness);
  const currencies = asArray(q.currency);
  const flaggedOnly = q.flaggedForReview === 'true';
  const premiumMin = q.premiumMin !== undefined ? Number(q.premiumMin) : undefined;
  const premiumMax = q.premiumMax !== undefined ? Number(q.premiumMax) : undefined;

  return data.filter((p) => {
    // Free-text OR search across the three required fields.
    if (search) {
      const haystack = [p.policyNumber, p.policyHolderName, p.underwriter]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (statuses.length && !statuses.includes(p.status)) return false;
    if (regions.length && !regions.includes(p.region)) return false;
    if (lobs.length && !lobs.includes(p.lineOfBusiness)) return false;
    if (currencies.length && !currencies.includes(p.currency)) return false;
    if (flaggedOnly && !p.flaggedForReview) return false;

    if (premiumMin !== undefined && p.premiumAmount < premiumMin) return false;
    if (premiumMax !== undefined && p.premiumAmount > premiumMax) return false;

    // ISO 8601 (YYYY-MM-DD) strings sort lexicographically === chronologically.
    if (q.effectiveDateFrom && p.effectiveDate < q.effectiveDateFrom) return false;
    if (q.effectiveDateTo && p.effectiveDate > q.effectiveDateTo) return false;
    if (q.expiryDateFrom && p.expiryDate < q.expiryDateFrom) return false;
    if (q.expiryDateTo && p.expiryDate > q.expiryDateTo) return false;

    return true;
  });
}

/** Sorts a copy of the data by the given field/order. */
function applySort(data, sortField, order) {
  if (!sortField) return data;
  const dir = order === 'desc' ? -1 : 1;
  return [...data].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (av === bv) return 0;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

// ---------------------------------------------------------------------------
// GET /policies — server-side filter + search + sort + pagination
// Response: { data: Policy[], total: number }
// ---------------------------------------------------------------------------
app.get('/policies', (req, res) => {
  const filtered = applyFilters(policies, req.query);
  const sorted = applySort(filtered, req.query.sort, req.query.order);

  const total = sorted.length;
  const page = req.query.page !== undefined ? Math.max(1, Number(req.query.page)) : 1;
  const pageSize =
    req.query.pageSize !== undefined ? Math.max(1, Number(req.query.pageSize)) : total;
  const start = (page - 1) * pageSize;
  const data = sorted.slice(start, start + pageSize);

  res.json({ data, total });
});

// ---------------------------------------------------------------------------
// GET /policies/summary — KPI aggregates over the FILTERED set (no pagination).
// Registered BEFORE /policies/:id so "summary" is not treated as an id.
// ---------------------------------------------------------------------------
app.get('/policies/summary', (req, res) => {
  const filtered = applyFilters(policies, req.query);

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const summary = filtered.reduce(
    (acc, p) => {
      const key = String(p.status).toLowerCase();
      if (key in acc) acc[key]++;

      acc.totalPremium += p.premiumAmount;

      if (p.status === 'Active') {
        const expiryMs = new Date(p.expiryDate).getTime();
        if (expiryMs >= now && expiryMs <= now + thirtyDaysMs) {
          acc.expiringWithin30Days++;
        }
      }

      acc.gwpByLob[p.lineOfBusiness] =
        (acc.gwpByLob[p.lineOfBusiness] ?? 0) + p.premiumAmount;

      return acc;
    },
    {
      active: 0,
      pending: 0,
      expired: 0,
      cancelled: 0,
      totalPremium: 0,
      expiringWithin30Days: 0,
      gwpByLob: {},
    },
  );

  res.json(summary);
});

// ---------------------------------------------------------------------------
// GET /policies/:id — single record (optional convenience endpoint)
// ---------------------------------------------------------------------------
app.get('/policies/:id', (req, res) => {
  const policy = policies.find((p) => p.id === req.params.id);
  if (!policy) {
    res.status(404).json({ message: `Policy ${req.params.id} not found` });
    return;
  }
  res.json(policy);
});

// ---------------------------------------------------------------------------
// PATCH /policies/:id — partial update (flag for review, renew, etc.)
// ---------------------------------------------------------------------------
app.patch('/policies/:id', (req, res) => {
  const index = policies.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ message: `Policy ${req.params.id} not found` });
    return;
  }
  policies[index] = { ...policies[index], ...req.body };
  res.json(policies[index]);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[mock-api] Policy API listening on http://localhost:${PORT} ` +
      `(${policies.length} policies, in-memory)`,
  );
});
