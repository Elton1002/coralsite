import { useState, useEffect, useCallback } from "react";

// â”€â”€â”€ CONSTANTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BRANCHES = ["Harare", "Bulawayo", "Masvingo", "Gweru", "Mutare"];
const CATEGORIES = ["IT Equipment", "Laptops", "Desktops", "Servers", "Networking", "Printers", "Monitors", "UPS / Power", "Phones / VOIP", "Storage Devices", "Cables & Accessories", "Software Licenses", "CCTV / Cameras", "Office Equipment", "Delivery Vehicles", "Production Equipment", "Furniture", "Vehicles", "Machinery", "Other"];
const CONDITIONS = ["Excellent", "Good", "Fair", "Poor", "Under Repair", "Disposed"];
const STATUSES = ["Active", "Inactive", "Under Repair", "Disposed", "Lost"];
const ASSET_CLASSES = ["Administration", "IT", "Production", "Distribution"];

// â”€â”€ Module-specific category lists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ADMIN_CATEGORIES = ["Chairs","Desks","Cabinets","Boardroom Assets","Air Conditioners","Projectors","Whiteboards","Office Equipment","Furniture","Other"];
const DIST_CATEGORIES  = ["Forklifts","Pallet Jacks","Warehouse Equipment","Barcode Scanners","Delivery Vehicles","Fleet Tracking","Other"];
const PROD_CATEGORIES  = ["Machines","Production Equipment","Calibration Equipment","Maintenance Tools","Safety Equipment","Other"];
const IT_CATEGORIES    = ["Laptops","Desktops","Servers","Networking","Printers","Monitors","UPS / Power","Phones / VOIP","Storage Devices","Cables & Accessories","Software Licenses","CCTV / Cameras","Other"];
const DEPARTMENTS      = ["Administration","IT","Production","Distribution"];

// â”€â”€ Module â†’ canonical CATEGORY mapping (for filtering) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MODULE_CAT_MAP = {
  Administration: new Set([...ADMIN_CATEGORIES, "Office Equipment", "Furniture"]),
  Distribution:   new Set([...DIST_CATEGORIES, "Delivery Vehicles", "Vehicles"]),
  Production:     new Set([...PROD_CATEGORIES, "Production Equipment", "Machinery"]),
  IT:             new Set([...IT_CATEGORIES, "IT Equipment"]),
};

// â”€â”€ Helper: derive module from category â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function categoryToModule(cat) {
  for (const [mod, set] of Object.entries(MODULE_CAT_MAP)) {
    if (set.has(cat)) return mod;
  }
  return "Administration"; // fallback
}

function assetDepartment(asset) {
  return asset?.department || categoryToModule(asset?.category);
}

// â”€â”€ Live straight-line depreciation engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Recomputes monthly/annual/accumulated depreciation and current (net book) value
// from purchasePrice, purchaseDate and depreciationRate every time it's called,
// instead of trusting whatever static numbers were last saved on the asset.
function monthsBetween(fromDateStr, toDate) {
  const from = new Date(fromDateStr);
  if (isNaN(from.getTime())) return 0;
  let months = (toDate.getFullYear() - from.getFullYear()) * 12 + (toDate.getMonth() - from.getMonth());
  // Only count the current month as elapsed once we've reached/passed the purchase day-of-month
  if (toDate.getDate() < from.getDate()) months -= 1;
  return Math.max(months, 0);
}

function computeDepreciation(asset, asOf = new Date()) {
  const purchasePrice = Number(asset.purchasePrice) || 0;
  // depreciationRate is an ANNUAL percentage (e.g. 33.33 = straight-line over 3 years)
  const depreciationRate = Number(asset.depreciationRate) || 0;
  const annualDepreciation = purchasePrice * (depreciationRate / 100);
  const monthlyDepreciation = annualDepreciation / 12;

  let accumulatedDepreciation = 0;
  let currentValue = purchasePrice;

  if (asset.status === "Disposed") {
    // Freeze depreciation at whatever was accumulated at disposal time, if known.
    accumulatedDepreciation = Math.min(Number(asset.accumulatedDepreciation) || purchasePrice, purchasePrice);
    currentValue = Math.max(purchasePrice - accumulatedDepreciation, 0);
  } else if (asset.purchaseDate && monthlyDepreciation > 0) {
    const monthsElapsed = monthsBetween(asset.purchaseDate, asOf);
    accumulatedDepreciation = Math.min(monthsElapsed * monthlyDepreciation, purchasePrice);
    currentValue = Math.max(purchasePrice - accumulatedDepreciation, 0);
  } else {
    // No rate or no purchase date on record - fall back to last known static figures
    // rather than pretending the asset hasn't depreciated at all.
    accumulatedDepreciation = Number(asset.accumulatedDepreciation) || Math.max(purchasePrice - (Number(asset.currentValue) || purchasePrice), 0);
    currentValue = Number(asset.currentValue) || Math.max(purchasePrice - accumulatedDepreciation, 0);
  }

  return { purchasePrice, depreciationRate, annualDepreciation, monthlyDepreciation, accumulatedDepreciation, currentValue };
}

function normalizeAsset(asset, asOf) {
  const dep = computeDepreciation(asset, asOf);
  const department = assetDepartment(asset);
  return {
    ...asset,
    department,
    purchasePrice: dep.purchasePrice,
    currentValue: dep.currentValue,
    accumulatedDepreciation: dep.accumulatedDepreciation,
    monthlyDepreciation: dep.monthlyDepreciation,
    annualDepreciation: dep.annualDepreciation,
    depreciationRate: dep.depreciationRate,
  };
}

// â”€â”€ Keyword fallbacks used when an asset's `category`/`assetClass` field is a broad
// catch-all (e.g. "Office Equipment" / "Furniture & Fittings") but the specific item
// type is only mentioned in the free-text name/description, e.g. "Office chair x 1".
const CATEGORY_KEYWORDS = {
  // IT
  "Laptops":              /\b(laptop|notebook|probook|elite\s?book|surface\s?book|victus)\b/i,
  // Administration
  "Chairs":               /\bchair/i,
  "Desks":                /\bdesks?\b|\bworkstation/i,
  "Cabinets":              /\bcabinet|locker|shelving|safe\b/i,
  "Boardroom Assets":      /\bboardroom/i,
  "Air Conditioners":      /\bair\s?con|a\/c\b|aircon/i,
  "Projectors":            /\bprojector/i,
  "Whiteboards":           /\bwhite\s?board/i,
  // Distribution
  "Forklifts":             /\bforklift/i,
  "Pallet Jacks":          /\bpallet\s?(jack|truck)/i,
  "Warehouse Equipment":   /\bwarehouse/i,
  "Barcode Scanners":      /\bbarcode|scanner/i,
  "Delivery Vehicles":     /\bdelivery|truck|van\b|lorry/i,
  "Fleet Tracking":        /\bfleet|gps\s?track/i,
  // Production
  "Machines":              /\bmachine/i,
  "Production Equipment":  /\bproduction/i,
  "Calibration Equipment": /\bcalibrat/i,
  "Maintenance Tools":     /\bmaintenance|\btool/i,
  "Safety Equipment":      /\bsafety|fire\s?extinguisher|\bppe\b/i,
  // Generic catch-alls
  "Furniture":             /\bfurniture|\bchair|\bdesks?\b|\bcabinet|\bbench|\bshelv|\blocker/i,
};

function assetMatchesCategoryFilter(asset, category) {
  if (category === "All") return true;
  if (asset.category === category || asset.assetClass === category) return true;

  const text = [asset.name, asset.description, asset.serialNumber, asset.assetClass]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const pattern = CATEGORY_KEYWORDS[category];
  if (pattern) return pattern.test(text);

  // "Office Equipment" / "Other" are broad catch-alls: match if the asset is in the
  // same broad category bucket and didn't match any more specific keyword above.
  if (category === "Office Equipment" || category === "Other") {
    const matchesAnyOther = Object.entries(CATEGORY_KEYWORDS)
      .filter(([key]) => key !== category)
      .some(([, re]) => re.test(text));
    return !matchesAnyOther && (asset.category === "Office Equipment" || (asset.assetClass || "").includes("Furniture"));
  }

  return false;
}

// â”€â”€ Colour tokens per module â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MODULE_COLORS = {
  IT:             "#3b82f6",
  Administration: "#8b5cf6",
  Distribution:   "#f59e0b",
  Production:     "#10b981",
};

// â”€â”€ Extra seed assets for the three new modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const USERS = [
  { id: 1, username: "admin", password: "admin123", role: "admin", name: "System Administrator", branch: "All" },
  { id: 2, username: "harare", password: "harare123", role: "branch_manager", name: "Harare Manager", branch: "Harare" },
  { id: 3, username: "bulawayo", password: "bulawayo123", role: "branch_manager", name: "Bulawayo Manager", branch: "Bulawayo" },
  { id: 4, username: "masvingo", password: "masvingo123", role: "branch_manager", name: "Masvingo Manager", branch: "Masvingo" },
  { id: 5, username: "gweru", password: "gweru123", role: "branch_manager", name: "Gweru Manager", branch: "Gweru" },
];

