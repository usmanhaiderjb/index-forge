/**
 * Copy and structured content for the public site.
 *
 * Everything a non-developer would want to change lives here rather than being
 * inlined in JSX, so editing the pitch does not mean editing components.
 *
 * ## The placeholder rule
 *
 * Client logos, testimonials and case-study numbers are marked
 * `placeholder: true` until they are real. Anything so marked renders behind a
 * visible "Sample content" notice, and a test enforces it. A public page that
 * shows an invented company endorsing the product is a fabricated
 * endorsement — the flag is what stops sample copy from quietly becoming a
 * claim. Delete the flag only when the entry is genuinely true.
 */

export const SITE = {
  name: "IndexForge",
  tagline: "Engineer Your App Store Dominance.",
  /**
   * The alternates exist so campaign pages and store listings can vary the line
   * without inventing new ones. Keep the register the same: the product's claim
   * is that visibility is *built*, not observed.
   */
  taglineAlternates: [
    "Build. Rank. Scale.",
    "Precision ASO for High-Growth Apps.",
    "Turn App Store Algorithms into Pure Growth.",
  ],
  description:
    "Connect Firebase, AdMob, Google Ads, Play Console, App Store Connect and Apple Search Ads. Track keywords, ranks, competitors and reviews daily, and see which traffic source is actually converting. Then forge listing changes that fit the store's character limits.",
  /** Reachable contact details. Keep these honest — they are published. */
  contact: {
    email: "hello@indexforge.com",
    /** Null hides the row rather than printing a fake address. */
    phone: null as string | null,
    location: "Remote",
    placeholder: true,
  },
  social: [
    { label: "GitHub", href: "https://github.com", placeholder: true },
    { label: "X", href: "https://x.com", placeholder: true },
    { label: "LinkedIn", href: "https://linkedin.com", placeholder: true },
  ],
} as const;

export type NavLink = { label: string; href: string; description?: string };

/**
 * Top-level nav.
 *
 * An entry with `children` renders as a disclosure button and has no `href` of
 * its own — a dropdown parent that also navigates gives the same destination
 * two entries in the nav and makes keyboard activation ambiguous.
 */
export type NavItem =
  | (NavLink & { children?: undefined })
  | { label: string; href?: undefined; children: NavLink[] };

