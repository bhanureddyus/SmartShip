// =============================================================================
// SmartShip MVP — SEED DATA (illustrative demo values, NOT live regulatory data)
// Every rule/rate here is a hand-seeded example for the clickable MVP.
// =============================================================================

const SEED = {
  meta: {
    productName: "Ship2US",
    productLine: "a SmartShip experience",
    dataLastUpdated: "2026-09-28",
    disclaimer:
      "Estimates on this site are illustrative and non-binding. They are not a customs determination, legal advice, or a live carrier quote. Always confirm current rules with official sources before shipping.",
    corridors: [
      { id: "IN-US", label: "India → United States", from: "India", to: "United States" },
      { id: "CN-US", label: "China → United States", from: "China", to: "United States" }
    ],
    originCountries: [
      { id: "IN", label: "India", cities: ["Hyderabad", "Mumbai", "New Delhi", "Bengaluru", "Chennai", "Kolkata"] },
      { id: "CN", label: "China", cities: ["Shanghai", "Shenzhen", "Beijing", "Guangzhou"] }
    ],
    destinations: ["Austin, TX", "New York, NY", "San Francisco, CA", "Chicago, IL", "Seattle, WA", "Houston, TX"]
  },

  // Human-readable explanations for restriction flags
  flagInfo: {
    food:        { label: "Food", tip: "Edible goods may face an FDA review at the border. Ingredients matter." },
    agricultural:{ label: "Agricultural", tip: "Plant- or animal-origin goods are screened to protect US agriculture." },
    homemade:    { label: "Homemade", tip: "Made in a home kitchen — often restricted, especially for resale." },
    perishable:  { label: "Perishable", tip: "Spoils quickly — needs fast service and no delivery guarantee." },
    liquids:     { label: "Liquids", tip: "Needs leak-proof packing; some budget carriers refuse liquids." },
    batteries:   { label: "Batteries", tip: "Lithium batteries carry carrier and airline limits and labeling rules." },
    fragile:     { label: "Fragile", tip: "Needs cushioning, careful boxing, and gentle handling." },
    textiles:    { label: "Textile", tip: "Cloth goods may need fiber-content details on the invoice." }
  },

  restrictionLevels: {
    ok:        { label: "Generally shippable", cls: "ok" },
    caution:   { label: "Possible review", cls: "caution" },
    restricted:{ label: "Often restricted", cls: "restricted" }
  },

  // Tariff-style rules for common items (all illustrative)
  itemRules: [
    {
      id: "snacks", name: "Packaged snacks & sweets",
      keywords: ["snack", "snacks", "biscuit", "biscuits", "cookie", "cookies", "chips", "namkeen", "murukku", "sweets", "mithai", "candy", "chocolate", "tea", "coffee", "masala", "spices", "spice"],
      hts: "2106.90", dutyRate: 0.05, source: "USITC / CBP", effectiveDate: "2026-09-01", confidence: "medium",
      restriction: "caution", flags: ["food", "agricultural"],
      volumePerKg: 1.6, valuePerKg: 8,
      docs: ["Ingredient list (English)", "Itemized invoice", "FDA prior notice (food shipments)"],
      consumerNote: "Commercially packaged, shelf-stable snacks are usually admissible in personal quantities. Loose or homemade food may be refused.",
      businessNote: "Commercial food imports need FDA facility registration, prior notice, and a correct HTS line per product."
    },
    {
      id: "pickles", name: "Pickles & preserves",
      keywords: ["pickle", "pickles", "achar", "jam", "jams", "chutney", "preserve", "preserves", "sauce"],
      hts: "2001.90", dutyRate: 0.086, source: "USITC / FDA", effectiveDate: "2026-09-01", confidence: "low",
      restriction: "restricted", flags: ["food", "agricultural", "homemade", "liquids", "fragile"],
      volumePerKg: 1.1, valuePerUnit: 6, defaultWeightKgPerUnit: 0.5,
      docs: ["Ingredient list (English)", "Recipient details in the US", "FDA prior notice (if commercial)"],
      consumerNote: "Homemade pickles are frequently stopped or refused at US inspection. Commercially sealed jars fare better, but expect the possibility of refusal.",
      businessNote: "Homemade food cannot be resold. Commercial pickles need an FDA-registered facility, prior notice, and full labeling."
    },
    {
      id: "clothes", name: "Clothing & wearables",
      keywords: ["clothes", "clothing", "shirt", "shirts", "tshirt", "t-shirts", "kurta", "kurtas", "saree", "saris", "sarees", "dress", "dresses", "jeans", "woolens", "sweater", "garments", "apparel"],
      hts: "6114.30", dutyRate: 0.16, source: "USITC / CBP", effectiveDate: "2026-09-01", confidence: "medium",
      restriction: "ok", flags: ["textiles"],
      volumePerKg: 5.5, valuePerKg: 15,
      docs: ["Itemized invoice", "Fiber content (e.g. cotton/synthetic %)"],
      consumerNote: "Personal clothing is fine. Used clothing sent to family should be described as 'used personal effects'.",
      businessNote: "Apparel duties vary widely by material and make (0–32% in the real world). This is an illustrative blended rate."
    },
    {
      id: "gifts", name: "Gift items & souvenirs",
      keywords: ["gift", "gifts", "souvenir", "souvenirs", "toy", "toys", "showpiece", "showpieces", "keychain", "keychains", "decor", "handicraft", "handicrafts", "ornament"],
      hts: "6307.90", dutyRate: 0.07, source: "USITC / CBP", effectiveDate: "2026-09-01", confidence: "low",
      restriction: "ok", flags: [],
      volumePerKg: 3.5, valuePerUnit: 10, defaultWeightKgPerUnit: 0.5,
      docs: ["Itemized invoice", "Gift statement (personal shipments)"],
      consumerNote: "Gifts to friends and family may qualify for lighter paperwork. Keep declared values honest — under-declaring is a violation.",
      businessNote: "Commercial sample or gift shipments follow standard entry rules and values."
    },
    {
      id: "ceramics", name: "Ceramics & glassware",
      keywords: ["ceramic", "ceramics", "pottery", "glass", "glassware", "plate", "plates", "bowl", "bowls", "cups", "porcelain", "crockery", "mug", "mugs"],
      hts: "6912.00", dutyRate: 0.08, source: "USITC / FDA", effectiveDate: "2026-09-01", confidence: "medium",
      restriction: "caution", flags: ["fragile"],
      volumePerKg: 2.2, valuePerUnit: 18, defaultWeightKgPerUnit: 0.8,
      docs: ["Itemized invoice", "Lead-free / food-safe statement (if tableware)"],
      consumerNote: "Decorative ceramics are fine. Food-contact tableware should be lead-free; FDA can spot-test.",
      businessNote: "Food-contact ceramics need FDA compliance documentation for resale."
    },
    {
      id: "textiles", name: "Home textiles & linens",
      keywords: ["textile", "textiles", "linen", "linens", "bedsheet", "bedsheets", "towel", "towels", "cushion", "cushions", "curtain", "curtains", "doormat", "rug", "rugs", "blanket", "blankets"],
      hts: "6302.60", dutyRate: 0.104, source: "USITC / CBP", effectiveDate: "2026-09-01", confidence: "medium",
      restriction: "ok", flags: ["textiles"],
      volumePerKg: 4.0, valuePerKg: 12,
      docs: ["Itemized invoice", "Fiber content"],
      consumerNote: "Household linens ship easily; note the fabric type on the invoice.",
      businessNote: "Some cotton categories carry real-world quota limits — check before large orders."
    },
    {
      id: "electronics", name: "Electronics & accessories",
      keywords: ["electronics", "charger", "chargers", "cable", "cables", "earphone", "earphones", "earbuds", "headphone", "headphones", "speaker", "speakers", "powerbank", "power bank", "battery", "batteries", "adapter", "smartwatch", "accessories"],
      hts: "8518.30", dutyRate: 0.0, source: "USITC / CBP", effectiveDate: "2026-09-01", confidence: "medium",
      restriction: "caution", flags: ["batteries"],
      volumePerKg: 1.5, valuePerUnit: 25, defaultWeightKgPerUnit: 0.3,
      docs: ["Itemized invoice", "Lithium-battery declaration (if batteries included)"],
      consumerNote: "Chargers and cables are easy. Power banks and spare lithium batteries have airline limits — some services are ground-only.",
      businessNote: "FCC rules may apply; lithium batteries must be UN 38.3-tested for transport."
    }
  ],

  // Standard box catalog (internal dimensions in inches)
  boxes: [
    { id: "S",  name: "Small box",       dimsIn: [10, 8, 6],   tareKg: 0.3, maxKg: 9,  cost: 1.2 },
    { id: "M",  name: "Medium box",      dimsIn: [14, 12, 10], tareKg: 0.5, maxKg: 18, cost: 1.8 },
    { id: "L",  name: "Large box",       dimsIn: [18, 14, 12], tareKg: 0.7, maxKg: 23, cost: 2.4 },
    { id: "XL", name: "Extra-large box", dimsIn: [20, 16, 14], tareKg: 0.9, maxKg: 30, cost: 3.0 }
  ],

  // Carrier / forwarder sample rates (illustrative, USD)
  carriers: [
    {
      id: "dhl", name: "DHL Express Worldwide", tier: "Express courier",
      rates: { "IN-US": { base: 42, perKg: 9.5, daysMin: 3, daysMax: 5 }, "CN-US": { base: 39, perKg: 8.8, daysMin: 3, daysMax: 5 } },
      fuelPct: 0.12, insuranceRate: 0.015, insuranceMin: 3, customsFee: 12,
      tracking: "Full door-to-door tracking",
      features: ["Door pickup included", "Customs paperwork handled online"],
      bannedFlags: ["homemade"],
      banNote: "Homemade food is not accepted.",
      quoteLabel: "Illustrative estimate — request a live quote"
    },
    {
      id: "fedex-econ", name: "FedEx International Economy", tier: "Balanced courier",
      rates: { "IN-US": { base: 35, perKg: 8.2, daysMin: 5, daysMax: 7 }, "CN-US": { base: 32, perKg: 7.6, daysMin: 4, daysMax: 7 } },
      fuelPct: 0.12, insuranceRate: 0.012, insuranceMin: 3, customsFee: 10,
      tracking: "Full tracking with delivery alerts",
      features: ["Good price/speed balance", "Paperless invoice supported"],
      bannedFlags: ["homemade"],
      banNote: "Homemade food is not accepted.",
      quoteLabel: "Illustrative estimate — request a live quote"
    },
    {
      id: "ups-saver", name: "UPS Worldwide Saver", tier: "Express courier",
      rates: { "IN-US": { base: 40, perKg: 9.0, daysMin: 3, daysMax: 5 }, "CN-US": { base: 37, perKg: 8.4, daysMin: 3, daysMax: 6 } },
      fuelPct: 0.125, insuranceRate: 0.012, insuranceMin: 3, customsFee: 11,
      tracking: "Full door-to-door tracking",
      features: ["Early-day delivery option", "Strong US customs brokerage"],
      bannedFlags: [],
      quoteLabel: "Illustrative estimate — request a live quote"
    },
    {
      id: "post-ems", name: "National Post EMS (Speed Post)", tier: "Budget postal",
      rates: { "IN-US": { base: 18, perKg: 5.5, daysMin: 10, daysMax: 16 }, "CN-US": { base: 16, perKg: 5.0, daysMin: 9, daysMax: 15 } },
      fuelPct: 0, insuranceRate: 0.01, insuranceMin: 0, customsFee: 3,
      tracking: "Basic milestone tracking",
      features: ["Lowest headline price", "Widely available at local post offices"],
      bannedFlags: ["batteries", "liquids"],
      banNote: "Batteries and liquids are not accepted.",
      quoteLabel: "Illustrative estimate — request a live quote"
    },
    {
      id: "forwarder", name: "Meridian Freight (forwarder)", tier: "Freight forwarder",
      rates: { "IN-US": { base: 25, perKg: 6.8, daysMin: 8, daysMax: 12 }, "CN-US": { base: 23, perKg: 6.2, daysMin: 7, daysMax: 12 } },
      fuelPct: 0.10, insuranceRate: 0.01, insuranceMin: 2, customsFee: 0,
      customsIncluded: "Concierge customs prep included",
      tracking: "Tracking + human support",
      features: ["Accepts documented food shipments", "Helps split complex shipments"],
      bannedFlags: [],
      quoteLabel: "Illustrative estimate — request a live quote"
    }
  ],

  // The one-click demo shipment (Hyderabad → Austin)
  demo: {
    id: "shp_demo",
    route: { originCountry: "IN", origin: "Hyderabad", dest: "Austin, TX", corridor: "IN-US" },
    segment: "consumer",
    narrative: "I'm shipping 5 kg of snacks, 2 pickle jars, and 3 kg of clothes from Hyderabad to Austin",
    items: [
      { uid: "d1", desc: "Packaged snacks & sweets", qty: 5, unit: "kg", weightKg: 5, valueUsd: 40, ruleId: "snacks", source: "demo" },
      { uid: "d2", desc: "Pickles & preserves (homemade)", qty: 2, unit: "jar", weightKg: 1, valueUsd: 12, ruleId: "pickles", source: "demo" },
      { uid: "d3", desc: "Clothing & wearables", qty: 3, unit: "kg", weightKg: 3, valueUsd: 45, ruleId: "clothes", source: "demo" },
      { uid: "d4", desc: "Gift items & souvenirs", qty: 2, unit: "piece", weightKg: 1, valueUsd: 20, ruleId: "gifts", source: "demo" }
    ]
  },

  // Preset pool for the SIMULATED photo-suggestion heuristic (demo only)
  photoPool: [
    { desc: "Packaged snacks & sweets", qty: 3, unit: "pack", weightKg: 0.9, valueUsd: 15, ruleId: "snacks" },
    { desc: "Ceramics & glassware", qty: 2, unit: "piece", weightKg: 1.6, valueUsd: 36, ruleId: "ceramics" },
    { desc: "Clothing & wearables", qty: 4, unit: "piece", weightKg: 1.8, valueUsd: 60, ruleId: "clothes" },
    { desc: "Electronics & accessories", qty: 1, unit: "piece", weightKg: 0.3, valueUsd: 25, ruleId: "electronics" },
    { desc: "Gift items & souvenirs", qty: 2, unit: "piece", weightKg: 1.0, valueUsd: 20, ruleId: "gifts" },
    { desc: "Home textiles & linens", qty: 2, unit: "piece", weightKg: 1.4, valueUsd: 24, ruleId: "textiles" }
  ]
};

// Default declared-value heuristics per kg/unit used when a rule has neither
const VALUE_DEFAULTS = { perKg: 12, perUnit: 10 };