const SEED_ASSETS = [
    {
      "id": "SB-001",
      "name": "Office Shed",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Leashold Improvements",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0001",
      "purchaseDate": "2024-03-20",
      "purchasePrice": 862.5,
      "currentValue": 239.54,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 23.96,
      "accumulatedDepreciation": 622.96,
      "annualDepreciation": 119.79,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Leashold Improvements.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "LAP-001",
      "name": "HP OmniBook 5 Flip",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "2025-03-07",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Clement Murindagomo",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT001. User department: IT. Designation: IT Administrator. OS: Windows 11. Software: MS Office, Zoom. Warranty expiry: 2026-05-10. Notes: Assigned to IT Administrator.",
      "lastAuditDate": "2025-07-03",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "SRV-001",
      "name": "HP",
      "category": "Servers",
      "department": "IT",
      "assetClass": "Server",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "2022-01-15",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "IT Dept",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: FDMS Machine. User department: IT. OS: Windows 11. Warranty expiry: 2025-01-15. Notes: ERP Fiscalisation Server.",
      "lastAuditDate": "2025-06-15",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-002",
      "name": "HP ProBook 450 G10",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CD4411CV7",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "IT",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. OS: Windows 11. Notes: Functional.",
      "lastAuditDate": "2025-07-03",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-003",
      "name": "HP Envy x360",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Keegan Mangunda",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Designation: Head Of Operations. OS: Windows 11.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-004",
      "name": "HP Envy x360",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "8CG4482W9R",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Victoria Sigauke",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Designation: General Manager. OS: Windows 11. Notes: Functional.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-005",
      "name": "HP Elitebook 840 G3",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CG737745P",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "IT",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-006",
      "name": "HP Elitebook 840 G3",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CG7490H6X",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "IT",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. OS: Windows 11.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-007",
      "name": "HP Elitebook 250 G8",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "CND43619NN",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Kelly Ndlovu",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Finance. Designation: Invoicing Clerk. OS: Windows 11. Notes: Functional.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT002",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CG0490XGC",
      "purchaseDate": "2025-08-08",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Ronald Chamutsa",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT002. User department: Finance. Designation: Stock Controller. OS: Windows 11. Warranty expiry: 2026-08-08. Notes: Functional.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT003",
      "name": "HP ProBook 450 G9",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CD2448MGZ",
      "purchaseDate": "2024-01-02",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Ernest Nyambo",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT003. User department: Finance. Designation: Finance Manager. OS: Windows 11. Notes: Functional.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-008",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Eldridge Mutete",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Finance. Designation: Financial Accountant.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-009",
      "name": "Asus",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Takudzwa Nhondogwa",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Finance. Designation: Cash Collector.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-010",
      "name": "HP Envy x360",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "8CG4390F7S",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Enias Mabika",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Finance. Designation: Finance Executive.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-011",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Tendai Nyasha",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Production. Designation: Head Of Engineering and Production.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-012",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Mike Chitambwe",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Production. Designation: Process Engineer.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-013",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Tapiwa Karonga",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Production.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-014",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Panashe Mangachena",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Production. Designation: Shift Supervisor.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-015",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Walter Machaka",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Sales. Designation: Sales Rep.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-016",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Phanos Bandambira",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Sales. Designation: Key Accounts Manager.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-017",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Edwin Dhlamini",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Sales. Designation: Sales Rep.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-018",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Leroy Sibanda",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Finance. Designation: Finance Clerk.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-019",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Arnold Moyo",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Sales. Designation: Sales Rep.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-020",
      "name": "HP Envy x360",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Tatenda Magovanyika",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Sales. Designation: Invoicing Clerk.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-021",
      "name": "Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Trish Chakawa",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Human Resources. Designation: Head Of Human Resources.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-022",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Fair",
      "status": "Lost",
      "serialNumber": "5CG0375MXL",
      "purchaseDate": "2025-04-09",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Bright Chikoto",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Sales. Designation: Sales Rep. OS: Windows 11. Notes: Stolen.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT004",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CG034197R",
      "purchaseDate": "2025-09-16",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Brian Chitekedza",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT004. User department: Distribution. Designation: Distribution Manager. OS: Windows 11.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT005",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Fair",
      "status": "Lost",
      "serialNumber": "5CG04792KV",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Terrence Kasiyandima",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT005. User department: Finance. Designation: Credit Controller. Notes: Stolen.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT006",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Kelvin Mukuya",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT006. User department: Human Resources. Designation: HR Administrator.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT008",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Tawanda Kusena",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT008. User department: Finance. Designation: Stock Controller.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT009",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CG041B284",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Sharon Mafunhiya",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT009. User department: Finance. Designation: Finance Clerk. OS: Windows 11. Software: M365. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT007",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CG041B1K8",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Tendai Mashanda",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT007. User department: Sales. Designation: Sales Rep.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-023",
      "name": "HP Elitebook 840 G7 Touch",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CG039DHRL",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Emmaculate Nikisi",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT008. User department: Sales. Designation: Sales Representative. OS: Windows 11.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBWK001",
      "name": "HP Pro Tower 290 G9",
      "category": "Desktops",
      "department": "IT",
      "assetClass": "Desktop",
      "branch": "Gweru",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "4CE524DJGQ",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Invocing - Gweru",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBWK001. User department: Finance. Designation: Invoicing Clerk. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT010",
      "name": "HP OmniBook 5 Flip 14 Core i7",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY5390JLZ",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Tapiwa Karonga",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT010. User department: Production. Designation: Production Planner. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT011",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY5280BJZ",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Marvelous",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT011. User department: Production. Designation: Quality Engineer. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT012",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY528BGH",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Rodwell Verengai",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT012. User department: Production. Designation: Shift Supervisor. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT013",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "8CG51712VX",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Panashe Mangachena",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT013. User department: Production. Designation: Shift Supervisor. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT014",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY5360GB4",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Bright Chikoto",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT014. User department: Sales. Designation: Sales Rep. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT015",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Gweru",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "8CG51712LT",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Calista Mupfumira",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT015. User department: Sales. Designation: Sales Rep. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT016",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY523032C",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Phanos Bandambira",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT016. User department: Sales. Designation: Key Accounts Manager. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT017",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY53809XK",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Kelly Ndlovu",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT017. User department: Finance. Designation: Invoicing Clerk. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT018",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Mutare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY525105G",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Dephine Chibvuma",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT018. User department: Finance. Designation: Invoicing Clerk. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT019",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY5280C4R",
      "purchaseDate": "2026-08-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Christabell Mashiri",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT019. User department: Sales. Designation: Head of Commercial. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT020",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY5250XGN",
      "purchaseDate": "2026-15-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Lawrence Dodzo",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT020. User department: Sales. Designation: Sales Rep. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT021",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Gweru",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY53609M6",
      "purchaseDate": "2026-22-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Jairos Kabunze",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT021. User department: Finance. Designation: Stock Controller. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT022",
      "name": "HP OmniBook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY53605MT",
      "purchaseDate": "2026-23-01",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Maidei Matsotse",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT022. User department: Finance. Designation: Stock Controller. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT023",
      "name": "HP Omnibook X Flip Laptop",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY5370WC5",
      "purchaseDate": "2026-02-02",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Prince Sibanda",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT023. User department: Sales. Designation: Sales Rep. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT024",
      "name": "HP ProBook 460 G11 Core i7",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "5CD4422ZNS",
      "purchaseDate": "2026-11-02",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Shyline Chirawu",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT024. User department: Sales. Designation: Sales Admin. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT025",
      "name": "HP Envy x360 2 in 1 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "8CG5022S0S",
      "purchaseDate": "2026-11-02",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Engelbert Mashapa",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT025. User department: Sales. Designation: Sales Rep. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT026",
      "name": "HP Omnibook 5 Flip 14 Core i5",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNY525100M",
      "purchaseDate": "2026-17-03",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Simbarashe Mafaifi",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT026. User department: Sales. Designation: Sales Rep. OS: Windows 11. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT027",
      "name": "lenovo ideapad 5 141RH9 2 IN 1 Core i5 13th gen",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "YX0DZ9Q1",
      "purchaseDate": "2026-28-05",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Elton Mutete",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT027. User department: Finance. Designation: IT GT. OS: Windows 11. Warranty expiry: 2027-28-05. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "ZWSPBLPT028",
      "name": "lenovo ideapad 5 141RH9 2 IN 1 Core i5 13th gen",
      "category": "Laptops",
      "department": "IT",
      "assetClass": "Laptop",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "YX0DZ9SS",
      "purchaseDate": "2026-28-05",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Nyasha Chikumbu",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: ZWSPBLPT028. User department: Finance. Designation: Finance Officer. OS: Windows 11. Warranty expiry: 2027-28-05. Notes: New.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "MON-001",
      "name": "HP Series 5 27FHD 527SF Monitor",
      "category": "Monitors",
      "department": "IT",
      "assetClass": "Monitor",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Eldridge Mutete",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Finance.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "PRT-001",
      "name": "HP LaserJet Pro MFP 4103DW Printer",
      "category": "Printers",
      "department": "IT",
      "assetClass": "Printer",
      "branch": "Masvingo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Masvingo deport",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. User department: Finance. Designation: Masvingo Deport.",
      "lastAuditDate": "2026-06-16",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-024",
      "name": "HP Laser Jet Pro MFP 3103fdw",
      "category": "Printers",
      "department": "IT",
      "assetClass": "Printer",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "VNF3H02336",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Sales",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: HP. User department: Sales.",
      "lastAuditDate": "2026-06-10",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-025",
      "name": "HP V197  MONITOR",
      "category": "Monitors",
      "department": "IT",
      "assetClass": "Monitor",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "3CQ6360PVS",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "IT",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: HP. User department: IT. Designation: IT.",
      "lastAuditDate": "2026-06-10",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-026",
      "name": "HP Laser Jet 137fnw",
      "category": "Printers",
      "department": "IT",
      "assetClass": "Printer",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "CNB1S4B53W",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Finance",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: HP. User department: Finance.",
      "lastAuditDate": "2026-06-10",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-027",
      "name": "HP Pro Shredder 16MC",
      "category": "Other",
      "department": "IT",
      "assetClass": "Other",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "24040139",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Finance",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: HP. User department: Finance. Designation: HQ.",
      "lastAuditDate": "2026-06-10",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-028",
      "name": "HP Laser Jet MFP 137fnw",
      "category": "Printers",
      "department": "IT",
      "assetClass": "Printer",
      "branch": "Gweru",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "CNB1T1M4FP",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Finance",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: HP. User department: Finance. Designation: Gweru Deport.",
      "lastAuditDate": "2026-06-10",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "LAP-029",
      "name": "2AN1A",
      "category": "Monitors",
      "department": "IT",
      "assetClass": "Monitor",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "QB0G984080607",
      "purchaseDate": "",
      "purchasePrice": 0,
      "currentValue": 0,
      "depreciationRate": 0,
      "monthlyDepreciation": 0,
      "accumulatedDepreciation": 0,
      "annualDepreciation": 0,
      "assignedTo": "Clement Murindagomo",
      "description": "Imported from SupremeBrands_IT_All_2026-06-16.csv. Corporate name: KOORUI. User department: IT. Designation: IT Adminstrator.",
      "lastAuditDate": "2026-06-12",
      "createdAt": "2026-06-16T00:00:00.000Z"
    },
    {
      "id": "SB-073",
      "name": "Office chair x 1",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0073",
      "purchaseDate": "2024-01-08",
      "purchasePrice": 280,
      "currentValue": 54.44,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 7.78,
      "accumulatedDepreciation": 225.56,
      "annualDepreciation": 38.89,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-074",
      "name": "Office chair x 1",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0074",
      "purchaseDate": "2024-01-08",
      "purchasePrice": 280,
      "currentValue": 54.44,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 7.78,
      "accumulatedDepreciation": 225.56,
      "annualDepreciation": 38.89,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-075",
      "name": "Capri Fridge",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0075",
      "purchaseDate": "2024-03-13",
      "purchasePrice": 469,
      "currentValue": 130.28,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 13.03,
      "accumulatedDepreciation": 338.72,
      "annualDepreciation": 65.14,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-076",
      "name": "Wooden Benches",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0076",
      "purchaseDate": "2024-03-13",
      "purchasePrice": 320,
      "currentValue": 88.89,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 8.89,
      "accumulatedDepreciation": 231.11,
      "annualDepreciation": 44.44,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-077",
      "name": "Office desks",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0077",
      "purchaseDate": "2024-03-14",
      "purchasePrice": 2400,
      "currentValue": 666.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 66.67,
      "accumulatedDepreciation": 1733.33,
      "annualDepreciation": 333.33,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-078",
      "name": "Inverter installation",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0078",
      "purchaseDate": "2024-04-12",
      "purchasePrice": 1880,
      "currentValue": 574.44,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 52.22,
      "accumulatedDepreciation": 1305.56,
      "annualDepreciation": 261.11,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-079",
      "name": "Reception Bench",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0079",
      "purchaseDate": "2024-05-18",
      "purchasePrice": 221,
      "currentValue": 73.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 6.14,
      "accumulatedDepreciation": 147.33,
      "annualDepreciation": 30.69,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-080",
      "name": "Trish Chakawa - Chairs for sales room",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0080",
      "purchaseDate": "2024-02-23",
      "purchasePrice": 100,
      "currentValue": 25,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 2.78,
      "accumulatedDepreciation": 75,
      "annualDepreciation": 13.89,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-081",
      "name": "Kwanele Lutshaba - Black plastic Chairs (Assets)",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0081",
      "purchaseDate": "2024-02-28",
      "purchasePrice": 33,
      "currentValue": 8.25,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 0.92,
      "accumulatedDepreciation": 24.75,
      "annualDepreciation": 4.58,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-082",
      "name": "Kwanele Lutshaba - Black plastic Chairs (Assets)",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0082",
      "purchaseDate": "2024-02-29",
      "purchasePrice": 11,
      "currentValue": 2.75,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 0.31,
      "accumulatedDepreciation": 8.25,
      "annualDepreciation": 1.53,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-083",
      "name": "Kwanele Lutshaba-Water Dispenser",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0083",
      "purchaseDate": "2024-03-13",
      "purchasePrice": 200,
      "currentValue": 50,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 5.56,
      "accumulatedDepreciation": 150,
      "annualDepreciation": 27.78,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-084",
      "name": "First pack 026666515 Swivel chairs x 4",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0084",
      "purchaseDate": "2024-04-09",
      "purchasePrice": 488.7,
      "currentValue": 135.75,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 13.57,
      "accumulatedDepreciation": 352.95,
      "annualDepreciation": 67.87,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-085",
      "name": "Leroy Sibanda-Safe box 36litres x 1",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0085",
      "purchaseDate": "2024-04-22",
      "purchasePrice": 550,
      "currentValue": 168.06,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 15.28,
      "accumulatedDepreciation": 381.94,
      "annualDepreciation": 76.39,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-086",
      "name": "First Pack 02672948 Swivel Chair mesh heat x 1",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0086",
      "purchaseDate": "2024-04-26",
      "purchasePrice": 121.74,
      "currentValue": 37.2,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 3.38,
      "accumulatedDepreciation": 84.54,
      "annualDepreciation": 16.91,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-087",
      "name": "First Pack 02672950 Drawer wooden desk x 1",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0087",
      "purchaseDate": "2024-04-26",
      "purchasePrice": 152.17,
      "currentValue": 46.5,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 4.23,
      "accumulatedDepreciation": 105.67,
      "annualDepreciation": 21.13,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-088",
      "name": "First Pack 02672949 Swivel Chair mesh head x 3",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0088",
      "purchaseDate": "2024-04-26",
      "purchasePrice": 366.54,
      "currentValue": 112,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 10.18,
      "accumulatedDepreciation": 254.54,
      "annualDepreciation": 50.91,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-089",
      "name": "First Pack. INV 02679853 Office Chairs x 2 BYO Branch",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0089",
      "purchaseDate": "2024-05-07",
      "purchasePrice": 440,
      "currentValue": 134.44,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 12.22,
      "accumulatedDepreciation": 305.56,
      "annualDepreciation": 61.11,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-090",
      "name": "Leroy Sibanda-Office Desks x 2 (First pack ) @ 175.00 each",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Bulawayo",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0090",
      "purchaseDate": "2024-05-17",
      "purchasePrice": 350,
      "currentValue": 116.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 9.72,
      "accumulatedDepreciation": 233.33,
      "annualDepreciation": 48.61,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-091",
      "name": "First Pack Workstation 1200x2400 A16-02/A 16-0 -- Sales Department",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0091",
      "purchaseDate": "2024-06-03",
      "purchasePrice": 1017.39,
      "currentValue": 339.13,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 28.26,
      "accumulatedDepreciation": 678.26,
      "annualDepreciation": 141.3,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-092",
      "name": "Inv02697258 First Pack- Sales office chairs",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0092",
      "purchaseDate": "2024-06-06",
      "purchasePrice": 556.52,
      "currentValue": 185.51,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 15.46,
      "accumulatedDepreciation": 371.01,
      "annualDepreciation": 77.29,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-093",
      "name": "Leroy Sibanda-Black Office Chair x 1 mesh",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0093",
      "purchaseDate": "2024-07-22",
      "purchasePrice": 253,
      "currentValue": 91.36,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 7.03,
      "accumulatedDepreciation": 161.64,
      "annualDepreciation": 35.14,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-094",
      "name": "Staff Lockers",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0094",
      "purchaseDate": "2024-08-01",
      "purchasePrice": 1391.3,
      "currentValue": 541.06,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 38.65,
      "accumulatedDepreciation": 850.24,
      "annualDepreciation": 193.24,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-095",
      "name": "Metal Cabinets",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0095",
      "purchaseDate": "2024-08-01",
      "purchasePrice": 695.65,
      "currentValue": 270.53,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 19.32,
      "accumulatedDepreciation": 425.12,
      "annualDepreciation": 96.62,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-096",
      "name": "Metal Cabinets",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0096",
      "purchaseDate": "2024-08-01",
      "purchasePrice": 332.17,
      "currentValue": 129.18,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 9.23,
      "accumulatedDepreciation": 202.99,
      "annualDepreciation": 46.13,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-097",
      "name": "Factory Cabinets",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0097",
      "purchaseDate": "2024-08-01",
      "purchasePrice": 1826.09,
      "currentValue": 710.15,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 50.72,
      "accumulatedDepreciation": 1115.94,
      "annualDepreciation": 253.62,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-098",
      "name": "Staff Lockers (4X4)",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0098",
      "purchaseDate": "2024-08-16",
      "purchasePrice": 822.13,
      "currentValue": 319.72,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 22.84,
      "accumulatedDepreciation": 502.41,
      "annualDepreciation": 114.18,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-099",
      "name": "Wall shelving",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0099",
      "purchaseDate": "2024-08-16",
      "purchasePrice": 417.78,
      "currentValue": 162.47,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 11.6,
      "accumulatedDepreciation": 255.31,
      "annualDepreciation": 58.02,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-100",
      "name": "5 burner gas cooker",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0100",
      "purchaseDate": "2024-08-21",
      "purchasePrice": 450.73,
      "currentValue": 175.28,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 12.52,
      "accumulatedDepreciation": 275.45,
      "annualDepreciation": 62.6,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-101",
      "name": "Floating desks for new Factory X 2",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0101",
      "purchaseDate": "2024-10-16",
      "purchasePrice": 220,
      "currentValue": 97.78,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 6.11,
      "accumulatedDepreciation": 122.22,
      "annualDepreciation": 30.56,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-102",
      "name": "Metal cabinets",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0102",
      "purchaseDate": "2025-02-28",
      "purchasePrice": 332.17,
      "currentValue": 184.54,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 9.23,
      "accumulatedDepreciation": 147.63,
      "annualDepreciation": 46.13,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-103",
      "name": "Swivel Chair Mesh head Rest",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0103",
      "purchaseDate": "2025-02-28",
      "purchasePrice": 365.22,
      "currentValue": 202.9,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 10.14,
      "accumulatedDepreciation": 162.32,
      "annualDepreciation": 50.72,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-104",
      "name": "Office Desk 4 Drawer",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0104",
      "purchaseDate": "2025-02-28",
      "purchasePrice": 504.36,
      "currentValue": 280.2,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 14.01,
      "accumulatedDepreciation": 224.16,
      "annualDepreciation": 70.05,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-105",
      "name": "Fourway Workstation desk 1200x2400 A16-02/A1604 and Chairs",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0105",
      "purchaseDate": "2025-08-01",
      "purchasePrice": 1016,
      "currentValue": 733.78,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 28.22,
      "accumulatedDepreciation": 282.22,
      "annualDepreciation": 141.11,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-106",
      "name": "Chairs",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0106",
      "purchaseDate": "2025-08-01",
      "purchasePrice": 640,
      "currentValue": 462.22,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 17.78,
      "accumulatedDepreciation": 177.78,
      "annualDepreciation": 88.89,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-107",
      "name": "INV02893605-Four way Desk-Engineering team and 3 chairs for Executive members",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0107",
      "purchaseDate": "2025-08-02",
      "purchasePrice": 1900.86,
      "currentValue": 1425.64,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 52.8,
      "accumulatedDepreciation": 475.21,
      "annualDepreciation": 264.01,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-108",
      "name": "Canteen Deep Freezer",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0108",
      "purchaseDate": "2025-08-03",
      "purchasePrice": 459,
      "currentValue": 344.25,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 12.75,
      "accumulatedDepreciation": 114.75,
      "annualDepreciation": 63.75,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-109",
      "name": "Security items (Metal doors, buglar bars on doors and windows)",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0109",
      "purchaseDate": "2025-11-24",
      "purchasePrice": 784,
      "currentValue": 631.56,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 21.78,
      "accumulatedDepreciation": 152.44,
      "annualDepreciation": 108.89,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-110",
      "name": "Misonite Boards",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0110",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 450,
      "currentValue": 375,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 12.5,
      "accumulatedDepreciation": 75,
      "annualDepreciation": 62.5,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-111",
      "name": "Wooden Cabin - Reform Way Guard room",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0111",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 130,
      "currentValue": 108.33,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 3.61,
      "accumulatedDepreciation": 21.67,
      "annualDepreciation": 18.06,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-112",
      "name": "Office Cubicle- Gweru warehouse",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0112",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 400,
      "currentValue": 333.33,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 11.11,
      "accumulatedDepreciation": 66.67,
      "annualDepreciation": 55.56,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-113",
      "name": "Ladder - Mutare Warehouse",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0113",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 186.3,
      "currentValue": 155.25,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 5.17,
      "accumulatedDepreciation": 31.05,
      "annualDepreciation": 25.88,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-114",
      "name": "Universal Safe - Mutare Warehouse",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0114",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 445,
      "currentValue": 370.83,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 12.36,
      "accumulatedDepreciation": 74.17,
      "annualDepreciation": 61.81,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-115",
      "name": "Office Printer Gweru Branch",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Gweru",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0115",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 89,
      "currentValue": 76.64,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 2.47,
      "accumulatedDepreciation": 12.36,
      "annualDepreciation": 12.36,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-116",
      "name": "Visitors Chair",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Gweru",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0116",
      "purchaseDate": "2026-01-14",
      "purchasePrice": 86,
      "currentValue": 74.06,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 2.39,
      "accumulatedDepreciation": 11.94,
      "annualDepreciation": 11.94,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-117",
      "name": "Drawer Desk- Grayston 1200 -3-Mutare Depot",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Mutare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0117",
      "purchaseDate": "2026-01-14",
      "purchasePrice": 690,
      "currentValue": 594.18,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 19.16,
      "accumulatedDepreciation": 95.82,
      "annualDepreciation": 95.82,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-118",
      "name": "Chair-HB Chair-Mutare Depot",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Mutare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0118",
      "purchaseDate": "2026-01-14",
      "purchasePrice": 160,
      "currentValue": 137.78,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 4.44,
      "accumulatedDepreciation": 22.22,
      "annualDepreciation": 22.22,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-119",
      "name": "Chairs-Kingston Chairs-Mutare Depot",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Mutare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0119",
      "purchaseDate": "2026-01-14",
      "purchasePrice": 260,
      "currentValue": 223.89,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 7.22,
      "accumulatedDepreciation": 36.11,
      "annualDepreciation": 36.11,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-120",
      "name": "Capitalising CHAIRS AND DESKS",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Mutare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0120",
      "purchaseDate": "2026-01-14",
      "purchasePrice": 900,
      "currentValue": 775.01,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 25,
      "accumulatedDepreciation": 124.99,
      "annualDepreciation": 124.99,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-121",
      "name": "Capitalising Medium Alamed digital Security Safe 275 x 370 x 275mm",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Mutare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0121",
      "purchaseDate": "2026-01-14",
      "purchasePrice": 495,
      "currentValue": 426.26,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 13.75,
      "accumulatedDepreciation": 68.74,
      "annualDepreciation": 68.74,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-122",
      "name": "Q#:7226093-Solar Extension-Gleneagles",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0122",
      "purchaseDate": "2026-03-05",
      "purchasePrice": 750,
      "currentValue": 687.51,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 20.83,
      "accumulatedDepreciation": 62.49,
      "annualDepreciation": 62.49,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-123",
      "name": "Q#:7226093-Solar Extension-Gleneagles",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0123",
      "purchaseDate": "2026-03-05",
      "purchasePrice": 250,
      "currentValue": 229.17,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 6.94,
      "accumulatedDepreciation": 20.83,
      "annualDepreciation": 20.83,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-124",
      "name": "Q#:7226093-Solar Extension-Gleneagles",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0124",
      "purchaseDate": "2026-03-05",
      "purchasePrice": 2100,
      "currentValue": 1925.02,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 58.33,
      "accumulatedDepreciation": 174.98,
      "annualDepreciation": 174.98,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-125",
      "name": "Q#:7226093-Solar Extension-Gleneagles",
      "category": "Office Equipment",
      "department": "Administration",
      "assetClass": "Furniture & Fittings",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0125",
      "purchaseDate": "2026-03-05",
      "purchasePrice": 304,
      "currentValue": 278.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 8.44,
      "accumulatedDepreciation": 25.33,
      "annualDepreciation": 25.33,
      "assignedTo": "Administration",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Furniture & Fittings.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-126",
      "name": "Canopy",
      "category": "Delivery Vehicles",
      "department": "Distribution",
      "assetClass": "Motor Vehicles & Trucks",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0126",
      "purchaseDate": "2024-11-30",
      "purchasePrice": 2450,
      "currentValue": 1531.29,
      "depreciationRate": 25,
      "monthlyDepreciation": 51.04,
      "accumulatedDepreciation": 918.71,
      "annualDepreciation": 255.21,
      "assignedTo": "Distribution",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Motor Vehicles & Trucks.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-127",
      "name": "Pallet Jack MAC 2.5T (2)",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0127",
      "purchaseDate": "2023-11-23",
      "purchasePrice": 1148.82,
      "currentValue": 223.38,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 31.91,
      "accumulatedDepreciation": 925.44,
      "annualDepreciation": 159.56,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-128",
      "name": "Laser, tachometer PR266",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0128",
      "purchaseDate": "2023-12-18",
      "purchasePrice": 250,
      "currentValue": 48.61,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 6.94,
      "accumulatedDepreciation": 201.39,
      "annualDepreciation": 34.72,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-129",
      "name": "LOGSAW PACKING CHAIRS",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0129",
      "purchaseDate": "2024-01-17",
      "purchasePrice": 720,
      "currentValue": 160,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 20,
      "accumulatedDepreciation": 560,
      "annualDepreciation": 100,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-130",
      "name": "LOGSAW PACKING TABLE",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0130",
      "purchaseDate": "2024-01-17",
      "purchasePrice": 300,
      "currentValue": 66.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 8.33,
      "accumulatedDepreciation": 233.33,
      "annualDepreciation": 41.67,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-131",
      "name": "LOGSAW CHAIRS",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0131",
      "purchaseDate": "2024-02-19",
      "purchasePrice": 300,
      "currentValue": 75,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 8.33,
      "accumulatedDepreciation": 225,
      "annualDepreciation": 41.67,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-132",
      "name": "Rockfish - 70% chairs for production",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0132",
      "purchaseDate": "2024-02-22",
      "purchasePrice": 470,
      "currentValue": 117.5,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 13.06,
      "accumulatedDepreciation": 352.5,
      "annualDepreciation": 65.28,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-133",
      "name": "Platform Scale DPT7 Deck 1.5m x 1.5m",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0133",
      "purchaseDate": "2024-06-05",
      "purchasePrice": 773.04,
      "currentValue": 257.68,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 21.47,
      "accumulatedDepreciation": 515.36,
      "annualDepreciation": 107.37,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-134",
      "name": "PCV0532 CAPEX WELDING MACHINE- serial number",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "23020285",
      "purchaseDate": "2024-06-27",
      "purchasePrice": 145,
      "currentValue": 56.39,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 4.03,
      "accumulatedDepreciation": 88.61,
      "annualDepreciation": 20.14,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-135",
      "name": "Storage Container",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0135",
      "purchaseDate": "2024-08-09",
      "purchasePrice": 3450,
      "currentValue": 2817.5,
      "depreciationRate": 10,
      "monthlyDepreciation": 28.75,
      "accumulatedDepreciation": 632.5,
      "annualDepreciation": 143.75,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-136",
      "name": "Generator alternator",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0136",
      "purchaseDate": "2024-09-09",
      "purchasePrice": 705,
      "currentValue": 293.75,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 19.58,
      "accumulatedDepreciation": 411.25,
      "annualDepreciation": 97.92,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-137",
      "name": "1 x Diesel HBE Generator Model 6126ZLD ENGINE No.23126509 @ Gleneagles Complex",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0137",
      "purchaseDate": "2024-09-17",
      "purchasePrice": 16000,
      "currentValue": 6666.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 444.44,
      "accumulatedDepreciation": 9333.33,
      "annualDepreciation": 2222.22,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-138",
      "name": "1 x Diesel HBE Generator Model 6126ZLD @ Reform Way Complex",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0138",
      "purchaseDate": "2024-09-21",
      "purchasePrice": 15700,
      "currentValue": 6541.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 436.11,
      "accumulatedDepreciation": 9158.33,
      "annualDepreciation": 2180.56,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-139",
      "name": "Gas Tank and Regulator",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Old Factory Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0139",
      "purchaseDate": "2024-10-08",
      "purchasePrice": 198,
      "currentValue": 88,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 5.5,
      "accumulatedDepreciation": 110,
      "annualDepreciation": 27.5,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-140",
      "name": "New factory shelving",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "New Factory Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0140",
      "purchaseDate": "2025-02-01",
      "purchasePrice": 1500,
      "currentValue": 833.33,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 41.67,
      "accumulatedDepreciation": 666.67,
      "annualDepreciation": 208.33,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-141",
      "name": "RACKING AND INDUSTRIAL SHELVING",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "New Factory Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0141",
      "purchaseDate": "2025-02-01",
      "purchasePrice": 10000,
      "currentValue": 5555.56,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 277.78,
      "accumulatedDepreciation": 4444.44,
      "annualDepreciation": 1388.89,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-142",
      "name": "Electrical cables for serviette machine installation",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0142",
      "purchaseDate": "2025-04-03",
      "purchasePrice": 737,
      "currentValue": 450.39,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 20.47,
      "accumulatedDepreciation": 286.61,
      "annualDepreciation": 102.36,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-143",
      "name": "Pneumatic fittings for serviette machine installation",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0143",
      "purchaseDate": "2025-04-03",
      "purchasePrice": 715,
      "currentValue": 436.94,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 19.86,
      "accumulatedDepreciation": 278.06,
      "annualDepreciation": 99.31,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-144",
      "name": "Scaffolding Hire for sserviette machine installation",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0144",
      "purchaseDate": "2025-04-03",
      "purchasePrice": 335,
      "currentValue": 204.72,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 9.31,
      "accumulatedDepreciation": 130.28,
      "annualDepreciation": 46.53,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-145",
      "name": "Crane for Hire- Serviett Machine Offloading Fee 10-04-2025",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0145",
      "purchaseDate": "2025-04-15",
      "purchasePrice": 1600,
      "currentValue": 977.78,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 44.44,
      "accumulatedDepreciation": 622.22,
      "annualDepreciation": 222.22,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-146",
      "name": "Packaging Plates",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0146",
      "purchaseDate": "2025-05-01",
      "purchasePrice": 5034.01,
      "currentValue": 3216.17,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 139.83,
      "accumulatedDepreciation": 1817.84,
      "annualDepreciation": 699.17,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-147",
      "name": "HAND DRUM PUMP",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0147",
      "purchaseDate": "2025-05-27",
      "purchasePrice": 25,
      "currentValue": 15.97,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 0.69,
      "accumulatedDepreciation": 9.03,
      "annualDepreciation": 3.47,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-148",
      "name": "Nicolus Scale",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0148",
      "purchaseDate": "2025-06-06",
      "purchasePrice": 790,
      "currentValue": 526.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 21.94,
      "accumulatedDepreciation": 263.33,
      "annualDepreciation": 109.72,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-149",
      "name": "LYMSH25006/GRV0543- 1 x Paper Roll Clamp- Xiamen",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0149",
      "purchaseDate": "2025-06-18",
      "purchasePrice": 7652,
      "currentValue": 5101.33,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 212.56,
      "accumulatedDepreciation": 2550.67,
      "annualDepreciation": 1062.78,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-150",
      "name": "Nicolus Scale-3Tonne Scale",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0150",
      "purchaseDate": "2025-08-01",
      "purchasePrice": 769,
      "currentValue": 555.39,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 21.36,
      "accumulatedDepreciation": 213.61,
      "annualDepreciation": 106.81,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-151",
      "name": "Purchase of a Jack Trolley - 2000kg (Bulawayo Warehouse)",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0151",
      "purchaseDate": "2025-08-01",
      "purchasePrice": 320,
      "currentValue": 231.11,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 8.89,
      "accumulatedDepreciation": 88.89,
      "annualDepreciation": 44.44,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-152",
      "name": "STEEL WIRE ARMOUR CABLE 4 CORE 2.5mm² Per M & MCB Triple Pole 60a",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0152",
      "purchaseDate": "2025-10-31",
      "purchasePrice": 99.43,
      "currentValue": 80.1,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 2.76,
      "accumulatedDepreciation": 19.33,
      "annualDepreciation": 13.81,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-153",
      "name": "Romalight -Mutare Solar Backup System",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0153",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 3200,
      "currentValue": 2666.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 88.89,
      "accumulatedDepreciation": 533.33,
      "annualDepreciation": 444.44,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-154",
      "name": "Solar Back up System for Gweru Depot",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0154",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 1700,
      "currentValue": 1416.67,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 47.22,
      "accumulatedDepreciation": 283.33,
      "annualDepreciation": 236.11,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-155",
      "name": "Rubber Sterios for Serviettes",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0155",
      "purchaseDate": "2025-12-01",
      "purchasePrice": 340,
      "currentValue": 283.34,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 9.44,
      "accumulatedDepreciation": 56.66,
      "annualDepreciation": 47.22,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    },
    {
      "id": "SB-156",
      "name": "Capitalizing pallet jacks",
      "category": "Production Equipment",
      "department": "Production",
      "assetClass": "Plant & Machinery",
      "branch": "Harare",
      "condition": "Good",
      "status": "Active",
      "serialNumber": "SUP-0156",
      "purchaseDate": "2026-01-01",
      "purchasePrice": 378.24,
      "currentValue": 325.71,
      "depreciationRate": 33.33,
      "monthlyDepreciation": 10.51,
      "accumulatedDepreciation": 52.53,
      "annualDepreciation": 52.53,
      "assignedTo": "Production",
      "description": "Imported from Supreme Brands fixed asset register. Asset class: Plant & Machinery.",
      "lastAuditDate": "2026-06-25",
      "createdAt": "2026-06-25T00:00:00.000Z"
    }
  ].map(a => normalizeAsset(a));


