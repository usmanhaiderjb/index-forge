/**
 * Structured content for the dedicated Feature landing pages.
 *
 * Each feature represents a core capability of IndexForge with deep technical
 * explanations, real mechanisms, honest limitations, and structured SEO metadata.
 */

export type FeatureCapability = {
  title: string;
  description: string;
  detail: string;
  badge?: string;
};

export type FeatureFaq = {
  q: string;
  a: string;
};

export type FeaturePageData = {
  slug: string;
  navTitle: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  heroHeadline: {
    lead: string;
    accent: string;
  };
  heroSubheadline: string;
  summary: string;
  mockupId: "keywords" | "competitors" | "ai" | "push" | "reviews" | "precedence" | "organic" | "dashboard";
  metrics: {
    label: string;
    value: string;
    description: string;
  }[];
  capabilitiesHeading: string;
  capabilities: FeatureCapability[];
  howItWorks: {
    step: string;
    title: string;
    body: string;
  }[];
  whyLegacyFails: {
    legacy: string;
    indexForge: string;
  }[];
  faqs: FeatureFaq[];
};

export const FEATURES: FeaturePageData[] = [
  {
    slug: "keyword-research",
    navTitle: "Keyword research",
    metaTitle: "App Store Keyword Research Tool | Demand & Difficulty Scoring",
    metaDescription:
      "Explore over 675,000 App Store and Google Play keywords with verifiable search demand, algorithmic difficulty scores, and opportunity ratings. Every score is traceable to the raw autocomplete observations that produced it.",
    keywords: [
      "app store keyword research",
      "aso keyword tool",
      "keyword difficulty score",
      "app store search volume",
      "google play keyword finder",
      "ios keyword opportunity",
    ],
    eyebrow: "Keyword Corpus & Exploration",
    heroHeadline: {
      lead: "Stop guessing search volume.",
      accent: "Audit real store demand.",
    },
    heroSubheadline:
      "A living corpus of 675,000+ indexed keywords across iOS and Android. Verified by actual store autocomplete positions, ratings distribution, and SERP vacancy rather than opaque estimated search numbers.",
    summary:
      "Neither Apple nor Google publishes an official search volume API. Other tools show confident five-digit monthly volume numbers invented by hidden black-box regressions. IndexForge builds its corpus from hundreds of thousands of prefix autocomplete observations and measures real competitor resistance.",
    mockupId: "keywords",
    metrics: [
      { label: "Corpus Size", value: "675k+", description: "Active indexed search terms" },
      { label: "Demand Scoring", value: "0–100", description: "Log-scale autocomplete prominence" },
      { label: "Stores Covered", value: "iOS & Play", description: "Independent platform models" },
    ],
    capabilitiesHeading: "Deep, reproducible keyword discovery",
    capabilities: [
      {
        title: "Traceable Demand Index",
        description:
          "Demand scored 0–100 based on exact character-by-character autocomplete rank across dozens of prefix variations.",
        detail:
          "A term suggested at position #1 for 'tra' has measurably higher search velocity than one appearing only at 'tracke'. Every observation is stored in append-only tables so you can inspect the exact evidence behind any index.",
        badge: "Verifiable",
      },
      {
        title: "Platform-Specific Difficulty",
        description:
          "Different models for Apple App Store (ratings + volume) and Google Play (star rating distributions).",
        detail:
          "Play does not publish rating counts in search results; Apple does. We model each store on the signals it actually emits instead of pretending the two stores behave identically.",
      },
      {
        title: "Calculated Opportunity Score",
        description:
          "A balanced metric factoring in demand volume, algorithmic confidence, and competitor strength.",
        detail:
          "High-demand terms dominated by entrenched incumbents score lower than uncrowded terms where your app can realistically claim a top 3 ranking in 14 days.",
      },
      {
        title: "Automated Semantic Clustering",
        description:
          "Groups terms sharing SERP overlap and prefix ancestry without requiring manual keyword tagging.",
        detail:
          "When the store returns identical apps for two distinct queries, the store's search engine treats them as synonyms. IndexForge clusters them automatically to avoid splitting your keyword weight.",
      },
    ],
    howItWorks: [
      {
        step: "01",
        title: "Autocomplete Prefix Crawling",
        body: "Crawlers systematically expand prefixes (a, ab, abc) through both store endpoints with Redis-throttled rate limiting.",
      },
      {
        step: "02",
        title: "SERP Observation & Competition Scoring",
        body: "For every discovered term, the top 10 search results are fetched to measure incumbent strength, ratings density, and market concentration.",
      },
      {
        step: "03",
        title: "Opportunity Indexing",
        body: "Demand estimates and difficulty ratings are blended into an actionable 0–100 opportunity score for your target country and locale.",
      },
    ],
    whyLegacyFails: [
      {
        legacy: "Invented 'monthly search volume' figures that differ 10x between competitors.",
        indexForge: "Transparent 0–100 demand index with full observation receipts.",
      },
      {
        legacy: "Assumes Android difficulty is the same as iOS difficulty.",
        indexForge: "Explicit, separate difficulty models built from each store's unique search API responses.",
      },
      {
        legacy: "Keyword suggestions from web search engines that nobody types on mobile.",
        indexForge: "100% native mobile app store autocomplete suggestions.",
      },
    ],
    faqs: [
      {
        q: "How does IndexForge calculate keyword search demand?",
        a: "We systematically crawl store autocomplete suggestions across single-letter and multi-letter prefixes. Terms that appear earlier in suggestions and across shorter prefixes receive higher demand scores, weighted by confidence.",
      },
      {
        q: "Why do you show a demand index instead of exact monthly search volume?",
        a: "Because neither Apple nor Google publishes search volume numbers. Any tool displaying exact search numbers is presenting a statistical guess. We provide a reproducible, relative index with full data lineage.",
      },
      {
        q: "Can I filter keywords by difficulty or opportunity?",
        a: "Yes. You can filter by minimum demand, maximum difficulty, scored-only terms, country, and match type (prefix or contains) with real-time sorting.",
      },
    ],
  },
  {
    slug: "rank-tracking",
    navTitle: "Rank tracking",
    metaTitle: "App Store Rank Tracking & SERP History Monitor | IndexForge",
    metaDescription:
      "Monitor daily keyword rankings across iOS and Google Play in multiple countries. Visualise 90-day rank history, detect algorithm shifts, and record exact scan depth.",
    keywords: [
      "app rank tracker",
      "app store rank tracking",
      "google play keyword position",
      "aso rank history",
      "daily keyword monitoring",
      "app store serp tracker",
    ],
    eyebrow: "Daily SERP Monitoring",
    heroHeadline: {
      lead: "Precision rank tracking.",
      accent: "Recorded with proof.",
    },
    heroSubheadline:
      "Daily positions measured against actual store search results. Track movements over 90 days with scan depth recorded on every check so you never mistake a shallow check for a dropped rank.",
    summary:
      "Search visibility is volatile. When a keyword rank drops from #3 to #12, you need to know if an incumbent launched a paid campaign, if a competitor updated their subtitle, or if your metadata update caused the slide.",
    mockupId: "keywords",
    metrics: [
      { label: "Check Frequency", value: "Daily", description: "Synchronised early UTC sweeps" },
      { label: "History Retention", value: "90+ Days", description: "Full daily position curves" },
      { label: "Scan Depth", value: "Up to 100", description: "Documented per observation" },
    ],
    capabilitiesHeading: "Accurate, uncompromised rank tracking",
    capabilities: [
      {
        title: "Recorded Scan Depth",
        description:
          "Every rank check records how deep the store search was scanned (e.g. top 10, top 25, top 100).",
        detail:
          "If a search scans 25 apps, an app at #30 is recorded as 'not in top 25' — never as '#0' or 'lost ranking'. When scan depth changes, your historical trend remains honest.",
        badge: "Integrity",
      },
      {
        title: "Multi-Country & Multi-Locale",
        description: "Track the same keyword independently in US, GB, DE, JP, and 30+ other store territories.",
        detail:
          "Stores serve different listings and rankings depending on storefront and device locale. IndexForge isolates country parameters so international ranks never bleed together.",
      },
      {
        title: "90-Day Visual History Curves",
        description: "Interactive chart overlays comparing multiple keywords over time.",
        detail:
          "Gaps in ranking are preserved as true gaps rather than plummeting lines to zero. See immediate trendlines when listing metadata updates are released.",
      },
      {
        title: "Threshold & Delta Alerts",
        description: "Get notified when high-priority terms cross key milestones (e.g. entering Top 3 or falling out of Top 10).",
        detail:
          "Delivery to email, Slack webhooks, and recurring scheduled digests with period-over-period movement summaries.",
      },
    ],
    howItWorks: [
      {
        step: "01",
        title: "Schedule Daily Sweeps",
        body: "Rank checks execute automatically in early UTC windows using serialized store requests.",
      },
      {
        step: "02",
        title: "Store Results & Delinquency Check",
        body: "New rank positions and deltas (+3, -1) are stored in your database with timestamp and scan depth attached.",
      },
      {
        step: "03",
        title: "Correlate with Conversion",
        body: "Overlay rank movements against organic installs to see which keyword ranks actually drive downloads.",
      },
    ],
    whyLegacyFails: [
      {
        legacy: "Reports 0 when an app falls below the scan limit, destroying chart averages.",
        indexForge: "Preserves nulls and records exact scan depth for accurate longitudinal analysis.",
      },
      {
        legacy: "Delayed updates that blend multiple days of volatile ranking changes.",
        indexForge: "Strict daily snapshots captured at consistent 24-hour intervals.",
      },
      {
        legacy: "Ranks disconnected from revenue and install metrics.",
        indexForge: "Direct correlation with organic install volume and store conversions.",
      },
    ],
    faqs: [
      {
        q: "How often are keyword rankings updated?",
        a: "Rankings are updated daily during early UTC hours to ensure consistent day-over-day comparability across timezones.",
      },
      {
        q: "What happens if my app is outside the top 50 results?",
        a: "The check records that your app was not found within the 50 scanned positions without recording a fake #0 rank, preserving the statistical integrity of your charts.",
      },
      {
        q: "Can I export ranking history to CSV or external BI tools?",
        a: "Yes. You can export complete CSV histories from the dashboard or query the authenticated REST API.",
      },
    ],
  },
  {
    slug: "competitor-intelligence",
    navTitle: "Competitor intelligence",
    metaTitle: "ASO Competitor Intelligence & SERP Radar | IndexForge",
    metaDescription:
      "Monitor competitor rankings on the exact same search result pages your app is measured on. Benchmark rating counts, review velocity, and listing changes.",
    keywords: [
      "aso competitor analysis",
      "app competitor tracking",
      "app store serp benchmark",
      "competitor keyword overlap",
      "competitor rating velocity",
    ],
    eyebrow: "SERP Intelligence",
    heroHeadline: {
      lead: "Benchmark competitors",
      accent: "on the same page.",
    },
    heroSubheadline:
      "Competitor positions captured from the exact search response your own ranking was measured on. Compare ratings, review velocity, and listing copy side-by-side.",
    summary:
      "Knowing where a competitor ranks is only useful when you know what else is on the page. IndexForge captures competitor placements, rating momentum, and metadata changes on the same SERP snapshot.",
    mockupId: "competitors",
    metrics: [
      { label: "SERP Capture", value: "Same Query", description: "Side-by-side position proof" },
      { label: "Competitors Tracked", value: "Unlimited", description: "Across all tracked keywords" },
      { label: "Signal Density", value: "Ratings + Velocity", description: "Momentum tracking" },
    ],
    capabilitiesHeading: "True head-to-head ASO benchmarking",
    capabilities: [
      {
        title: "Same-Page SERP Measurement",
        description: "Competitor ranks are extracted directly from the query that measured your own app.",
        detail:
          "Rather than running a separate query seconds or minutes later, your competitor's position is recorded from the identical payload, eliminating inconsistency from algorithmic A/B tests.",
        badge: "Simultaneous",
      },
      {
        title: "Review & Rating Momentum",
        description: "Track how fast competitors are accumulating reviews and whether their sentiment is slipping.",
        detail:
          "Spot when a competitor is suffering from a buggy release or rating decline so you can target their keyword territory with tailored listing copy.",
      },
      {
        title: "Listing Change Detection",
        description: "Audit changes to competitor titles, subtitles, and promo text.",
        detail:
          "Identify when competitors change their target keyword strategy and test new value propositions in their screenshots.",
      },
      {
        title: "Organic Conquest Radar",
        description: "Discover keywords where competitors rank well but have low ratings or outdated listings.",
        detail:
          "Surface low-resistance opportunities where an updated, highly rated app can displace vulnerable incumbents in top 5 positions.",
      },
    ],
    howItWorks: [
      {
        step: "01",
        title: "Add Tracked Competitors",
        body: "Search and link competitor apps by store ID, bundle ID, or developer name.",
      },
      {
        step: "02",
        title: "Automatic Co-Ranking Detection",
        body: "During daily keyword checks, any tracked competitor appearing in the search results is recorded automatically.",
      },
      {
        step: "03",
        title: "Compare & Strategize",
        body: "View side-by-side positioning tables, rating velocities, and copy differences.",
      },
    ],
    whyLegacyFails: [
      {
        legacy: "Checks competitors through separate API calls that may see different search tests.",
        indexForge: "Captures competitor positions in the single, unified SERP result set.",
      },
      {
        legacy: "Only tracks rank without reporting the competitor's ratings or velocity.",
        indexForge: "Combines rank, total ratings, average score, and daily velocity.",
      },
      {
        legacy: "Opaque estimates of competitor downloads that cannot be validated.",
        indexForge: "Transparent, measurable public metrics grounded in verifiable store data.",
      },
    ],
    faqs: [
      {
        q: "How many competitors can I track per app?",
        a: "You can track multiple competitors per app and view their rankings across all shared keywords.",
      },
      {
        q: "Does tracking competitors cost extra API credits?",
        a: "No. Competitors appearing on the search pages we already scan are captured at zero additional cost.",
      },
      {
        q: "Can I see when a competitor changes their app title?",
        a: "Yes. Changes to competitor listing metadata and rankings are logged in your workspace audit log and historical tables.",
      },
    ],
  },
  {
    slug: "ai-aso-writer",
    navTitle: "AI ASO writer",
    metaTitle: "Character-Limit Aware AI ASO Metadata Generator | IndexForge",
    metaDescription:
      "Generate App Store and Google Play titles, subtitles, keyword fields, and descriptions with strict character-limit enforcement and data-backed rationale.",
    keywords: [
      "ai aso writer",
      "app store metadata generator",
      "ios 100 character keyword builder",
      "google play description optimizer",
      "ai aso tool",
      "app title generator",
    ],
    eyebrow: "Data-Grounded AI Optimization",
    heroHeadline: {
      lead: "AI that respects",
      accent: "store character limits.",
    },
    heroSubheadline:
      "Generate titles, subtitles, and 100-character keyword strings validated twice against store rules. Grounded in your real ranking and review data, not generic advice.",
    summary:
      "Most AI copy generators hallucinate metadata that is 32 characters for a 30-character title, getting rejected upon store submission. IndexForge enforces length limits twice — at the prompt level and via server-side schema validation.",
    mockupId: "ai",
    metrics: [
      { label: "Limit Enforcement", value: "100% Strict", description: "Zero truncated submissions" },
      { label: "Field Specificity", value: "All Fields", description: "Title, subtitle, keywords, promo" },
      { label: "Model Architecture", value: "Claude 3.7", description: "Structured JSON outputs" },
    ],
    capabilitiesHeading: "ASO metadata engineered for store algorithms",
    capabilities: [
      {
        title: "Strict Character Limit Enforcement",
        description: "Titles (30 chars), Subtitles (30 chars), and iOS Keywords (100 chars) never exceed limits.",
        detail:
          "Any variant exceeding the limit by even 1 character is discarded server-side before it ever reaches your screen, ensuring every suggestion is ready to paste into App Store Connect or Play Console.",
        badge: "Zero Rejections",
      },
      {
        title: "iOS 100-Character Keyword Builder",
        description: "Maximises character density without commas wasted on duplicate terms or spaces.",
        detail:
          "Combines high-opportunity terms into a single, compact comma-separated string, stripping redundant words already present in your Title or Subtitle.",
      },
      {
        title: "Review Theme & Sentiment Extraction",
        description: "Transforms thousands of raw user reviews into structured feature requests and bug themes.",
        detail:
          "Categorizes review sentiments so you know which features users love and which pain points are driving 1-star ratings.",
      },
      {
        title: "Store-Compliant Review Replies",
        description: "Drafts courteous, context-aware replies within character length limits.",
        detail:
          "Review replies are validated against each store's maximum length limit and prepared for one-click publishing.",
      },
    ],
    howItWorks: [
      {
        step: "01",
        title: "Select Target App & Field",
        body: "Choose the target platform (iOS or Android), language locale, and metadata field.",
      },
      {
        step: "02",
        title: "Grounded Generation",
        body: "Claude generates variants incorporating your tracked keyword targets and current ranking gaps.",
      },
      {
        step: "03",
        title: "Server-Side Length Validation",
        body: "Variants are checked for character length, keyword inclusion, and clarity before display.",
      },
    ],
    whyLegacyFails: [
      {
        legacy: "Outputs 32-character titles that get rejected by App Store Connect.",
        indexForge: "Double-enforced character limits guarantees 100% compliant copy.",
      },
      {
        legacy: "Repeats words in the keyword field that already exist in the app title.",
        indexForge: "Deduplicates across title and subtitle to maximize keyword coverage.",
      },
      {
        legacy: "Generic chat bot advice with no knowledge of your app's actual conversion data.",
        indexForge: "Grounded in your real search rankings, competitor density, and review themes.",
      },
    ],
    faqs: [
      {
        q: "Does IndexForge publish changes directly to my store listing?",
        a: "No. The AI generates structured variants for your review, and you publish them when ready. Review replies can be published directly through connected store APIs.",
      },
      {
        q: "How does the iOS keyword field generator optimize space?",
        a: "It strips spaces around commas, omits punctuation, and excludes terms already present in your app Title and Subtitle to squeeze maximum keyword power into 100 characters.",
      },
      {
        q: "Can I specify keywords that must be included?",
        a: "Yes. You can lock required brand keywords and guide the AI with specific tone and value propositions.",
      },
    ],
  },
  {
    slug: "market-trends",
    navTitle: "Market trends",
    metaTitle: "App Store Category Trends & Market Gap Finder | IndexForge",
    metaDescription:
      "Automated chart sweeps across App Store & Google Play categories. Detect rising apps by true rank climb and review velocity, and uncover unserved market gaps.",
    keywords: [
      "app store category trends",
      "app store top charts tracker",
      "market gap finder",
      "trending apps radar",
      "aso category analysis",
      "unserved market niches",
    ],
    eyebrow: "Market Radar & Gap Finder",
    heroHeadline: {
      lead: "Spot breakout apps.",
      accent: "Find unserved gaps.",
    },
    heroSubheadline:
      "Category sweeps across Top Free, Top Paid, and Top Grossing charts. Measure true rank velocity and uncover product gaps from competitor review complaints.",
    summary:
      "Most trend tools look at launch dates, which are wildly inaccurate on store listings. IndexForge detects rising apps by measuring real chart climb and rating momentum between repeated sweeps.",
    mockupId: "reviews",
    metrics: [
      { label: "Chart Types", value: "Free, Paid, Grossing", description: "Comprehensive chart coverage" },
      { label: "Climb Calculation", value: "Multi-Sweep", description: "Movement over time" },
      { label: "Review Ingestion", value: "Categorized", description: "Themes mined per niche" },
    ],
    capabilitiesHeading: "Identify winning categories and market vacancies",
    capabilities: [
      {
        title: "True Rank Climb Detection",
        description: "Measures standing improvements between consecutive chart sweeps.",
        detail:
          "An app climbing from #45 to #12 across two readings is verified as rising *now*, regardless of whether it launched yesterday or five years ago.",
        badge: "Velocity-Based",
      },
      {
        title: "Rating Growth Velocity",
        description: "Tracks daily new ratings to identify explosive organic momentum.",
        detail:
          "Differentiates legacy apps with high static ratings from agile apps rapidly capturing market share.",
      },
      {
        title: "Category Gap Finder",
        description: "Aggregates and classifies thousands of competitor reviews in a niche.",
        detail:
          "Extracts common pain points (e.g. 'no offline mode', 'unwanted subscription popup') so you can build exactly what competitor users are demanding.",
      },
      {
        title: "Multi-Category Sweeps",
        description: "Scheduled sweeps across Business, Finance, Health, Productivity, Games, and more.",
        detail: "Automated cron workers capture top charts without human intervention.",
      },
    ],
    howItWorks: [
      {
        step: "01",
        title: "Chart Snapshot Ingestion",
        body: "Background workers sweep category rankings across Top Free and Top Grossing charts.",
      },
      {
        step: "02",
        title: "Velocity Calculation",
        body: "Consecutive snapshots are compared to calculate climb score and rating acquisition speed.",
      },
      {
        step: "03",
        title: "Theme Mining",
        body: "Reviews for top apps in each niche are aggregated and classified into feature gaps and monetisation friction.",
      },
    ],
    whyLegacyFails: [
      {
        legacy: "Filters by 'new release date' which stores misstate by up to six years.",
        indexForge: "Ranks breakout apps by verified position climb between consecutive readings.",
      },
      {
        legacy: "Shows raw review feeds with no actionable thematic structure.",
        indexForge: "Extracts structured gap themes backed by verifiable review IDs.",
      },
      {
        legacy: "Ignores the relationship between chart position and review growth.",
        indexForge: "Correlates rating velocity with rank climb.",
      },
    ],
    faqs: [
      {
        q: "How often are category charts updated?",
        a: "Category charts are swept every 12 hours to detect climbs and drops as they happen.",
      },
      {
        q: "What is the Gap Finder?",
        a: "The Gap Finder analyzes thousands of reviews across the top apps in a category and groups user complaints into missing features, bugs, and pricing objections.",
      },
      {
        q: "Can I explore niches for both iOS and Android?",
        a: "Yes. Category trends and review niches are collected across both stores.",
      },
    ],
  },
  {
    slug: "push-campaigns",
    navTitle: "Push campaigns",
    metaTitle: "Cross-App Push Notification Composer for Firebase | IndexForge",
    metaDescription:
      "Send Firebase Cloud Messaging (FCM) push campaigns across your entire app portfolio from one clean composer without jumping between separate consoles.",
    keywords: [
      "multi-app push notification tool",
      "firebase push composer",
      "fcm campaign manager",
      "cross app push notifications",
      "portfolio notification sender",
    ],
    eyebrow: "Portfolio Push Composer",
    heroHeadline: {
      lead: "One push composer",
      accent: "for your whole portfolio.",
    },
    heroSubheadline:
      "Announce updates and re-engage users across multiple apps from a single interface. Encrypted service account credentials and transparent per-app delivery tracking.",
    summary:
      "Managing eleven apps means opening eleven separate Firebase consoles to send one release announcement. IndexForge centralizes FCM credentials and lets you broadcast to topics across your entire portfolio in one click.",
    mockupId: "push",
    metrics: [
      { label: "Console Jumping", value: "0", description: "One unified composer" },
      { label: "Credential Storage", value: "AES-256-GCM", description: "Encrypted at rest" },
      { label: "Delivery Tracking", value: "Per-App Status", description: "Sent, failed, or skipped" },
    ],
    capabilitiesHeading: "Enterprise push campaign management",
    capabilities: [
      {
        title: "Multi-App Broadcasting",
        description: "Select multiple apps in your organization and dispatch notifications simultaneously.",
        detail:
          "Compose the title, body, custom data payload, and topic once, then target all eligible apps in your portfolio.",
        badge: "Portfolio-Wide",
      },
      {
        title: "Transparent Delivery Reporting",
        description: "Distinct status per app: Sent, Partial, Failed, or Skipped.",
        detail:
          "If one app has an expired service account key, the campaign reports accurately as Partial with the exact failing app identified rather than a false 'Sent'.",
      },
      {
        title: "AES-256-GCM Encrypted Keys",
        description: "Firebase service account credentials encrypted at rest.",
        detail:
          "Keys are decrypted only inside the background worker during dispatch and never sent to browser clients.",
      },
      {
        title: "Payload Preview & Topic Target",
        description: "Preview notification appearance on iOS and Android before sending.",
        detail: "Target custom FCM topics or broadcast to default subscription channels.",
      },
    ],
    howItWorks: [
      {
        step: "01",
        title: "Upload Service Accounts",
        body: "Upload Firebase service account JSON files for each app. Keys are encrypted immediately.",
      },
      {
        step: "02",
        title: "Compose Notification",
        body: "Write title, body, deep links, and optional custom key-value data payloads.",
      },
      {
        step: "03",
        title: "Dispatch & Track",
        body: "Hit send to dispatch through the worker queue. Monitor live per-app delivery confirmations.",
      },
    ],
    whyLegacyFails: [
      {
        legacy: "Requires switching between dozens of Firebase console tabs.",
        indexForge: "One unified composer that broadcasts across your entire portfolio.",
      },
      {
        legacy: "Silent send failures that mark campaigns as 'Sent' even when tokens failed.",
        indexForge: "Explicit per-app status tracking (Sent, Partial, Failed, Skipped).",
      },
      {
        legacy: "Unencrypted service keys stored in plaintext config files.",
        indexForge: "Enterprise-grade AES-256-GCM encryption in your database.",
      },
    ],
    faqs: [
      {
        q: "Does this require a special SDK in my mobile app?",
        a: "No custom SDK required. It uses standard Firebase Cloud Messaging (FCM) topics that your apps already subscribe to.",
      },
      {
        q: "Can I schedule notifications for future delivery?",
        a: "Yes. Campaigns can be saved as drafts, queued for immediate delivery, or scheduled for a specific time.",
      },
      {
        q: "Where are my Firebase service account keys stored?",
        a: "They are encrypted with AES-256-GCM in your PostgreSQL database and decrypted only by the background dispatch worker.",
      },
    ],
  },
  {
    slug: "metrics-reconciliation",
    navTitle: "Metrics reconciliation",
    metaTitle: "App Store Analytics & Revenue Reconciliation | IndexForge",
    metaDescription:
      "Connect Firebase, AdMob, Google Ads, Play Console, App Store Connect and Apple Search Ads into one daily unified table with source precedence rules.",
    keywords: [
      "app store revenue reconciliation",
      "unified app analytics",
      "organic paid install split",
      "cross network ad spend",
      "admob firebase deduplication",
    ],
    eyebrow: "Unified Revenue & Attribution",
    heroHeadline: {
      lead: "Six consoles reconciled.",
      accent: "One daily truth.",
    },
    heroSubheadline:
      "Connect Firebase, AdMob, Google Ads, Play Console, App Store Connect and Apple Search Ads into one daily table. Source precedence guarantees no double-counted ad revenue.",
    summary:
      "When AdMob and Firebase both report ad revenue, naive summation doubles your numbers. IndexForge uses ranked source tiers where the system closest to the money wins, while additive spend networks are summed correctly.",
    mockupId: "precedence",
    metrics: [
      { label: "Integrations", value: "6 Connected", description: "Google & Apple ecosystems" },
      { label: "Precedence", value: "Ranked Tiers", description: "Zero double counting" },
      { label: "Organic Split", value: "Automated", description: "Isolated organic growth" },
    ],
    capabilitiesHeading: "The single source of truth for app business numbers",
    capabilities: [
      {
        title: "Ranked Source Tiers",
        description: "Precedence rules pick the authoritative provider per metric.",
        detail:
          "AdMob is authoritative for ad revenue; Firebase for session engagement; App Store Connect for iOS sales. Every number displays its origin so you can trace any metric back to its source.",
        badge: "Deduplicated",
      },
      {
        title: "Organic vs. Paid Install Split",
        description: "Isolates organic downloads by subtracting attributed ad installs from store totals.",
        detail:
          "Paid spend lifts total installs regardless of listing quality. IndexForge derives organic installs daily so you can measure what your ASO improvements actually accomplished.",
      },
      {
        title: "Additive Multi-Network Ad Spend",
        description: "Combines spend across Google Ads and Apple Search Ads without collisions.",
        detail:
          "Unlike revenue (which can be reported by two tools for one dollar), spend from different ad networks is genuinely additive. Blended CPI and ROAS are computed accurately.",
      },
      {
        title: "Raw Data Export & API",
        description: "Full CSV/JSON exports and read-only REST API access.",
        detail: "No vendor lock-in on your business metrics. Export clean daily tables anytime for custom data warehouse pipelines.",
      },
    ],
    howItWorks: [
      {
        step: "01",
        title: "Connect Providers via OAuth & API Keys",
        body: "Connect Google Console, Google Ads, AdMob, Firebase, App Store Connect, and Search Ads.",
      },
      {
        step: "02",
        title: "Daily Sync & Tier Evaluation",
        body: "Workers pull daily metrics, normalize dates across timezones, and apply precedence rules.",
      },
      {
        step: "03",
        title: "Unified Table Display",
        body: "Review one clean dashboard table with revenue, installs, spend, and organic attribution in sync.",
      },
    ],
    whyLegacyFails: [
      {
        legacy: "Sums AdMob and Firebase ad revenue, doubling reported earnings.",
        indexForge: "Applies ranked source precedence where the billing system wins.",
      },
      {
        legacy: "Reports total installs as organic growth, masking paid user acquisition.",
        indexForge: "Derives daily organic installs by subtracting attributed paid installs.",
      },
      {
        legacy: "Fails when timezone differences cause day-boundary shifts.",
        indexForge: "Normalizes all timestamps to standard daily intervals.",
      },
    ],
    faqs: [
      {
        q: "What happens if I only connect one or two integrations?",
        a: "IndexForge works seamlessly with any subset of connectors. Unconnected metrics show as 'no data' rather than zero, preserving chart clarity.",
      },
      {
        q: "How is the organic install split calculated?",
        a: "Inside windows where ad accounts are connected, organic installs are calculated as total store-reported units minus verified paid campaign installs.",
      },
      {
        q: "Can I connect multiple Google Ads or Search Ads accounts?",
        a: "Yes. Multiple accounts can be linked across the apps in your workspace.",
      },
    ],
  },
];

export function getFeatureBySlug(slug: string): FeaturePageData | undefined {
  return FEATURES.find((f) => f.slug === slug);
}

export function getAllFeatureSlugs(): string[] {
  return FEATURES.map((f) => f.slug);
}