export const PRIMARY_NAV: NavItem[] = [
  {
    label: "Features",
    children: [
      { label: "Keyword research", href: "/features/keyword-research", description: "Corpus of 675k+ terms with demand and difficulty scoring" },
      { label: "Rank tracking", href: "/features/rank-tracking", description: "Daily rank scans per keyword and country with depth audit" },
      { label: "Competitor intelligence", href: "/features/competitor-intelligence", description: "Co-occurrence SERP tracking and keyword gap audit" },
      { label: "AI ASO writer", href: "/features/ai-aso-writer", description: "Metadata that strictly fits character limits" },
      { label: "Market trends", href: "/features/market-trends", description: "Category SERP analysis and review theme clustering" },
      { label: "Push campaigns", href: "/features/push-campaigns", description: "Multi-app Firebase FCM composer and delivery audit" },
      { label: "Metrics reconciliation", href: "/features/metrics-reconciliation", description: "6-provider revenue & organic install split engine" },
    ],
  },
  { label: "Pricing", href: "/#pricing" },
  {
    label: "Resources",
    children: [
      { label: "Showcase", href: "/showcase", description: "Worked examples, end to end" },
      { label: "About", href: "/about", description: "What this does, and what it does not" },
      { label: "Integrations", href: "/#integrations", description: "The six connected sources" },
    ],
  },
  // Blog and Contact stay top level rather than being repeated inside
  // Resources: one destination should appear in the nav once.
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export const HERO = {
  badge: "Precision ASO for high-growth apps",
  /*
   * The verb is the whole positioning. Most tools in this category sell
   * *tracking* — a dashboard that tells you what already happened. The claim
   * here is that store visibility is something you build, so the headline has
   * to read as a workshop instruction rather than a report.
   */
  headline: { lead: "Stop tracking rankings.", accent: "Start forging them." },
  body: "Every store number in one engine — Firebase, AdMob, Google Ads, Play Console, App Store Connect and Apple Search Ads. See which traffic source actually converts, then forge the keywords, listing and creative that move it.",
  primary: { label: "Start for free", href: "/signin" },
  secondary: { label: "See the benefits", href: "/benefits" },
  /** Only claims the deployment can actually honour. */
  assurances: ["No credit card required", "Connect one account to start", "Export your data anytime"],
} as const;

/**
 * Logo wall. Deliberately unbranded: putting real company marks here would
 * claim an endorsement that does not exist, and those marks are not ours to
 * publish. Replace with real customers once they have agreed to be named.
 */
export const LOGO_WALL = {
  /** Null omits the headline claim entirely rather than inventing a number. */
  customerCount: null as number | null,
  heading: "Built for teams shipping on both stores",
  placeholder: true,
};

export const FEATURE_CARDS = [
  {
    id: "app-intelligence",
    icon: "search",
    title: "360° App Market Intelligence",
    body: "Paste any iOS or Android app link to estimate monthly downloads, gross/net revenue, paid ad spend, and global market share.",
    href: "/features/competitor-intelligence",
  },
  {
    id: "keyword-research",
    icon: "target",
    title: "722,000+ Keyword Corpus",
    body: "Explore verified search demand popularity, algorithm difficulty scores, and opportunity metrics across 8 global storefronts.",
    href: "/features/keyword-research",
  },
  {
    id: "paid-ua-intelligence",
    icon: "trending",
    title: "Paid UA & Ad Spend Audits",
    body: "Detect active ad networks (Apple Search Ads, Google UAC, Meta, TikTok, AppLovin) and calculate paid vs organic install ratios.",
    href: "/features/market-trends",
  },
  {
    id: "cross-localization",
    icon: "chart",
    title: "Apple 9x Cross-Localization",
    body: "Exploit Apple secondary indexed locales to multiply your keyword character capacity up to 900 characters in the US alone.",
    href: "/features/ai-aso-writer",
  },
  {
    id: "metrics-reconciliation",
    icon: "activity",
    title: "Unified 6-Source Attribution",
    body: "Reconcile App Store Connect, Play Console, Google Ads, Apple Search Ads, AdMob and Firebase with zero double-counting.",
    href: "/features/metrics-reconciliation",
  },
  {
    id: "push-campaigns",
    icon: "send",
    title: "Multi-App Push Notifications",
    body: "One centralized Firebase Cloud Messaging (FCM) campaign composer across your entire portfolio of iOS and Android apps.",
    href: "/features/push-campaigns",
  },
] as const;

export const DASHBOARD_POINTS = [
  {
    icon: "activity",
    title: "Track performance",
    body: "One daily table across six providers, with the source recorded on every number.",
  },
  {
    icon: "target",
    title: "Spot opportunities",
    body: "Keyword and ranking gaps surfaced against the competitors you actually care about.",
  },
  {
    icon: "chart",
    title: "Measure growth",
    body: "Organic separated from paid, so you can see what the listing did on its own.",
  },
] as const;

export type PricingTier = {
  name: string;
  price: string;
  cadence: string;
  audience: string;
  features: string[];
  cta: { label: string; href: string };
  featured: boolean;
};

/**
 * Pricing is a commercial decision, not a code one. These figures are examples
 * until someone sets real ones — a price on a public page is something a
 * visitor will plan around, so it is flagged like any other invented content.
 */
export const PRICING = {
  placeholder: true,
  note: "Example tiers. Set real prices before launch.",
  includedEverywhere: ["Keyword research", "Rank tracking", "Competitor intelligence", "AI ASO writer"],
  tiers: [
    {
      name: "Free",
      price: "$0",
      cadence: "/mo",
      audience: "For hobby projects and a single app.",
      features: [
        "1 app",
        "10 tracked keywords",
        "1 connected integration",
        "30 days of history",
      ],
      cta: { label: "Get started", href: "/signin" },
      featured: false,
    },
    {
      name: "Pro",
      price: "$29",
      cadence: "/mo",
      audience: "For teams growing a small portfolio.",
      features: [
        "10 apps",
        "500 tracked keywords",
        "All six integrations",
        "AI metadata and review replies",
        "Alerts, digests and CSV export",
      ],
      cta: { label: "Start free trial", href: "/signin" },
      featured: true,
    },
    {
      name: "Growth",
      price: "$79",
      cadence: "/mo",
      audience: "For agencies and larger portfolios.",
      features: [
        "Unlimited apps",
        "2,000 tracked keywords",
        "Read-only REST API access",
        "Webhook alert delivery",
        "Full history and audit log",
      ],
      cta: { label: "Start free trial", href: "/signin" },
      featured: false,
    },
  ] satisfies PricingTier[],
};

export const FOOTER_NAV: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Benefits", href: "/benefits" },
      { label: "Showcase", href: "/showcase" },
      { label: "Integrations", href: "/#integrations" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "RSS feed", href: "/blog/rss.xml" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

/**
 * What the product does for the person using it, phrased as the problem it
 * removes. Each one maps to something the app actually ships — an unbacked
 * claim here is a lie with a marketing budget.
 */
export const BENEFITS = [
  {
    id: "one-table",
    title: "Stop reconciling six dashboards",
    body: "Installs, revenue, retention, spend and ratings land in one daily table keyed by app and date. Revenue per install becomes a join instead of a morning spent in a spreadsheet.",
    detail:
      "Every provider writes to the same MetricPoint table with its source recorded, so the raw per-provider figures stay inspectable while the dashboard shows one number.",
  },
  {
    id: "no-double-count",
    title: "Numbers that do not double-count",
    body: "AdMob and Firebase both report ad revenue. Summing them would report roughly double. Aggregation picks the authoritative source per metric and tells you which one it used.",
    detail:
      "Ranked source tiers: the closest system to the money wins. Spend across Google Ads and Apple Search Ads is added instead, because that is different money, not the same money twice.",
  },
  {
    id: "organic-split",
    title: "Know which installs you earned",
    body: "Paid spend lifts total installs whether or not the listing improved. Organic installs are derived daily so the number ASO is actually judged on is visible on its own.",
    detail:
      "Derived only inside the window where paid data exists. With no ad account connected the split is withheld rather than claiming every install was organic.",
  },
  {
    id: "keywords",
    title: "Rank tracking with the competition in frame",
    body: "Daily rank per keyword and country, with difficulty and opportunity scoring — and where each tracked competitor placed on the same result page.",
    detail:
      "Scan depth is stored with every rank, so \"not in the top 100\" never gets confused with \"not in the top 10\" after a settings change.",
  },
  {
    id: "push",
    title: "One push composer for the whole portfolio",
    /*
     * Every sentence here has to survive contact with the FCM API. "Every app
     * at once" is true; "every user" would not be, and the caveat is stated
     * rather than left for the first send to reveal.
     */
    body: "Announce a release to eleven apps without opening eleven Firebase consoles. Add each project's service account once, compose once, pick the apps, send.",
    detail:
      "Sends to an FCM topic, which reaches the devices your app subscribed — Firebase's own \"all users\" audience is not available to any tool outside its console. Each app gets its own delivery record, so a campaign where one key expired reports as partial rather than as sent.",
  },
  {
    id: "reviews",
    title: "Reviews as themes, not as a number",
    body: "Reviews sync from both stores and are classified, so a spike in one-star ratings arrives as \"onboarding crash\" rather than as an average that dropped 0.2.",
    detail: "Replies are published back to the store, validated against each store's own length limit.",
  },
  {
    id: "ai",
    title: "AI that respects the character limits",
    body: "Metadata variants generated per field and rejected outright if they exceed the store's limit. Keyword strategy and anomaly explanations grounded in your own data, not in generic advice.",
    detail:
      "Every suggestion carries the field it targets and its length, so nothing reaches the store that the store would truncate.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect your accounts",
    body: "OAuth for Google properties, API keys for Apple. Credentials are encrypted with AES-256-GCM before they are written and are never returned to the browser.",
  },
  {
    step: "02",
    title: "Link accounts to apps",
    body: "Resources auto-match on store id or bundle id where the provider exposes one, so most links need no manual picking.",
  },
  {
    step: "03",
    title: "Let the daily jobs run",
    body: "Metrics, ranks, chart positions, listings, reviews and competitors refresh on a schedule spread across the hour, so a hundred workspaces do not hit the store in the same second.",
  },
  {
    step: "04",
    title: "Act on what changed",
    body: "Alerts on thresholds and percentage moves, scheduled digests, AI listing suggestions, and a full export whenever you want the raw rows.",
  },
] as const;

export const INTEGRATIONS = [
  { name: "Firebase / GA4", provides: "Active users, sessions, retention, crash-free rate" },
  { name: "AdMob", provides: "Ad revenue, eCPM, fill rate, ad impressions" },
  { name: "Google Ads", provides: "Spend, paid installs, CPI, CPC, ROAS" },
  { name: "Play Console", provides: "Installs, uninstalls, store conversion, reviews" },
  { name: "App Store Connect", provides: "Units, proceeds, reviews, ratings" },
  { name: "Apple Search Ads", provides: "Spend, paid installs, CPI, CPC" },
] as const;

/**
 * Case studies. Every figure here is invented until `placeholder` is removed,
 * and the UI says so on the page.
 */
export type Showcase = {
  slug: string;
  company: string;
  industry: string;
  summary: string;
  challenge: string;
  approach: string[];
  results: { label: string; value: string; note: string }[];
  quote: { body: string; author: string; role: string } | null;
  placeholder: boolean;
};

export const SHOWCASES: Showcase[] = [
  {
    slug: "habit-tracker-organic-growth",
    company: "Sample Habit App",
    industry: "Health & Fitness · iOS",
    summary:
      "Separating organic from paid installs revealed that a campaign was masking a flat listing, and gave the team something to actually optimise.",
    challenge:
      "Total installs were climbing month over month while revenue was flat. Nobody could say whether the listing was working, because paid and organic were reported as one number.",
    approach: [
      "Connected App Store Connect and Apple Search Ads to the same app.",
      "Derived organic installs daily as total minus attributed paid installs.",
      "Tracked the organic share as its own series rather than reading total installs.",
      "Ran metadata variants against the subtitle and keyword fields.",
    ],
    results: [
      { label: "Organic share", value: "—", note: "Fill in once measured" },
      { label: "Keyword coverage", value: "—", note: "Fill in once measured" },
      { label: "Conversion rate", value: "—", note: "Fill in once measured" },
    ],
    quote: null,
    placeholder: true,
  },
  {
    slug: "budget-app-review-themes",
    company: "Sample Budget App",
    industry: "Finance · Android",
    summary:
      "Classifying reviews into themes turned a slipping star rating into a specific, fixable bug report.",
    challenge:
      "The average rating fell and the team could see the number move but not the reason, because reviews arrived as an undifferentiated stream.",
    approach: [
      "Synced Play Console reviews and classified them by theme and sentiment.",
      "Set an alert on the rating average with a percentage-change rule.",
      "Replied from the same view, inside the store's reply length limit.",
    ],
    results: [
      { label: "Time to identify cause", value: "—", note: "Fill in once measured" },
      { label: "Reply coverage", value: "—", note: "Fill in once measured" },
      { label: "Rating recovery", value: "—", note: "Fill in once measured" },
    ],
    quote: null,
    placeholder: true,
  },
  {
    slug: "cross-network-spend",
    company: "Sample Games Studio",
    industry: "Games · iOS and Android",
    summary:
      "Running two ad networks meant total spend was being understated by whichever one lost the tie-break. Additive source tiers fixed the total.",
    challenge:
      "Spend reported in the dashboard did not match the invoices, and the gap moved every month.",
    approach: [
      "Connected Google Ads and Apple Search Ads against the same apps.",
      "Confirmed spend adds across networks while ad revenue still resolves to one source.",
      "Reconciled CPI as a per-network average rather than a summed figure.",
    ],
    results: [
      { label: "Spend accuracy", value: "—", note: "Fill in once measured" },
      { label: "Networks reconciled", value: "—", note: "Fill in once measured" },
      { label: "Reporting time saved", value: "—", note: "Fill in once measured" },
    ],
    quote: null,
    placeholder: true,
  },
];

export type Testimonial = {
  body: string;
  author: string;
  role: string;
  placeholder: boolean;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    body: "Replace this with something a real user said. Until then it is sample text and the page says so.",
    author: "Name",
    role: "Role, Company",
    placeholder: true,
  },
  {
    body: "A second slot, kept so the layout can be judged at the width it will actually run at.",
    author: "Name",
    role: "Role, Company",
    placeholder: true,
  },
  {
    body: "A third slot. Delete any you do not need — the grid handles one, two or three.",
    author: "Name",
    role: "Role, Company",
    placeholder: true,
  },
];

export type Client = {
  name: string;
  /** Picks the geometric wordmark glyph. See `ClientMark`. */
  mark: "orbit" | "prism" | "wave" | "grid" | "spark" | "arc";
  placeholder: boolean;
};

/**
 * Logo wall.
 *
 * These studios are invented. Real company marks are deliberately absent: they
 * are not ours to publish, and showing one implies an endorsement that does not
 * exist. Names here are checked against a list of well-known brands by a test,
 * so a real logo cannot be dropped in without the check failing.
 */
export const CLIENTS: Client[] = [
  { name: "Northpeak", mark: "orbit", placeholder: true },
  { name: "Pixelmint", mark: "prism", placeholder: true },
  { name: "Lumora", mark: "wave", placeholder: true },
  { name: "Kitewave", mark: "grid", placeholder: true },
  { name: "Cloudberry", mark: "spark", placeholder: true },
  { name: "Tidalforge", mark: "arc", placeholder: true },
];

export const FAQ = [
  {
    q: "Do I need every integration connected?",
    a: "No. Each connector is independent and the app reports what it has. Metrics with no connected source show as having no data rather than as zero, so an empty chart is never mistaken for a bad day.",
  },
  {
    q: "Where are my credentials stored?",
    a: "Encrypted with AES-256-GCM in your own database, decrypted only in the worker process that calls the provider, and never returned to the browser. Revoking a connection deletes the stored credential.",
  },
  {
    q: "How often does data refresh?",
    a: "Connections sync every six hours, listings twice a day, ranks and chart positions once a day in the early UTC window so figures stay comparable day to day. You can also trigger a refresh manually at any time.",
  },
  {
    q: "Why does my dashboard number differ from the store console?",
    a: "Usually the reporting window or the timezone. Stores restate the last few days, so recent figures move. Every metric records which provider it came from, so you can trace any number back to its source.",
  },
  {
    q: "Can I get the raw data out?",
    a: "Yes. CSV and JSON export from the UI, and a read-only REST API authenticated by API key. There is no lock-in on your own numbers.",
  },
  {
    q: "Does the AI write directly to my store listing?",
    a: "No. It generates variants per field, validated against that field's character limit, and you publish them yourself. Review replies are the one thing published on your behalf, and only when you press send.",
  },
] as const;

export const ABOUT = {
  heading: "Built because the numbers were in six places",
  body: [
    "App Store Optimization runs on data that lives in six different consoles, each with its own definition of an install, its own reporting delay, and its own idea of what a day is. Most teams reconcile that by hand, in a spreadsheet, every Monday.",
    "This is the tool that reconciliation turns into. One daily table, one source of truth per metric, and an explicit answer when two providers disagree — instead of a number that quietly adds them together.",
    "The parts that could silently produce a wrong figure are the parts that carry the most tests: source precedence, the organic and paid split, date handling across timezones, and every store's character limits.",
  ],
  principles: [
    {
      title: "A wrong number is worse than no number",
      body: "Metrics with no source report as having no data, never as zero. Derived figures are withheld when their inputs are missing rather than estimated.",
    },
    {
      title: "Every figure is traceable",
      body: "Each metric records the provider it came from, and the UI will name it. Raw per-source rows survive aggregation so nothing is unrecoverable.",
    },
    {
      title: "Your data stays yours",
      body: "Full export, a read-only API, and credentials you can revoke. Nothing here depends on you being unable to leave.",
    },
  ],
} as const;

/** True when any published section is still running on sample content. */
export const HAS_PLACEHOLDER_CONTENT =
  CLIENTS.some((c) => c.placeholder) ||
  TESTIMONIALS.some((t) => t.placeholder) ||
  SHOWCASES.some((s) => s.placeholder) ||
  PRICING.placeholder ||
  LOGO_WALL.placeholder;