// â”€â”€â”€ STORAGE HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STORAGE_KEYS = { assets: "sb_assets", audit_log: "sb_audit_log", session: "sb_session" };

const loadData = async (key) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const saveData = async (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

// â”€â”€â”€ EXCEL EXPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function exportToExcel(assets, filterBranch, filterDepartment = "All") {
  const data = assets.filter(a => {
    const branchMatch = filterBranch === "All" ? true : a.branch === filterBranch;
    const deptMatch = filterDepartment === "All" ? true : assetDepartment(a) === filterDepartment;
    return branchMatch && deptMatch;
  });
  const headers = ["Asset ID","Name","Class","Asset Class","Category","Branch","Condition","Status","Serial Number","Purchase Date","Purchase Price (USD)","Current Value (USD)","Monthly Depreciation","Accumulated Depreciation","Assigned To","Description","Last Audit Date"];
  const rows = data.map(a => [a.id, a.name, assetDepartment(a), a.assetClass, a.category, a.branch, a.condition, a.status, a.serialNumber, a.purchaseDate, a.purchasePrice, a.currentValue, a.monthlyDepreciation, a.accumulatedDepreciation, a.assignedTo, a.description, a.lastAuditDate]);

  let csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SupremeBrands_Assets_${filterBranch}_${filterDepartment}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// â”€â”€â”€ ICONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Icon = ({ name, size = 18 }) => {
  const icons = {
    dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
    assets: "M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM4 5h16v2H4V5z",
    add: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    transfer: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z",
    logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    filter: "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z",
    audit: "M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z",
    users: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
    branch: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
    stats: "M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={icons[name] || icons.assets} />
    </svg>
  );
};

// â”€â”€â”€ MAIN APP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function App() {
  const [user, setUser] = useState(null);
  const [assets, setAssets] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [modal, setModal] = useState(null); // { type, data }

  // Load persisted data
  useEffect(() => {
    (async () => {
      const [savedAssets, savedLog, savedSession] = await Promise.all([
        loadData(STORAGE_KEYS.assets),
        loadData(STORAGE_KEYS.audit_log),
        loadData(STORAGE_KEYS.session),
      ]);
      setAssets((savedAssets || SEED_ASSETS).map(a => normalizeAsset(a)));
      setAuditLog(savedLog || []);
      if (savedSession) setUser(savedSession);
      setLoading(false);
    })();
  }, []);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const logAction = useCallback(async (action, details) => {
    const entry = { id: Date.now(), action, details, user: user?.name, timestamp: new Date().toISOString() };
    setAuditLog(prev => {
      const next = [entry, ...prev].slice(0, 200);
      saveData(STORAGE_KEYS.audit_log, next);
      return next;
    });
  }, [user]);

  const persistAssets = (newAssets) => {
    const normalized = newAssets.map(a => normalizeAsset(a));
    setAssets(normalized);
    saveData(STORAGE_KEYS.assets, normalized);
  };

  const login = async (username, password) => {
    const found = USERS.find(u => u.username === username && u.password === password);
    if (found) {
      setUser(found);
      await saveData(STORAGE_KEYS.session, found);
      return true;
    }
    return false;
  };

  const logout = async () => {
    setUser(null);
    await saveData(STORAGE_KEYS.session, null);
    setPage("dashboard");
  };

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={login} />;

  return (
    <div style={styles.appShell}>
      <Sidebar user={user} page={page} setPage={setPage} onLogout={logout} />
      <div style={styles.mainArea}>
        <TopBar user={user} notify={notify} assets={assets} />
        <div style={styles.content}>
          {page === "dashboard"   && <Dashboard assets={assets} user={user} setPage={setPage} />}
          {page === "assets"      && <AssetsPage assets={assets} user={user} persistAssets={persistAssets} logAction={logAction} notify={notify} setModal={setModal} />}
          {page === "dash_admin"  && <ModuleDashboard module="Administration" assets={assets} user={user} setPage={setPage} setModal={setModal} persistAssets={persistAssets} logAction={logAction} notify={notify} />}
          {page === "dash_dist"   && <ModuleDashboard module="Distribution"   assets={assets} user={user} setPage={setPage} setModal={setModal} persistAssets={persistAssets} logAction={logAction} notify={notify} />}
          {page === "dash_prod"   && <ModuleDashboard module="Production"     assets={assets} user={user} setPage={setPage} setModal={setModal} persistAssets={persistAssets} logAction={logAction} notify={notify} />}
          {page === "dash_it"     && <ModuleDashboard module="IT"             assets={assets} user={user} setPage={setPage} setModal={setModal} persistAssets={persistAssets} logAction={logAction} notify={notify} />}
          {page === "maintenance" && <MaintenancePage assets={assets} user={user} persistAssets={persistAssets} logAction={logAction} notify={notify} />}
          {page === "disposal"    && <DisposalPage    assets={assets} user={user} persistAssets={persistAssets} logAction={logAction} notify={notify} />}
          {page === "depreciation" && <DepreciationPage assets={assets} user={user} />}
          {page === "transfer"    && <TransferPage assets={assets} user={user} persistAssets={persistAssets} logAction={logAction} notify={notify} />}
          {page === "audit"       && <AuditPage auditLog={auditLog} user={user} />}
          {page === "reports"     && <ReportsPage assets={assets} user={user} />}
          {page === "users"       && user.role === "admin" && <UsersPage />}
        </div>
      </div>

      {notification && (
        <div style={{ ...styles.notification, background: notification.type === "error" ? "#ef4444" : notification.type === "warning" ? "#f59e0b" : "#10b981" }}>
          <Icon name={notification.type === "error" ? "warning" : "check"} size={16} />
          {notification.msg}
        </div>
      )}

      {modal?.type === "add" && (
        <AssetModal mode="add" user={user} assets={assets} onClose={() => setModal(null)}
          onSave={(asset) => {
            const next = [...assets, asset];
            persistAssets(next);
            logAction("ADD ASSET", `${asset.name} (${asset.id}) added to ${asset.branch}`);
            notify(`Asset "${asset.name}" added successfully`);
            setModal(null);
          }} />
      )}
      {modal?.type === "edit" && (
        <AssetModal mode="edit" asset={modal.data} user={user} assets={assets} onClose={() => setModal(null)}
          onSave={(updated) => {
            const next = assets.map(a => a.id === updated.id ? updated : a);
            persistAssets(next);
            logAction("EDIT ASSET", `${updated.name} (${updated.id}) updated`);
            notify(`Asset "${updated.name}" updated`);
            setModal(null);
          }} />
      )}
      {modal?.type === "view" && (
        <AssetViewModal asset={modal.data} onClose={() => setModal(null)} onEdit={() => setModal({ type: "edit", data: modal.data })} user={user} />
      )}
      {modal?.type === "delete" && (
        <ConfirmModal title="Dispose Asset" message={`Are you sure you want to mark "${modal.data.name}" as Disposed? This action will be logged.`}
          onConfirm={() => {
            const next = assets.map(a => a.id === modal.data.id ? { ...a, status: "Disposed" } : a);
            persistAssets(next);
            logAction("DISPOSE ASSET", `${modal.data.name} (${modal.data.id}) marked as Disposed`);
            notify(`Asset "${modal.data.name}" disposed`);
            setModal(null);
          }}
          onCancel={() => setModal(null)} />
      )}
      {modal?.type === "bulk" && (
        <BulkUploadModal user={user} onClose={() => setModal(null)}
          onUpload={(newAssets) => {
            const next = [...assets, ...newAssets];
            persistAssets(next);
            logAction("BULK UPLOAD", `${newAssets.length} assets uploaded by ${user.name}`);
            notify(`${newAssets.length} assets uploaded successfully`);
            setModal(null);
          }} assets={assets} />
      )}
    </div>
  );
}

// â”€â”€â”€ LOADING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0f1e", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", border: "3px solid #1e3a5f", borderTopColor: "#3b82f6", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#64748b", fontFamily: "Georgia, serif", letterSpacing: 2, fontSize: 12 }}>LOADING SYSTEM...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// â”€â”€â”€ LOGIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) { setError("Please enter credentials"); return; }
    setLoading(true);
    const ok = await onLogin(username, password);
    if (!ok) { setError("Invalid username or password"); setLoading(false); }
  };

  return (
    <div style={styles.loginBg}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>
          <div style={styles.logoMark}>SB</div>
          <div>
            <div style={styles.loginTitle}>Supreme Brands</div>
            <div style={styles.loginSub}>Asset Management System</div>
          </div>
        </div>

        <div style={styles.loginDivider} />

        <div style={styles.formGroup}>
          <label style={styles.label}>USERNAME</label>
          <input style={styles.input} value={username} onChange={e => { setUsername(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Enter username" />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>PASSWORD</label>
          <input style={styles.input} type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Enter password" />
        </div>

        {error && <div style={styles.errorMsg}><Icon name="warning" size={14} /> {error}</div>}

        <button style={{ ...styles.btn, ...styles.btnPrimary, width: "100%", justifyContent: "center", marginTop: 8 }}
          onClick={handleLogin} disabled={loading}>
          {loading ? "Authenticating..." : "Sign In"}
        </button>

        <div style={styles.credHint}>
          <p style={{ color: "#475569", fontSize: 11, marginTop: 20, fontFamily: "monospace" }}>Demo credentials:</p>
          <p style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>admin / admin123 &nbsp;|&nbsp; harare / harare123</p>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

// â”€â”€â”€ SIDEBAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Sidebar({ user, page, setPage, onLogout }) {
  const navItems = [
    { key: "dashboard",    icon: "dashboard", label: "Dashboard" },
    { key: "assets",       icon: "assets",    label: "Asset Register" },
    { key: "divider1",     divider: true,     label: "MODULE DASHBOARDS" },
    { key: "dash_admin",   icon: "users",     label: "Administration" },
    { key: "dash_dist",    icon: "branch",    label: "Distribution" },
    { key: "dash_prod",    icon: "stats",     label: "Production" },
    { key: "dash_it",      icon: "dashboard", label: "IT Assets" },
    { key: "divider2",     divider: true,     label: "OPERATIONS" },
    { key: "maintenance",  icon: "audit",     label: "Maintenance" },
    { key: "transfer",     icon: "transfer",  label: "Transfer Assets" },
    { key: "disposal",     icon: "delete",    label: "Disposal Register" },
    { key: "divider3",     divider: true,     label: "ANALYTICS" },
    { key: "depreciation", icon: "stats",     label: "Depreciation" },
    { key: "reports",      icon: "stats",     label: "Reports" },
    { key: "audit",        icon: "audit",     label: "Audit Log" },
    ...(user.role === "admin" ? [{ key: "users", icon: "users", label: "Users" }] : []),
  ];

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <div style={styles.sideLogoMark}>SB</div>
        <div>
          <div style={styles.sideTitle}>Supreme</div>
          <div style={styles.sideSubTitle}>Asset Register</div>
        </div>
      </div>

      <div style={styles.sideUserBadge}>
        <div style={styles.sideAvatar}>{user.name.charAt(0)}</div>
        <div>
          <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{user.name}</div>
          <div style={{ color: "#3b82f6", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{user.role === "admin" ? "Administrator" : user.branch}</div>
        </div>
      </div>

      <nav style={styles.nav}>
        {navItems.map(item => {
          if (item.divider) return (
            <div key={item.key} style={{ padding: "14px 20px 4px", color: "#1e3a5f", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, borderTop: "1px solid #1e3a5f", marginTop: 6 }}>{item.label}</div>
          );
          return (
            <button key={item.key} onClick={() => setPage(item.key)}
              style={{ ...styles.navItem, ...(page === item.key ? styles.navItemActive : {}) }}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {page === item.key && <div style={styles.navIndicator} />}
            </button>
          );
        })}
      </nav>

      <button onClick={onLogout} style={styles.logoutBtn}>
        <Icon name="logout" size={16} />
        <span>Sign Out</span>
      </button>
    </div>
  );
}

// â”€â”€â”€ TOP BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TopBar({ user, notify, assets }) {
  const activeCount = assets.filter(a => a.status === "Active").length;
  const repairCount = assets.filter(a => a.status === "Under Repair").length;

  return (
    <div style={styles.topBar}>
      <div style={styles.topBarStats}>
        <div style={styles.topStatChip}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} /> {activeCount} Active
        </div>
        {repairCount > 0 && (
          <div style={styles.topStatChip}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} /> {repairCount} Under Repair
          </div>
        )}
      </div>
      <div style={{ color: "#64748b", fontSize: 12 }}>
        {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </div>
    </div>
  );
}

// â”€â”€â”€ DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Dashboard({ assets, user, setPage }) {
  const visibleAssets = user.role === "admin" ? assets : assets.filter(a => a.branch === user.branch);
  const totalValue = visibleAssets.reduce((s, a) => s + (Number(a.currentValue) || 0), 0);
  const byBranch = BRANCHES.map(b => ({ branch: b, count: assets.filter(a => a.branch === b).length, value: assets.filter(a => a.branch === b).reduce((s, a) => s + (Number(a.currentValue) || 0), 0) }));
  const byStatus = STATUSES.map(s => ({ status: s, count: visibleAssets.filter(a => a.status === s).length }));
  const byCategory = CATEGORIES.map(c => ({ category: c, count: visibleAssets.filter(a => a.category === c).length }));
  const recentAssets = [...visibleAssets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Dashboard Overview</h1>
        <p style={styles.pageDesc}>{user.role === "admin" ? "All branches - Company-wide view" : `${user.branch} Branch - Local view`}</p>
      </div>

      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <KpiCard label="Total Assets" value={visibleAssets.length} icon="assets" color="#3b82f6" />
        <KpiCard label="Portfolio Value" value={`$${totalValue.toLocaleString()}`} icon="stats" color="#10b981" />
        <KpiCard label="Active Assets" value={visibleAssets.filter(a => a.status === "Active").length} icon="check" color="#6366f1" />
        <KpiCard label="Under Repair" value={visibleAssets.filter(a => a.status === "Under Repair").length} icon="warning" color="#f59e0b" />
      </div>

      <div style={styles.dashGrid}>
        {/* Branch breakdown - admin only */}
        {user.role === "admin" && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}><Icon name="branch" size={16} /> Branch Breakdown</h3>
            <table style={styles.table}>
              <thead><tr>{["Branch", "Assets", "Portfolio Value", ""].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {byBranch.map(b => (
                  <tr key={b.branch} style={styles.tr}>
                    <td style={styles.td}><span style={styles.branchTag}>{b.branch}</span></td>
                    <td style={styles.td}>{b.count}</td>
                    <td style={styles.td}>${b.value.toLocaleString()}</td>
                    <td style={styles.td}><div style={{ background: "#1e3a5f", height: 6, borderRadius: 3, width: "100%", overflow: "hidden" }}><div style={{ background: "#3b82f6", height: "100%", width: `${assets.length ? (b.count / assets.length * 100) : 0}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Status Breakdown */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}><Icon name="filter" size={16} /> Status Summary</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {byStatus.filter(s => s.count > 0).map(s => {
              const color = { Active: "#10b981", Inactive: "#64748b", "Under Repair": "#f59e0b", Disposed: "#ef4444", Lost: "#ec4899" }[s.status] || "#64748b";
              return (
                <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ color: "#94a3b8", flex: 1, fontSize: 13 }}>{s.status}</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 18, minWidth: 30 }}>{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}><Icon name="filter" size={16} /> By Category</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byCategory.filter(c => c.count > 0).map(c => (
              <div key={c.category} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#94a3b8", flex: 1, fontSize: 13 }}>{c.category}</span>
                <div style={{ background: "#1e3a5f", height: 8, borderRadius: 4, width: 100, overflow: "hidden" }}>
                  <div style={{ background: "#6366f1", height: "100%", width: `${visibleAssets.length ? (c.count / visibleAssets.length * 100) : 0}%` }} />
                </div>
                <span style={{ color: "#e2e8f0", fontSize: 13, minWidth: 24, textAlign: "right" }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Assets */}
        <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={styles.cardTitle}><Icon name="assets" size={16} /> Recently Added Assets</h3>
            <button onClick={() => setPage("assets")} style={styles.linkBtn}>View All</button>
          </div>
          <table style={styles.table}>
            <thead><tr>{["Asset ID", "Name", "Category", "Branch", "Value", "Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {recentAssets.map(a => (
                <tr key={a.id} style={styles.tr}>
                  <td style={styles.td}><span style={styles.assetIdTag}>{a.id}</span></td>
                  <td style={styles.td}><span style={{ color: "#e2e8f0", fontWeight: 500 }}>{a.name}</span></td>
                  <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 12 }}>{a.category}</span></td>
                  <td style={styles.td}><span style={styles.branchTag}>{a.branch}</span></td>
                  <td style={styles.td}><span style={{ color: "#10b981" }}>${Number(a.currentValue).toLocaleString()}</span></td>
                  <td style={styles.td}><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color }) {
  return (
    <div style={{ ...styles.card, display: "flex", alignItems: "center", gap: 16, padding: "20px 24px" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
        <Icon name={icon} size={22} />
      </div>
      <div>
        <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <div style={{ color: "#f1f5f9", fontSize: 26, fontWeight: 700, lineHeight: 1.2, fontFamily: "Georgia, serif" }}>{value}</div>
      </div>
    </div>
  );
}

// â”€â”€â”€ ASSETS PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AssetsPage({ assets, user, persistAssets, logAction, notify, setModal }) {
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState(user.role === "admin" ? "All" : user.branch);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterDepartment, setFilterDepartment] = useState("All");

  const visible = assets.filter(a => {
    const branchMatch = filterBranch === "All" ? true : a.branch === filterBranch;
    const statusMatch = filterStatus === "All" ? true : a.status === filterStatus;
    const catMatch = assetMatchesCategoryFilter(a, filterCategory);
    const deptMatch = filterDepartment === "All" ? true : assetDepartment(a) === filterDepartment;
    const searchMatch = !search || [a.name, a.id, a.serialNumber, a.assignedTo, a.assetClass, assetDepartment(a)].some(f => f?.toLowerCase().includes(search.toLowerCase()));
    return branchMatch && statusMatch && catMatch && deptMatch && searchMatch;
  });

  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Asset Register</h1>
          <p style={styles.pageDesc}>{visible.length} assets shown</p>
        </div>
        <div style={styles.headerActions}>
          {user.role === "admin" && (
            <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => setModal({ type: "bulk" })}>
              <Icon name="upload" size={16} /> Bulk Upload
            </button>
          )}
          {user.role === "admin" && (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => setModal({ type: "add" })}>
              <Icon name="add" size={16} /> Add Asset
            </button>
          )}
          <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={() => exportToExcel(assets, filterBranch, filterDepartment)}>
            <Icon name="download" size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <div style={styles.searchWrap}>
          <Icon name="search" size={16} />
          <input style={styles.searchInput} placeholder="Search assets, serial numbers, assignees..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={styles.select} value={filterBranch} onChange={e => setFilterBranch(e.target.value)} disabled={user.role !== "admin"}>
          <option value="All">All Branches</option>
          {BRANCHES.map(b => <option key={b}>{b}</option>)}
        </select>
        <select style={styles.select} value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
          <option value="All">All Classes</option>
          {ASSET_CLASSES.map(d => <option key={d}>{d}</option>)}
        </select>
        <select style={styles.select} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select style={styles.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead>
            <tr>
              {["Asset ID", "Name", "Class", "Category", "Branch", "Value", "Monthly Depn", "Accum. Depn", "Status", "Actions"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "#475569" }}>No assets found matching filters.</td></tr>
            ) : visible.map(a => (
              <tr key={a.id} style={styles.tr}>
                <td style={styles.td}><span style={styles.assetIdTag}>{a.id}</span></td>
                <td style={styles.td}><span style={{ color: "#e2e8f0", fontWeight: 500, fontSize: 13 }}>{a.name}</span></td>
                <td style={styles.td}><span style={{ color: MODULE_COLORS[assetDepartment(a)] || "#94a3b8", fontSize: 12, fontWeight: 600 }}>{assetDepartment(a)}</span></td>
                <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 12 }}>{a.category}</span></td>
                <td style={styles.td}><span style={styles.branchTag}>{a.branch}</span></td>
                <td style={styles.td}><span style={{ color: "#10b981", fontWeight: 600 }}>${Number(a.currentValue).toLocaleString()}</span></td>
                <td style={styles.td}><span style={{ color: "#f59e0b", fontWeight: 600 }}>{fmt(a.monthlyDepreciation)}</span></td>
                <td style={styles.td}><span style={{ color: "#ef4444", fontWeight: 600 }}>{fmt(a.accumulatedDepreciation)}</span></td>
                <td style={styles.td}><StatusBadge status={a.status} /></td>
                <td style={styles.td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={styles.iconBtn} onClick={() => setModal({ type: "view", data: a })} title="View"><Icon name="search" size={14} /></button>
                    {user.role === "admin" && <button style={styles.iconBtn} onClick={() => setModal({ type: "edit", data: a })} title="Edit"><Icon name="edit" size={14} /></button>}
                    {user.role === "admin" && a.status !== "Disposed" && <button style={{ ...styles.iconBtn, color: "#ef4444" }} onClick={() => setModal({ type: "delete", data: a })} title="Dispose"><Icon name="delete" size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// â”€â”€â”€ TRANSFER PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TransferPage({ assets, user, persistAssets, logAction, notify }) {
  const [assetId, setAssetId] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState(null);

  const visibleAssets = user.role === "admin" ? assets : assets.filter(a => a.branch === user.branch);

  const selectAsset = (id) => {
    const found = visibleAssets.find(a => a.id === id);
    setSelected(found || null);
    if (found) { setToBranch(found.branch); setNewAssignee(found.assignedTo); }
  };

  const handleTransfer = () => {
    if (!selected || !toBranch || !newAssignee) { notify("Please fill all required fields", "error"); return; }
    const changes = [];
    if (selected.branch !== toBranch) changes.push(`Branch: ${selected.branch} -> ${toBranch}`);
    if (selected.assignedTo !== newAssignee) changes.push(`Assignee: ${selected.assignedTo} -> ${newAssignee}`);
    if (!changes.length) { notify("No changes detected", "warning"); return; }

    const updated = { ...selected, branch: toBranch, assignedTo: newAssignee };
    const next = assets.map(a => a.id === selected.id ? updated : a);
    persistAssets(next);
    logAction("TRANSFER ASSET", `${selected.name} (${selected.id}) - ${changes.join(", ")}. Reason: ${reason || "N/A"}`);
    notify(`Asset "${selected.name}" transferred successfully`);
    setAssetId(""); setSelected(null); setToBranch(""); setNewAssignee(""); setReason("");
  };

  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Transfer / Reassign Asset</h1>
        <p style={styles.pageDesc}>Move assets between branches or change ownership</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Select Asset</h3>
          <div style={styles.formGroup}>
            <label style={styles.label}>ASSET</label>
            <select style={styles.select2} value={assetId} onChange={e => { setAssetId(e.target.value); selectAsset(e.target.value); }}>
              <option value="">- Select an asset -</option>
              {visibleAssets.filter(a => a.status !== "Disposed").map(a => (
                <option key={a.id} value={a.id}>{a.id} - {a.name} ({a.branch})</option>
              ))}
            </select>
          </div>
          {selected && (
            <div style={{ background: "#0f172a", borderRadius: 10, padding: 16, marginTop: 12, border: "1px solid #1e3a5f" }}>
              <div style={{ color: "#3b82f6", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Current Details</div>
              {[["Name", selected.name], ["Branch", selected.branch], ["Assigned To", selected.assignedTo], ["Status", selected.status], ["Category", selected.category]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e2d4f" }}>
                  <span style={{ color: "#64748b", fontSize: 12 }}>{k}</span>
                  <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Transfer Details</h3>
          <div style={styles.formGroup}>
            <label style={styles.label}>NEW BRANCH</label>
            <select style={styles.select2} value={toBranch} onChange={e => setToBranch(e.target.value)}>
              <option value="">- Select branch -</option>
              {BRANCHES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>NEW ASSIGNEE / OWNER</label>
            <input style={styles.input} value={newAssignee} onChange={e => setNewAssignee(e.target.value)} placeholder="Person or department" />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>REASON FOR TRANSFER</label>
            <textarea style={{ ...styles.input, height: 80, resize: "vertical" }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional reason or notes..." />
          </div>
          <button style={{ ...styles.btn, ...styles.btnPrimary, width: "100%", justifyContent: "center", marginTop: 8 }}
            onClick={handleTransfer} disabled={!selected}>
            <Icon name="transfer" size={16} /> Confirm Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ AUDIT LOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AuditPage({ auditLog, user }) {
  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Audit Log</h1>
        <p style={styles.pageDesc}>{auditLog.length} recorded actions</p>
      </div>
      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead><tr>{["Timestamp", "Action", "Details", "Performed By"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {auditLog.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "#475569" }}>No audit entries yet. Actions will appear here.</td></tr>
            ) : auditLog.map(entry => (
              <tr key={entry.id} style={styles.tr}>
                <td style={styles.td}><span style={{ color: "#64748b", fontFamily: "monospace", fontSize: 11 }}>{new Date(entry.timestamp).toLocaleString()}</span></td>
                <td style={styles.td}><span style={{ ...styles.assetIdTag, background: "#1e3a5f" }}>{entry.action}</span></td>
                <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 13 }}>{entry.details}</span></td>
                <td style={styles.td}><span style={{ color: "#e2e8f0", fontSize: 13 }}>{entry.user}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// â”€â”€â”€ REPORTS PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ReportsPage({ assets, user }) {
  const [selectedBranch, setSelectedBranch] = useState(user.role === "admin" ? "All" : user.branch);
  const filtered = selectedBranch === "All" ? assets : assets.filter(a => a.branch === selectedBranch);
  const totalPurchase = filtered.reduce((s, a) => s + (Number(a.purchasePrice) || 0), 0);
  const totalCurrent = filtered.reduce((s, a) => s + (Number(a.currentValue) || 0), 0);
  const depreciation = totalPurchase - totalCurrent;

  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Reports & Analytics</h1>
          <p style={styles.pageDesc}>Financial summary and asset analysis</p>
        </div>
        <div style={styles.headerActions}>
          <select style={styles.select} value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} disabled={user.role !== "admin"}>
            {user.role === "admin" && <option value="All">All Branches</option>}
            {BRANCHES.map(b => <option key={b}>{b}</option>)}
          </select>
          <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={() => exportToExcel(assets, selectedBranch)}>
            <Icon name="download" size={16} /> Export to CSV
          </button>
        </div>
      </div>

      <div style={styles.kpiGrid}>
        <KpiCard label="Total Assets" value={filtered.length} icon="assets" color="#3b82f6" />
        <KpiCard label="Original Cost" value={`$${totalPurchase.toLocaleString()}`} icon="stats" color="#6366f1" />
        <KpiCard label="Current Value" value={`$${totalCurrent.toLocaleString()}`} icon="stats" color="#10b981" />
        <KpiCard label="Depreciation" value={`$${depreciation.toLocaleString()}`} icon="warning" color="#ef4444" />
      </div>

      <div style={styles.dashGrid}>
        {BRANCHES.map(b => {
          const branchAssets = assets.filter(a => a.branch === b);
          const bValue = branchAssets.reduce((s, a) => s + (Number(a.currentValue) || 0), 0);
          return (
            <div key={b} style={styles.card}>
              <h3 style={styles.cardTitle}>{b} Branch</h3>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6", fontFamily: "Georgia, serif", marginBottom: 4 }}>{branchAssets.length}</div>
              <div style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Total Assets</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#10b981" }}>${bValue.toLocaleString()}</div>
              <div style={{ color: "#64748b", fontSize: 12 }}>Portfolio Value</div>
              <div style={{ marginTop: 12 }}>
                {STATUSES.filter(s => branchAssets.some(a => a.status === s)).map(s => {
                  const cnt = branchAssets.filter(a => a.status === s).length;
                  return <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                    <span style={{ color: "#64748b" }}>{s}</span><span style={{ color: "#94a3b8" }}>{cnt}</span>
                  </div>;
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...styles.card, marginTop: 0 }}>
        <h3 style={styles.cardTitle}>Full Asset List - {selectedBranch}</h3>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead><tr>{["ID", "Name", "Category", "Branch", "Purchase Price", "Current Value", "Depreciation", "Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} style={styles.tr}>
                <td style={styles.td}><span style={styles.assetIdTag}>{a.id}</span></td>
                <td style={styles.td}><span style={{ color: "#e2e8f0", fontSize: 13 }}>{a.name}</span></td>
                <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 12 }}>{a.category}</span></td>
                <td style={styles.td}><span style={styles.branchTag}>{a.branch}</span></td>
                <td style={styles.td}>${Number(a.purchasePrice).toLocaleString()}</td>
                <td style={styles.td}><span style={{ color: "#10b981" }}>${Number(a.currentValue).toLocaleString()}</span></td>
                <td style={styles.td}><span style={{ color: "#ef4444" }}>${(Number(a.purchasePrice) - Number(a.currentValue)).toLocaleString()}</span></td>
                <td style={styles.td}><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// â”€â”€â”€ USERS PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function UsersPage() {
  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>System Users</h1>
        <p style={styles.pageDesc}>Manage access credentials for all branches</p>
      </div>
      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead><tr>{["Name", "Username", "Role", "Branch Access"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {USERS.map(u => (
              <tr key={u.id} style={styles.tr}>
                <td style={styles.td}><span style={{ color: "#e2e8f0", fontWeight: 500 }}>{u.name}</span></td>
                <td style={styles.td}><span style={{ fontFamily: "monospace", color: "#3b82f6", fontSize: 13 }}>{u.username}</span></td>
                <td style={styles.td}><span style={{ ...styles.assetIdTag, background: u.role === "admin" ? "#3b82f633" : "#6366f133", color: u.role === "admin" ? "#3b82f6" : "#818cf8" }}>{u.role === "admin" ? "Administrator" : "Branch Manager"}</span></td>
                <td style={styles.td}><span style={styles.branchTag}>{u.branch}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ ...styles.card, marginTop: 0, background: "#0c1a2e", border: "1px solid #1e3a5f" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Icon name="warning" size={18} />
          <div>
            <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Security Notice</div>
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>Branch managers can only view and transfer assets within their assigned branch. Only the Admin account has full access to add, edit, delete, and bulk upload assets across all branches. Change default passwords in production.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ MODALS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Defined OUTSIDE any render function so its identity is stable across re-renders.
// (Defining this inline inside AssetModal was the cause of the typing/focus-loss bug:
// every keystroke re-ran AssetModal, which created a brand-new Field function each
// time, so React treated it as a different component type and remounted the <input>,
// dropping focus after every character.)
function AssetModalField({ label, value, onChange, type = "text", options }) {
  return (
    <div style={styles.formGroup}>
      <label style={styles.label}>{label}</label>
      {options ? (
        <select style={{ ...styles.select2, boxSizing: "border-box" }} value={value || ""} onChange={e => onChange(e.target.value)}>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input style={styles.input} type={type} value={value || ""} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

function AssetModal({ mode, asset, user, onClose, onSave, assets: existingAssets }) {
  const nextId = () => {
    const nums = (existingAssets || []).filter(a => a.id.startsWith("SB-")).map(a => parseInt(a.id.replace("SB-", "")));
    return `SB-${String((Math.max(0, ...nums) + 1)).padStart(3, "0")}`;
  };

  const [form, setForm] = useState(asset ? { ...asset } : {
    id: "", name: "", category: CATEGORIES[0], branch: user.branch === "All" ? BRANCHES[0] : user.branch,
    condition: "Good", status: "Active", serialNumber: "", purchaseDate: new Date().toISOString().slice(0, 10),
    purchasePrice: "", currentValue: "", monthlyDepreciation: "", accumulatedDepreciation: "", depreciationRate: "", department: "Administration", assetClass: "",
    assignedTo: "", description: "", lastAuditDate: new Date().toISOString().slice(0, 10),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name || !form.branch) { return; }
    const toSave = mode === "add" ? { ...form, id: form.id || nextId(), createdAt: new Date().toISOString() } : form;
    onSave(normalizeAsset(toSave));
  };

  // Live preview of the depreciation engine's output, recalculated as the user types
  // purchase price / date / rate, so they see exactly what will be saved.
  const preview = computeDepreciation(form);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ color: "#e2e8f0", fontSize: 18, fontFamily: "Georgia, serif" }}>{mode === "add" ? "Add New Asset" : "Edit Asset"}</h2>
          <button style={styles.closeBtn} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 20px" }}>
            {mode === "add" && <AssetModalField label="ASSET ID (auto if blank)" value={form.id} onChange={v => set("id", v)} />}
            <AssetModalField label="ASSET NAME *" value={form.name} onChange={v => set("name", v)} />
            <AssetModalField label="CLASS / DEPARTMENT" options={ASSET_CLASSES} value={form.department} onChange={v => set("department", v)} />
            <AssetModalField label="ASSET CLASS" value={form.assetClass} onChange={v => set("assetClass", v)} />
            <AssetModalField label="CATEGORY" options={CATEGORIES} value={form.category} onChange={v => set("category", v)} />
            <AssetModalField label="BRANCH *" options={BRANCHES} value={form.branch} onChange={v => set("branch", v)} />
            <AssetModalField label="SERIAL NUMBER" value={form.serialNumber} onChange={v => set("serialNumber", v)} />
            <AssetModalField label="CONDITION" options={CONDITIONS} value={form.condition} onChange={v => set("condition", v)} />
            <AssetModalField label="STATUS" options={STATUSES} value={form.status} onChange={v => set("status", v)} />
            <AssetModalField label="PURCHASE DATE" type="date" value={form.purchaseDate} onChange={v => set("purchaseDate", v)} />
            <AssetModalField label="PURCHASE PRICE (USD)" type="number" value={form.purchasePrice} onChange={v => set("purchasePrice", v)} />
            <AssetModalField label="DEPRECIATION RATE (% PER YEAR) *" type="number" value={form.depreciationRate} onChange={v => set("depreciationRate", v)} />
            <AssetModalField label="ASSIGNED TO" value={form.assignedTo} onChange={v => set("assignedTo", v)} />
            <AssetModalField label="LAST AUDIT DATE" type="date" value={form.lastAuditDate} onChange={v => set("lastAuditDate", v)} />
          </div>

          {/* Read-only preview - these are calculated automatically from price, purchase
              date and rate above, so they're not directly editable. */}
          <div style={{ marginTop: 8, padding: 14, background: "#0f172a", borderRadius: 8, border: "1px solid #1e3a5f" }}>
            <div style={{ color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Calculated depreciation (auto, as of today)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <div style={{ color: "#64748b", fontSize: 11 }}>Monthly Depn</div>
                <div style={{ color: "#f59e0b", fontWeight: 600, fontSize: 14 }}>{fmt(preview.monthlyDepreciation)}</div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: 11 }}>Annual Depn</div>
                <div style={{ color: "#f59e0b", fontWeight: 600, fontSize: 14 }}>{fmt(preview.annualDepreciation)}</div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: 11 }}>Accumulated Depn</div>
                <div style={{ color: "#ef4444", fontWeight: 600, fontSize: 14 }}>{fmt(preview.accumulatedDepreciation)}</div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: 11 }}>Current Value</div>
                <div style={{ color: "#10b981", fontWeight: 600, fontSize: 14 }}>{fmt(preview.currentValue)}</div>
              </div>
            </div>
            {!preview.depreciationRate && (
              <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 10 }}>
                Set a depreciation rate above for this asset to depreciate automatically over time.
              </div>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>DESCRIPTION / NOTES</label>
            <textarea style={{ ...styles.input, height: 70, resize: "vertical" }} value={form.description || ""} onChange={e => set("description", e.target.value)} />
          </div>
        </div>
        <div style={styles.modalFooter}>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onClose}>Cancel</button>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleSave}>
            <Icon name="check" size={16} /> {mode === "add" ? "Add Asset" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetViewModal({ asset: a, onClose, onEdit, user }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <span style={styles.assetIdTag}>{a.id}</span>
            <h2 style={{ color: "#e2e8f0", fontSize: 18, fontFamily: "Georgia, serif", marginTop: 6 }}>{a.name}</h2>
          </div>
          <button style={styles.closeBtn} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#1e3a5f", borderRadius: 10, overflow: "hidden", border: "1px solid #1e3a5f" }}>
            {[["Class", assetDepartment(a)], ["Asset Class", a.assetClass], ["Category", a.category], ["Branch", a.branch], ["Serial No.", a.serialNumber], ["Assigned To", a.assignedTo], ["Condition", a.condition], ["Status", a.status], ["Purchase Date", a.purchaseDate], ["Last Audit", a.lastAuditDate], ["Purchase Price", fmt(a.purchasePrice)], ["Current Value", fmt(a.currentValue)], ["Monthly Depreciation", fmt(a.monthlyDepreciation)], ["Accumulated Depreciation", fmt(a.accumulatedDepreciation)]].map(([k, v]) => (
              <div key={k} style={{ background: "#0d1b2e", padding: "12px 16px" }}>
                <div style={{ color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{k}</div>
                <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500, marginTop: 3 }}>{v || "-"}</div>
              </div>
            ))}
          </div>
          {a.description && <div style={{ marginTop: 16, padding: 14, background: "#0f172a", borderRadius: 8, border: "1px solid #1e3a5f" }}>
            <div style={{ color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Description</div>
            <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>{a.description}</div>
          </div>}
        </div>
        <div style={styles.modalFooter}>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onClose}>Close</button>
          {user.role === "admin" && <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onEdit}><Icon name="edit" size={16} /> Edit Asset</button>}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div style={styles.modalOverlay} onClick={onCancel}>
      <div style={{ ...styles.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ color: "#ef4444", fontSize: 18, fontFamily: "Georgia, serif" }}>{title}</h2>
          <button style={styles.closeBtn} onClick={onCancel}><Icon name="close" size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px", color: "#94a3b8", lineHeight: 1.7 }}>{message}</div>
        <div style={styles.modalFooter}>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onCancel}>Cancel</button>
          <button style={{ ...styles.btn, background: "#ef4444", color: "#fff", border: "none" }} onClick={onConfirm}><Icon name="delete" size={16} /> Confirm Dispose</button>
        </div>
      </div>
    </div>
  );
}

function BulkUploadModal({ onClose, onUpload, assets }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState("");

  const TEMPLATE = `Asset Name,Class,Asset Class,Category,Branch,Serial Number,Condition,Status,Purchase Date,Purchase Price,Current Value,Monthly Depreciation,Accumulated Depreciation,Assigned To,Description
Dell OptiPlex PC,IT,Computer Equipment,IT Equipment,Harare,DELL-OPT-001,Good,Active,2024-01-15,800,650,22.22,150,IT Department,Intel i5 desktop
Office Chair,Administration,Furniture,Office Equipment,Bulawayo,CHAIR-BYO-005,Good,Active,2023-06-01,150,100,2.08,50,Open Office Bulawayo,Ergonomic black chair`;

  const nextId = (offset = 0) => {
    const nums = assets.filter(a => a.id.startsWith("SB-")).map(a => parseInt(a.id.replace("SB-", "")));
    return `SB-${String((Math.max(0, ...nums) + 1 + offset)).padStart(3, "0")}`;
  };

  const parseCSV = () => {
    try {
      const lines = text.trim().split("\n").filter(Boolean);
      if (lines.length < 2) { setError("Need at least one data row + header."); return; }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/ /g, ""));
      const rows = lines.slice(1).map((line, i) => {
        const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const obj = {};
        headers.forEach((h, idx) => obj[h] = vals[idx] || "");
        return {
          id: nextId(i),
          name: obj["assetname"] || obj["name"] || "",
          department: ASSET_CLASSES.includes(obj["class"]) ? obj["class"] : "Administration",
          assetClass: obj["assetclass"] || "",
          category: CATEGORIES.includes(obj["category"]) ? obj["category"] : "Other",
          branch: BRANCHES.includes(obj["branch"]) ? obj["branch"] : BRANCHES[0],
          serialNumber: obj["serialnumber"] || "",
          condition: CONDITIONS.includes(obj["condition"]) ? obj["condition"] : "Good",
          status: STATUSES.includes(obj["status"]) ? obj["status"] : "Active",
          purchaseDate: obj["purchasedate"] || new Date().toISOString().slice(0, 10),
          purchasePrice: Number(obj["purchaseprice"]) || 0,
          currentValue: Number(obj["currentvalue"]) || 0,
          monthlyDepreciation: Number(obj["monthlydepreciation"]) || 0,
          accumulatedDepreciation: Number(obj["accumulateddepreciation"]) || 0,
          assignedTo: obj["assignedto"] || "",
          description: obj["description"] || "",
          lastAuditDate: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        };
      }).filter(r => r.name);
      setParsed(rows);
      setError("");
    } catch { setError("Failed to parse CSV. Check format."); }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={{ color: "#e2e8f0", fontSize: 18, fontFamily: "Georgia, serif" }}>Bulk Upload Assets</h2>
          <button style={styles.closeBtn} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <button style={{ ...styles.btn, ...styles.btnSecondary, marginBottom: 12 }} onClick={() => {
            const blob = new Blob([TEMPLATE], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "asset_upload_template.csv"; a.click();
          }}>
            <Icon name="download" size={14} /> Download Template CSV
          </button>
          <div style={styles.formGroup}>
            <label style={styles.label}>PASTE CSV DATA</label>
            <textarea style={{ ...styles.input, height: 160, fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
              value={text} onChange={e => { setText(e.target.value); setParsed([]); }}
              placeholder="Paste CSV content here (including header row)..." />
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{error}</div>}
          {parsed.length > 0 && (
            <div style={{ background: "#0f172a", borderRadius: 8, padding: 12, border: "1px solid #10b981" }}>
              <div style={{ color: "#10b981", fontSize: 13, marginBottom: 8 }}>âœ“ {parsed.length} assets ready to import:</div>
              {parsed.slice(0, 5).map(a => (
                <div key={a.id} style={{ color: "#94a3b8", fontSize: 12, padding: "2px 0" }}>{a.id} - {a.name} ({a.branch})</div>
              ))}
              {parsed.length > 5 && <div style={{ color: "#64748b", fontSize: 12 }}>...and {parsed.length - 5} more</div>}
            </div>
          )}
        </div>
        <div style={styles.modalFooter}>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onClose}>Cancel</button>
          {parsed.length === 0 ? (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={parseCSV} disabled={!text.trim()}>
              <Icon name="search" size={16} /> Parse CSV
            </button>
          ) : (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => onUpload(parsed)}>
              <Icon name="upload" size={16} /> Import {parsed.length} Assets
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ SHARED HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmt(n) { return `$${Number(n||0).toLocaleString()}`; }
function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }

function MiniBar({ value, max, color = "#3b82f6" }) {
  return (
    <div style={{ background: "#1e3a5f", height: 6, borderRadius: 3, overflow: "hidden", flex: 1 }}>
      <div style={{ background: color, height: "100%", width: `${pct(value, max)}%`, transition: "width 0.4s" }} />
    </div>
  );
}

function StatRow({ label, value, color, max }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #0f1e38" }}>
      <span style={{ color: "#64748b", flex: 1, fontSize: 12 }}>{label}</span>
      {max !== undefined && <MiniBar value={value} max={max} color={color} />}
      <span style={{ color: color || "#e2e8f0", fontWeight: 600, fontSize: 13, minWidth: 28, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function AlertBanner({ icon, msg, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 8, background: color + "18", border: `1px solid ${color}44`, marginBottom: 8 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ color, fontSize: 13 }}>{msg}</span>
    </div>
  );
}

// â”€â”€â”€ MODULE DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shared dashboard used for Administration / Distribution / Production / IT
function ModuleDashboard({ module, assets, user, setPage, setModal, persistAssets, logAction, notify }) {
  const color  = MODULE_COLORS[module] || "#3b82f6";
  const catSet = MODULE_CAT_MAP[module];
  const ma     = (user.role === "admin" ? assets : assets.filter(a => a.branch === user.branch))
                   .filter(a => assetDepartment(a) === module || catSet.has(a.category));

  const totalValue   = ma.reduce((s, a) => s + (Number(a.currentValue) || 0), 0);
  const purchaseCost = ma.reduce((s, a) => s + (Number(a.purchasePrice) || 0), 0);
  const activeCount  = ma.filter(a => a.status === "Active").length;
  const repairCount  = ma.filter(a => a.status === "Under Repair").length;
  const poorCount    = ma.filter(a => ["Poor", "Disposed"].includes(a.condition)).length;

  // By branch
  const byBranch = BRANCHES.map(b => ({ branch: b, count: ma.filter(a => a.branch === b).length, value: ma.filter(a => a.branch === b).reduce((s, a) => s + (Number(a.currentValue) || 0), 0) }));
  // By category (top 6)
  const catList = [...new Set([...ma.map(a => a.assetClass || a.category), ...catSet])].filter(c => c && c !== "Other");
  const byCat = catList.map(c => ({ cat: c, count: ma.filter(a => (a.assetClass || a.category) === c).length })).filter(x => x.count > 0).slice(0, 8);
  // By condition
  const condCount = CONDITIONS.map(c => ({ cond: c, count: ma.filter(a => a.condition === c).length })).filter(x => x.count > 0);
  const condColor = { Excellent:"#10b981", Good:"#3b82f6", Fair:"#f59e0b", Poor:"#ef4444", "Under Repair":"#f97316", Disposed:"#64748b" };
  // By status
  const statCount = STATUSES.map(s => ({ stat: s, count: ma.filter(a => a.status === s).length })).filter(x => x.count > 0);
  const statColor = { Active:"#10b981", Inactive:"#64748b", "Under Repair":"#f59e0b", Disposed:"#ef4444", Lost:"#ec4899" };
  // Recent
  const recent = [...ma].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  // Alerts
  const alerts = [];
  if (repairCount > 0) alerts.push({ icon: "!", msg: `${repairCount} asset${repairCount > 1 ? "s" : ""} currently under repair`, color: "#f59e0b" });
  if (poorCount > 0)   alerts.push({ icon: "!", msg: `${poorCount} asset${poorCount > 1 ? "s" : ""} in poor or disposed condition`, color: "#ef4444" });

  const moduleIcon = { Administration:"AD", Distribution:"DS", Production:"PR", IT:"IT" }[module];
  const moduleDesc = { Administration:"Furniture, office equipment & facilities", Distribution:"Fleet, warehouse & logistics assets", Production:"Machines, equipment & calibration tools", IT:"Hardware, networking & software licenses" }[module];

  // Category labels for the "Other" free-text field
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterCat,    setFilterCat]    = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [search,       setSearch]       = useState("");

  const visible = ma.filter(a => {
    const bm = filterBranch === "All" || a.branch === filterBranch;
    const cm = assetMatchesCategoryFilter(a, filterCat);
    const sm = filterStatus === "All" || a.status === filterStatus;
    const qm = !search || [a.name, a.id, a.serialNumber, a.assignedTo, a.category, a.assetClass].some(f => f?.toLowerCase().includes(search.toLowerCase()));
    return bm && cm && sm && qm;
  });

  const [activeTab, setActiveTab] = useState("overview");

  const tabStyle = (t) => ({
    padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
    background: activeTab === t ? color : "#1e3a5f",
    color:      activeTab === t ? "#fff"  : "#64748b",
  });

  // Export this module's assets
  const exportModuleCSV = () => {
    const headers = ["ID","Name","Class","Asset Class","Category","Branch","Condition","Status","Serial No","Purchase Date","Purchase Price","Current Value","Monthly Depreciation","Accumulated Depreciation","Assigned To"];
    const rows = visible.map(a => [a.id, a.name, assetDepartment(a), a.assetClass, a.category, a.branch, a.condition, a.status, a.serialNumber, a.purchaseDate, a.purchasePrice, a.currentValue, a.monthlyDepreciation, a.accumulatedDepreciation, a.assignedTo]);
    const csv  = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const el   = document.createElement("a"); el.href = url; el.download = `${module}_Assets.csv`; el.click();
  };

  return (
    <div style={styles.pageContent}>
      {/* Header */}
      <div style={styles.pageHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{moduleIcon}</div>
          <div>
            <h1 style={{ ...styles.pageTitle, color }}>{module} Module</h1>
            <p style={styles.pageDesc}>{moduleDesc} - {ma.length} assets tracked</p>
          </div>
        </div>
        <div style={styles.headerActions}>
          {user.role === "admin" && <button style={{ ...styles.btn, background: color, color: "#fff", border: "none" }} onClick={() => setModal({ type: "add" })}><Icon name="add" size={16} /> Add Asset</button>}
          <button style={{ ...styles.btn, ...styles.btnGreen }} onClick={exportModuleCSV}><Icon name="download" size={16} /> Export CSV</button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.map((a, i) => <AlertBanner key={i} {...a} />)}

      {/* KPI Row */}
      <div style={styles.kpiGrid}>
        <KpiCard label="Total Assets"    value={ma.length}         icon="assets"   color={color} />
        <KpiCard label="Portfolio Value" value={fmt(totalValue)}   icon="stats"    color="#10b981" />
        <KpiCard label="Active"          value={activeCount}       icon="check"    color="#6366f1" />
        <KpiCard label="Under Repair"    value={repairCount}       icon="warning"  color="#f59e0b" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {["overview", "assets", "analytics"].map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* â”€â”€ OVERVIEW TAB â”€â”€ */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Branch breakdown */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}><Icon name="branch" size={15} /> By Branch</h3>
            {byBranch.map(b => (
              <div key={b.branch}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ ...styles.branchTag, fontSize: 11 }}>{b.branch}</span>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{b.count}</span>
                </div>
                <MiniBar value={b.count} max={Math.max(...byBranch.map(x => x.count), 1)} color={color} />
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 10 }}>{fmt(b.value)}</div>
              </div>
            ))}
          </div>

          {/* Condition breakdown */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}><Icon name="filter" size={15} /> Condition</h3>
            {condCount.map(c => <StatRow key={c.cond} label={c.cond} value={c.count} color={condColor[c.cond]} max={ma.length} />)}
            <div style={{ marginTop: 14, padding: "10px 0", borderTop: "1px solid #1e3a5f" }}>
              <div style={{ color: "#64748b", fontSize: 11 }}>Depreciation to date</div>
              <div style={{ color: "#ef4444", fontSize: 18, fontWeight: 700, marginTop: 2 }}>{fmt(purchaseCost - totalValue)}</div>
            </div>
          </div>

          {/* Status breakdown */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}><Icon name="filter" size={15} /> Status</h3>
            {statCount.map(s => <StatRow key={s.stat} label={s.stat} value={s.count} color={statColor[s.stat]} max={ma.length} />)}
            <div style={{ marginTop: 14, padding: "10px 0", borderTop: "1px solid #1e3a5f" }}>
              <div style={{ color: "#64748b", fontSize: 11 }}>Original purchase cost</div>
              <div style={{ color: "#3b82f6", fontSize: 18, fontWeight: 700, marginTop: 2 }}>{fmt(purchaseCost)}</div>
            </div>
          </div>

          {/* Category breakdown */}
          <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
            <h3 style={styles.cardTitle}><Icon name="filter" size={15} /> Category Breakdown</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
              {byCat.map(c => (
                <div key={c.cat} style={{ background: "#0f172a", borderRadius: 10, padding: "12px 16px", border: `1px solid ${color}33` }}>
                  <div style={{ color, fontSize: 22, fontWeight: 700, fontFamily: "Georgia,serif" }}>{c.count}</div>
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{c.cat}</div>
                  <MiniBar value={c.count} max={Math.max(...byCat.map(x => x.count), 1)} color={color} />
                </div>
              ))}
              {byCat.length === 0 && <div style={{ color: "#475569", fontSize: 13, padding: 12 }}>No assets yet. Add assets to see breakdown.</div>}
            </div>
          </div>

          {/* Recent assets */}
          <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={styles.cardTitle}><Icon name="assets" size={15} /> Recently Added</h3>
              <button onClick={() => setActiveTab("assets")} style={styles.linkBtn}>View All</button>
            </div>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead><tr>{["Asset ID","Name","Asset Class","Branch","Value","Monthly Depn","Accum. Depn","Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {recent.map(a => (
                  <tr key={a.id} style={styles.tr}>
                    <td style={styles.td}><span style={styles.assetIdTag}>{a.id}</span></td>
                    <td style={styles.td}><span style={{ color:"#e2e8f0", fontWeight:500 }}>{a.name}</span></td>
                    <td style={styles.td}><span style={{ color:"#94a3b8", fontSize:12 }}>{a.assetClass || a.category}</span></td>
                    <td style={styles.td}><span style={styles.branchTag}>{a.branch}</span></td>
                    <td style={styles.td}><span style={{ color:"#10b981" }}>{fmt(a.currentValue)}</span></td>
                    <td style={styles.td}><span style={{ color:"#f59e0b" }}>{fmt(a.monthlyDepreciation)}</span></td>
                    <td style={styles.td}><span style={{ color:"#ef4444" }}>{fmt(a.accumulatedDepreciation)}</span></td>
                    <td style={styles.td}><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={8} style={{ textAlign:"center", padding:30, color:"#475569" }}>No {module} assets yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* â”€â”€ ASSETS TAB â”€â”€ */}
      {activeTab === "assets" && (
        <div>
          <div style={styles.filterBar}>
            <div style={styles.searchWrap}>
              <Icon name="search" size={16} />
              <input style={styles.searchInput} placeholder="Search name, serial, assignee..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {user.role === "admin" && (
              <select style={styles.select} value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                <option value="All">All Branches</option>
                {BRANCHES.map(b => <option key={b}>{b}</option>)}
              </select>
            )}
            <select style={styles.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="All">All Categories</option>
              {[...catSet].map(c => <option key={c}>{c}</option>)}
            </select>
            <select style={styles.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ color:"#475569", fontSize:12, margin:"8px 0" }}>{visible.length} asset{visible.length!==1?"s":""} shown</div>
          <div style={styles.tableWrap}>
            <table style={{ ...styles.table, width:"100%" }}>
              <thead><tr>{["Asset ID","Name","Asset Class","Branch","Value","Monthly Depn","Accum. Depn","Status","Actions"].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign:"center", padding:40, color:"#475569" }}>No assets match filters.</td></tr>
                ) : visible.map(a => (
                  <tr key={a.id} style={styles.tr}>
                    <td style={styles.td}><span style={styles.assetIdTag}>{a.id}</span></td>
                    <td style={styles.td}><span style={{ color:"#e2e8f0", fontWeight:500, fontSize:13 }}>{a.name}</span></td>
                    <td style={styles.td}><span style={{ color:"#94a3b8", fontSize:12 }}>{a.assetClass || a.category}</span></td>
                    <td style={styles.td}><span style={styles.branchTag}>{a.branch}</span></td>
                    <td style={styles.td}><span style={{ color:"#10b981", fontWeight:600 }}>{fmt(a.currentValue)}</span></td>
                    <td style={styles.td}><span style={{ color:"#f59e0b", fontWeight:600 }}>{fmt(a.monthlyDepreciation)}</span></td>
                    <td style={styles.td}><span style={{ color:"#ef4444", fontWeight:600 }}>{fmt(a.accumulatedDepreciation)}</span></td>
                    <td style={styles.td}><StatusBadge status={a.status} /></td>
                    <td style={styles.td}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button style={styles.iconBtn} onClick={() => setModal({ type:"view", data:a })} title="View"><Icon name="search" size={14} /></button>
                        {user.role === "admin" && <button style={styles.iconBtn} onClick={() => setModal({ type:"edit", data:a })} title="Edit"><Icon name="edit" size={14} /></button>}
                        {user.role === "admin" && a.status !== "Disposed" && <button style={{ ...styles.iconBtn, color:"#ef4444" }} onClick={() => setModal({ type:"delete", data:a })} title="Dispose"><Icon name="delete" size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* â”€â”€ ANALYTICS TAB â”€â”€ */}
      {activeTab === "analytics" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Value by Branch</h3>
            {byBranch.filter(b=>b.value>0).map(b => (
              <div key={b.branch} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ color:"#94a3b8", fontSize:13 }}>{b.branch}</span>
                  <span style={{ color:"#10b981", fontWeight:600, fontSize:13 }}>{fmt(b.value)}</span>
                </div>
                <MiniBar value={b.value} max={Math.max(...byBranch.map(x=>x.value),1)} color="#10b981" />
              </div>
            ))}
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Asset Count by Category</h3>
            {byCat.map(c => (
              <div key={c.cat} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ color:"#94a3b8", fontSize:13 }}>{c.cat}</span>
                  <span style={{ color:color, fontWeight:600, fontSize:13 }}>{c.count}</span>
                </div>
                <MiniBar value={c.count} max={Math.max(...byCat.map(x=>x.count),1)} color={color} />
              </div>
            ))}
          </div>
          <div style={{ ...styles.card, gridColumn:"1/-1" }}>
            <h3 style={styles.cardTitle}>Financial Summary</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
              {[
                { label:"Original Cost",    value:fmt(purchaseCost),          color:"#3b82f6" },
                { label:"Current Value",    value:fmt(totalValue),            color:"#10b981" },
                { label:"Depreciation",     value:fmt(purchaseCost-totalValue),color:"#ef4444" },
                { label:"% Retained",       value:`${pct(totalValue,purchaseCost)}%`, color:"#f59e0b" },
              ].map(s => (
                <div key={s.label} style={{ background:"#0f172a", borderRadius:10, padding:"14px 18px", border:`1px solid ${s.color}33` }}>
                  <div style={{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1 }}>{s.label}</div>
                  <div style={{ color:s.color, fontSize:22, fontWeight:700, fontFamily:"Georgia,serif", marginTop:6 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DepreciationPage({ assets, user }) {
  const [selectedBranch, setSelectedBranch] = useState(user.role === "admin" ? "All" : user.branch);
  const [selectedDepartment, setSelectedDepartment] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  const filtered = assets.filter(a => {
    const branchMatch = selectedBranch === "All" || a.branch === selectedBranch;
    const departmentMatch = selectedDepartment === "All" || assetDepartment(a) === selectedDepartment;
    const statusMatch = selectedStatus === "All" || a.status === selectedStatus;
    const userMatch = user.role === "admin" || a.branch === user.branch;
    return branchMatch && departmentMatch && statusMatch && userMatch;
  });

  const totals = filtered.reduce((acc, a) => {
    acc.cost += Number(a.purchasePrice) || 0;
    acc.current += Number(a.currentValue) || 0;
    acc.monthly += Number(a.monthlyDepreciation) || 0;
    acc.accumulated += Number(a.accumulatedDepreciation) || 0;
    return acc;
  }, { cost: 0, current: 0, monthly: 0, accumulated: 0 });

  const byDepartment = ASSET_CLASSES.map(dept => {
    const items = filtered.filter(a => assetDepartment(a) === dept);
    return {
      dept,
      count: items.length,
      monthly: items.reduce((s, a) => s + (Number(a.monthlyDepreciation) || 0), 0),
      accumulated: items.reduce((s, a) => s + (Number(a.accumulatedDepreciation) || 0), 0),
    };
  }).filter(x => x.count > 0);

  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Depreciation</h1>
          <p style={styles.pageDesc}>Monthly and accumulated depreciation from the Supreme Brands register</p>
        </div>
        <div style={styles.headerActions}>
          <select style={styles.select} value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} disabled={user.role !== "admin"}>
            {user.role === "admin" && <option value="All">All Branches</option>}
            {BRANCHES.map(b => <option key={b}>{b}</option>)}
          </select>
          <select style={styles.select} value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)}>
            <option value="All">All Classes</option>
            {ASSET_CLASSES.map(d => <option key={d}>{d}</option>)}
          </select>
          <select style={styles.select} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={styles.kpiGrid}>
        <KpiCard label="Assets" value={filtered.length} icon="assets" color="#3b82f6" />
        <KpiCard label="Monthly Depn" value={fmt(totals.monthly)} icon="stats" color="#f59e0b" />
        <KpiCard label="Accum. Depn" value={fmt(totals.accumulated)} icon="warning" color="#ef4444" />
        <KpiCard label="Net Book Value" value={fmt(totals.current)} icon="check" color="#10b981" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>By Class</h3>
          {byDepartment.map(d => (
            <div key={d.dept} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: MODULE_COLORS[d.dept] || "#94a3b8", fontSize: 13, fontWeight: 700 }}>{d.dept}</span>
                <span style={{ color: "#e2e8f0", fontSize: 13 }}>{d.count}</span>
              </div>
              <MiniBar value={d.accumulated} max={Math.max(...byDepartment.map(x => x.accumulated), 1)} color={MODULE_COLORS[d.dept] || "#3b82f6"} />
              <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>{fmt(d.monthly)} monthly - {fmt(d.accumulated)} accumulated</div>
            </div>
          ))}
          {byDepartment.length === 0 && <div style={{ color: "#475569", fontSize: 13 }}>No depreciation records match the filters.</div>}
        </div>

        <div style={styles.tableWrap}>
          <table style={{ ...styles.table, width: "100%" }}>
            <thead><tr>{["Asset ID", "Name", "Class", "Asset Class", "Cost", "Monthly Depn", "Accum. Depn", "NBV", "Status"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} style={styles.tr}>
                  <td style={styles.td}><span style={styles.assetIdTag}>{a.id}</span></td>
                  <td style={styles.td}><span style={{ color: "#e2e8f0", fontWeight: 500 }}>{a.name}</span></td>
                  <td style={styles.td}><span style={{ color: MODULE_COLORS[assetDepartment(a)] || "#94a3b8", fontWeight: 700, fontSize: 12 }}>{assetDepartment(a)}</span></td>
                  <td style={styles.td}><span style={{ color: "#94a3b8", fontSize: 12 }}>{a.assetClass || a.category}</span></td>
                  <td style={styles.td}><span style={{ color: "#3b82f6", fontWeight: 600 }}>{fmt(a.purchasePrice)}</span></td>
                  <td style={styles.td}><span style={{ color: "#f59e0b", fontWeight: 600 }}>{fmt(a.monthlyDepreciation)}</span></td>
                  <td style={styles.td}><span style={{ color: "#ef4444", fontWeight: 600 }}>{fmt(a.accumulatedDepreciation)}</span></td>
                  <td style={styles.td}><span style={{ color: "#10b981", fontWeight: 600 }}>{fmt(a.currentValue)}</span></td>
                  <td style={styles.td}><StatusBadge status={a.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#475569" }}>No assets match the depreciation filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ MAINTENANCE PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MAINT_STORAGE = "sb_maintenance";
const MAINT_SEED = [
  { id:"M001", assetId:"SB-017", assetName:"Tissue Slitter Machine",  type:"Corrective",  scheduledDate:"2026-06-25", technicianName:"OEM Support ZW",    status:"In Progress", estimatedCost:1200, actualCost:null, notes:"Bearing + belt replacement", branch:"Harare",   createdAt:new Date().toISOString() },
  { id:"M002", assetId:"SB-003", assetName:"Toyota Hilux",            type:"Preventive",  scheduledDate:"2026-07-10", technicianName:"Fleet Garage Byo",   status:"Scheduled",   estimatedCost:380,  actualCost:null, notes:"30,000 km service",          branch:"Bulawayo", createdAt:new Date().toISOString() },
  { id:"M003", assetId:"SB-005", assetName:"Air Conditioner Unit",    type:"Corrective",  scheduledDate:"2026-06-28", technicianName:"CoolAir Zimbabwe",   status:"Scheduled",   estimatedCost:220,  actualCost:null, notes:"Gas recharge & fan motor",    branch:"Gweru",    createdAt:new Date().toISOString() },
  { id:"M004", assetId:"SB-006", assetName:"Crown Forklift FC5200",   type:"Preventive",  scheduledDate:"2026-08-15", technicianName:"Crown Dealer ZW",    status:"Scheduled",   estimatedCost:600,  actualCost:null, notes:"Annual full inspection",      branch:"Harare",   createdAt:new Date().toISOString() },
  { id:"M005", assetId:"SB-021", assetName:"Conveyor Belt System",    type:"Corrective",  scheduledDate:"2026-06-20", technicianName:"IndusTech Harare",   status:"Overdue",     estimatedCost:850,  actualCost:null, notes:"Belt replacement, urgent",    branch:"Harare",   createdAt:new Date().toISOString() },
];

function MaintenancePage({ assets, user, persistAssets, logAction, notify }) {
  const [records, setRecords] = useState(() => {
    try { const d = localStorage.getItem(MAINT_STORAGE); return d ? JSON.parse(d) : MAINT_SEED; } catch { return MAINT_SEED; }
  });
  const saveRecords = (r) => { setRecords(r); try { localStorage.setItem(MAINT_STORAGE, JSON.stringify(r)); } catch {} };

  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({});
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const nextId = () => `M${String(records.length + 1).padStart(3, "0")}`;

  const handleSave = () => {
    if (!form.assetId || !form.scheduledDate) { notify("Asset and scheduled date are required", "error"); return; }
    const rec = { ...form, id: form.id || nextId(), createdAt: form.createdAt || new Date().toISOString(), estimatedCost: Number(form.estimatedCost) || 0, actualCost: form.actualCost ? Number(form.actualCost) : null };
    const next = records.find(r => r.id === rec.id) ? records.map(r => r.id === rec.id ? rec : r) : [...records, rec];
    saveRecords(next);
    logAction("MAINTENANCE", `${rec.type} maintenance ${rec.id} ${form.id ? "updated" : "scheduled"} for ${rec.assetName}`);
    notify(`Maintenance record ${form.id ? "updated" : "saved"}`);
    setModal(false);
  };

  const stats = { Scheduled: records.filter(r=>r.status==="Scheduled").length, "In Progress": records.filter(r=>r.status==="In Progress").length, Completed: records.filter(r=>r.status==="Completed").length, Overdue: records.filter(r=>r.status==="Overdue").length };
  const statColor = { Scheduled:"#3b82f6","In Progress":"#f59e0b", Completed:"#10b981", Overdue:"#ef4444" };

  const visibleAssets = user.role === "admin" ? assets : assets.filter(a => a.branch === user.branch);

  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <div><h1 style={styles.pageTitle}>Maintenance Scheduler</h1><p style={styles.pageDesc}>Schedule and track all asset maintenance activities</p></div>
        <button style={{ ...styles.btn, background:"#f59e0b", color:"#111", border:"none" }} onClick={() => { setForm({ status:"Scheduled", type:"Preventive" }); setModal(true); }}>
          <Icon name="add" size={16} /> Schedule Maintenance
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        {Object.entries(stats).map(([s, n]) => (
          <div key={s} style={{ ...styles.card, borderLeft:`3px solid ${statColor[s]}`, padding:"16px 20px" }}>
            <div style={{ color:statColor[s], fontSize:26, fontWeight:700, fontFamily:"Georgia,serif" }}>{n}</div>
            <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, width:"100%" }}>
          <thead><tr>{["ID","Asset","Type","Scheduled","Technician","Status","Est. Cost","Actual Cost","Notes","Actions"].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={r.id} style={styles.tr}>
                <td style={styles.td}><span style={styles.assetIdTag}>{r.id}</span></td>
                <td style={styles.td}><span style={{ color:"#e2e8f0", fontWeight:500 }}>{r.assetName}</span></td>
                <td style={styles.td}><span style={{ color:"#94a3b8", fontSize:12 }}>{r.type}</span></td>
                <td style={styles.td}><span style={{ color: r.status==="Overdue"?"#ef4444":"#64748b", fontFamily:"monospace", fontSize:12 }}>{r.scheduledDate}</span></td>
                <td style={styles.td}><span style={{ color:"#94a3b8", fontSize:12 }}>{r.technicianName}</span></td>
                <td style={styles.td}><span style={{ background:statColor[r.status]+"22", color:statColor[r.status], padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{r.status}</span></td>
                <td style={styles.td}><span style={{ color:"#3b82f6" }}>{fmt(r.estimatedCost)}</span></td>
                <td style={styles.td}><span style={{ color:r.actualCost?"#10b981":"#475569" }}>{r.actualCost ? fmt(r.actualCost) : "-"}</span></td>
                <td style={styles.td}><span style={{ color:"#64748b", fontSize:12, maxWidth:200, display:"block", overflow:"hidden", textOverflow:"ellipsis" }}>{r.notes||"-"}</span></td>
                <td style={styles.td}>
                  <div style={{ display:"flex", gap:6 }}>
                    <button style={styles.iconBtn} onClick={() => { setForm(r); setModal(true); }} title="Edit"><Icon name="edit" size={14} /></button>
                    {r.status !== "Completed" && <button style={{ ...styles.iconBtn, color:"#10b981" }} onClick={() => { const next=records.map(x=>x.id===r.id?{...x,status:"Completed",actualCost:x.estimatedCost}:x); saveRecords(next); notify(`Maintenance ${r.id} marked complete`); logAction("MAINTENANCE COMPLETE",`${r.assetName} maintenance completed`); }} title="Complete"><Icon name="check" size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
            {records.length===0 && <tr><td colSpan={10} style={{ textAlign:"center", padding:40, color:"#475569" }}>No maintenance records yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={styles.modalOverlay} onClick={()=>setModal(false)}>
          <div style={{ ...styles.modal, maxWidth:640 }} onClick={e=>e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ color:"#e2e8f0", fontSize:18, fontFamily:"Georgia,serif" }}>{form.id?"Edit Maintenance":"Schedule Maintenance"}</h2>
              <button style={styles.closeBtn} onClick={()=>setModal(false)}><Icon name="close" size={18}/></button>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>ASSET *</label>
                  <select style={styles.select2} value={form.assetId||""} onChange={e => { const a=visibleAssets.find(x=>x.id===e.target.value); setForm(p=>({...p,assetId:e.target.value,assetName:a?.name||"",branch:a?.branch||""})); }}>
                    <option value="">- Select asset -</option>
                    {visibleAssets.filter(a=>a.status!=="Disposed").map(a=><option key={a.id} value={a.id}>{a.id} - {a.name} ({a.branch})</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>TYPE</label>
                  <select style={styles.select2} value={form.type||"Preventive"} onChange={e=>setF("type",e.target.value)}>
                    {["Preventive","Corrective","Predictive","Emergency"].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>SCHEDULED DATE *</label>
                  <input type="date" style={styles.input} value={form.scheduledDate||""} onChange={e=>setF("scheduledDate",e.target.value)}/>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>STATUS</label>
                  <select style={styles.select2} value={form.status||"Scheduled"} onChange={e=>setF("status",e.target.value)}>
                    {["Scheduled","In Progress","Completed","Overdue","Cancelled"].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>TECHNICIAN / VENDOR</label>
                  <input style={styles.input} value={form.technicianName||""} onChange={e=>setF("technicianName",e.target.value)} placeholder="Name or company"/>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>EST. COST (USD)</label>
                  <input type="number" style={styles.input} value={form.estimatedCost||""} onChange={e=>setF("estimatedCost",e.target.value)}/>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>ACTUAL COST (USD)</label>
                  <input type="number" style={styles.input} value={form.actualCost||""} onChange={e=>setF("actualCost",e.target.value)} placeholder="Fill when completed"/>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>NOTES</label>
                <textarea style={{ ...styles.input, height:70, resize:"vertical" }} value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={()=>setModal(false)}>Cancel</button>
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleSave}><Icon name="check" size={16}/> Save Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ DISPOSAL REGISTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DISP_STORAGE = "sb_disposal";
function DisposalPage({ assets, user, persistAssets, logAction, notify }) {
  const [records, setRecords] = useState(() => {
    try { const d = localStorage.getItem(DISP_STORAGE); return d ? JSON.parse(d) : []; } catch { return []; }
  });
  const saveRecords = (r) => { setRecords(r); try { localStorage.setItem(DISP_STORAGE, JSON.stringify(r)); } catch {} };

  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({});
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const visibleAssets = user.role === "admin" ? assets : assets.filter(a => a.branch === user.branch);
  const disposed = visibleAssets.filter(a => a.status === "Disposed" || a.status === "Lost");
  const visibleRecords = user.role === "admin" ? records : records.filter(r => r.branch === user.branch);

  const handleRecord = () => {
    if (!form.assetId || !form.method) { notify("Asset and disposal method required", "error"); return; }
    const asset = assets.find(a => a.id === form.assetId);
    const rec = { ...form, id:`DISP${String(records.length+1).padStart(3,"0")}`, date: form.date||new Date().toISOString().slice(0,10), recoveredValue: Number(form.recoveredValue)||0, authorizedBy: form.authorizedBy || user.name, branch: asset?.branch, department: assetDepartment(asset), assetClass: asset?.assetClass, createdAt: new Date().toISOString() };
    saveRecords([...records, rec]);
    // also mark asset disposed
    const next = assets.map(a => a.id===rec.assetId ? {...a,status:"Disposed"} : a);
    persistAssets(next);
    logAction("DISPOSAL", `${rec.assetName} (${rec.assetId}) disposed via ${rec.method}. Recovered: ${fmt(rec.recoveredValue)}`);
    notify(`Disposal record created for ${rec.assetName}`);
    setModal(false); setForm({});
  };

  const totalRecovered = visibleRecords.reduce((s,r)=>s+(Number(r.recoveredValue)||0),0);

  return (
    <div style={styles.pageContent}>
      <div style={styles.pageHeader}>
        <div><h1 style={styles.pageTitle}>Disposal Register</h1><p style={styles.pageDesc}>Track all disposed, auctioned, scrapped or written-off assets</p></div>
        {user.role==="admin" && <button style={{ ...styles.btn, background:"#ef4444", color:"#fff", border:"none" }} onClick={()=>{setForm({});setModal(true);}}><Icon name="add" size={16}/> Record Disposal</button>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        <KpiCard label="Total Disposed" value={visibleRecords.length}    icon="delete" color="#ef4444" />
        <KpiCard label="Recovered Value" value={fmt(totalRecovered)}     icon="stats"  color="#10b981" />
        <KpiCard label="Assets w/ Disposed Status" value={disposed.length} icon="warning" color="#f59e0b" />
      </div>

      <div style={styles.tableWrap}>
        <table style={{ ...styles.table, width:"100%" }}>
          <thead><tr>{["Ref","Asset","Method","Date","Recovered Value","Reason","Authorized By"].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {visibleRecords.map((r,i) => (
              <tr key={r.id} style={styles.tr}>
                <td style={styles.td}><span style={styles.assetIdTag}>{r.id}</span></td>
                <td style={styles.td}><span style={{ color:"#e2e8f0", fontWeight:500 }}>{r.assetName}</span><div style={{ color:"#475569", fontSize:11 }}>{r.assetId}</div></td>
                <td style={styles.td}><span style={{ color:"#94a3b8", fontSize:12 }}>{r.method}</span><div style={{ color:"#475569", fontSize:11 }}>{r.department || "Class n/a"} - {r.branch || "Branch n/a"}</div></td>
                <td style={styles.td}><span style={{ color:"#64748b", fontFamily:"monospace", fontSize:12 }}>{r.date}</span></td>
                <td style={styles.td}><span style={{ color:"#10b981", fontWeight:600 }}>{fmt(r.recoveredValue)}</span></td>
                <td style={styles.td}><span style={{ color:"#64748b", fontSize:12 }}>{r.reason||"-"}</span></td>
                <td style={styles.td}><span style={{ color:"#94a3b8", fontSize:12 }}>{r.authorizedBy}</span></td>
              </tr>
            ))}
            {visibleRecords.length===0 && <tr><td colSpan={7} style={{ textAlign:"center", padding:40, color:"#475569" }}>No disposal records yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={styles.modalOverlay} onClick={()=>setModal(false)}>
          <div style={{ ...styles.modal, maxWidth:560 }} onClick={e=>e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ color:"#e2e8f0", fontSize:18, fontFamily:"Georgia,serif" }}>Record Disposal</h2>
              <button style={styles.closeBtn} onClick={()=>setModal(false)}><Icon name="close" size={18}/></button>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>ASSET *</label>
                  <select style={styles.select2} value={form.assetId||""} onChange={e=>{const a=visibleAssets.find(x=>x.id===e.target.value);setForm(p=>({...p,assetId:e.target.value,assetName:a?.name||""}));}}>
                    <option value="">- Select asset -</option>
                    {visibleAssets.filter(a=>a.status!=="Disposed").map(a=><option key={a.id} value={a.id}>{a.id} - {a.name}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>DISPOSAL METHOD *</label>
                  <select style={styles.select2} value={form.method||""} onChange={e=>setF("method",e.target.value)}>
                    <option value="">- Select -</option>
                    {["Auction","Scrap","Donation","Trade-In","Write-Off","Destroyed"].map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>DISPOSAL DATE</label>
                  <input type="date" style={styles.input} value={form.date||""} onChange={e=>setF("date",e.target.value)}/>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>RECOVERED VALUE (USD)</label>
                  <input type="number" style={styles.input} value={form.recoveredValue||""} onChange={e=>setF("recoveredValue",e.target.value)}/>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>AUTHORIZED BY</label>
                  <input style={styles.input} value={form.authorizedBy||user.name} onChange={e=>setF("authorizedBy",e.target.value)}/>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>REASON / NOTES</label>
                <textarea style={{ ...styles.input, height:70, resize:"vertical" }} value={form.reason||""} onChange={e=>setF("reason",e.target.value)}/>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={()=>setModal(false)}>Cancel</button>
              <button style={{ ...styles.btn, background:"#ef4444", color:"#fff", border:"none" }} onClick={handleRecord}><Icon name="delete" size={16}/> Confirm Disposal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ BADGES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatusBadge({ status }) {
  const colors = { Active: "#10b98122", Inactive: "#64748b22", "Under Repair": "#f59e0b22", Disposed: "#ef444422", Lost: "#ec489922" };
  const text = { Active: "#10b981", Inactive: "#94a3b8", "Under Repair": "#f59e0b", Disposed: "#ef4444", Lost: "#ec4899" };
  return <span style={{ background: colors[status] || "#1e3a5f", color: text[status] || "#94a3b8", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{status}</span>;
}


// â”€â”€â”€ STYLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = {
  appShell: { display: "flex", height: "100vh", background: "#070d1a", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", overflow: "hidden", fontSize: 14 },
  sidebar: { width: 230, background: "#0a1628", borderRight: "1px solid #1e3a5f", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" },
  sidebarHeader: { padding: "22px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #1e3a5f" },
  sideLogoMark: { width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #1e40af, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0 },
  sideTitle: { color: "#e2e8f0", fontWeight: 700, fontSize: 15, lineHeight: 1.2 },
  sideSubTitle: { color: "#3b82f6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5 },
  sideUserBadge: { padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, background: "#0d1e38", margin: "12px 12px 4px", borderRadius: 10, border: "1px solid #1e3a5f" },
  sideAvatar: { width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #1d4ed8, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  nav: { flex: 1, padding: "8px 0", overflowY: "auto" },
  navItem: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", background: "none", border: "none", color: "#64748b", cursor: "pointer", textAlign: "left", fontSize: 13, position: "relative", transition: "all 0.15s" },
  navItemActive: { color: "#e2e8f0", background: "#1e3a5f33" },
  navIndicator: { position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, background: "#3b82f6", borderRadius: "0 3px 3px 0" },
  logoutBtn: { display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", background: "none", border: "none", borderTop: "1px solid #1e3a5f", color: "#ef4444", cursor: "pointer", fontSize: 13, width: "100%" },
  mainArea: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topBar: { background: "#0a1628", borderBottom: "1px solid #1e3a5f", padding: "10px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
  topBarStats: { display: "flex", gap: 16 },
  topStatChip: { color: "#64748b", fontSize: 12, display: "flex", alignItems: "center", gap: 6 },
  content: { flex: 1, overflowY: "auto", background: "#070d1a" },
  pageContent: { padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20, minHeight: "100%" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  pageTitle: { color: "#f1f5f9", fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif", margin: 0 },
  pageDesc: { color: "#475569", fontSize: 13, marginTop: 4 },
  headerActions: { display: "flex", gap: 10, alignItems: "center" },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 },
  dashGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  card: { background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 14, padding: 20 },
  cardTitle: { color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 },
  filterBar: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  searchWrap: { flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 10, background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "0 14px", color: "#475569" },
  searchInput: { background: "none", border: "none", outline: "none", color: "#e2e8f0", fontSize: 13, padding: "10px 0", flex: 1 },
  tableWrap: { background: "#0d1b2e", borderRadius: 14, border: "1px solid #1e3a5f", overflow: "auto" },
  table: { borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "12px 16px", textAlign: "left", color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid #1e3a5f", whiteSpace: "nowrap", background: "#0a1628" },
  tr: { borderBottom: "1px solid #0f1e38", transition: "background 0.1s" },
  td: { padding: "11px 16px", verticalAlign: "middle", whiteSpace: "nowrap" },
  branchTag: { background: "#1e3a5f", color: "#93c5fd", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  assetIdTag: { background: "#1e2d4f", color: "#60a5fa", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontFamily: "monospace", fontWeight: 700 },
  iconBtn: { background: "#1e3a5f", border: "none", borderRadius: 6, padding: "5px 8px", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center" },
  btn: { display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, border: "none", transition: "all 0.15s", whiteSpace: "nowrap" },
  btnPrimary: { background: "#1d4ed8", color: "#fff" },
  btnSecondary: { background: "#1e3a5f", color: "#94a3b8", border: "1px solid #2a4a7f" },
  btnGreen: { background: "#065f46", color: "#34d399", border: "1px solid #047857" },
  linkBtn: { background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 12, padding: 0 },
  select: { background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "9px 14px", color: "#94a3b8", fontSize: 13, outline: "none", cursor: "pointer" },
  select2: { background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, outline: "none", width: "100%" },
  input: { background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" },
  label: { color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, display: "block", marginBottom: 6 },
  formGroup: { marginBottom: 14, minWidth: 0 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 },
  modal: { background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHeader: { padding: "20px 24px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 },
  modalBody: { padding: "20px 24px", overflowY: "auto", flex: 1 },
  modalFooter: { padding: "16px 24px", borderTop: "1px solid #1e3a5f", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 },
  closeBtn: { background: "#1e3a5f", border: "none", borderRadius: 8, padding: "6px 8px", color: "#94a3b8", cursor: "pointer", display: "flex" },
  notification: { position: "fixed", bottom: 24, right: 24, display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "fadeIn 0.2s ease" },
  errorMsg: { color: "#ef4444", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 },
  credHint: { textAlign: "center" },
  loginBg: { minHeight: "100vh", background: "#070d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  loginCard: { background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 20, padding: 40, width: "100%", maxWidth: 400, animation: "fadeIn 0.4s ease" },
  loginLogo: { display: "flex", alignItems: "center", gap: 16, marginBottom: 28 },
  logoMark: { width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg, #1e40af, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18 },
  loginTitle: { color: "#f1f5f9", fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" },
  loginSub: { color: "#3b82f6", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, marginTop: 3 },
  loginDivider: { height: 1, background: "#1e3a5f", marginBottom: 24 },
};

