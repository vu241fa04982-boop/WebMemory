/**
 * WebMemory - Core Application Engine
 * Vanilla JavaScript implementation for visual memory testing,
 * dynamic website generation, scoring algorithms, and progress tracking.
 */

// ==================================================
// 1. STATE & STORAGE MANAGEMENT
// ==================================================
const STORAGE_KEYS = {
  THEME: 'webMemoryTheme',
  DIFFICULTY: 'webMemoryDifficulty',
  SOUND: 'webMemorySound',
  TESTS: 'webMemoryTests',
  BEST_SCORE: 'webMemoryBestScore',
  AVG_SCORE: 'webMemoryAverageScore',
  RECENT_TESTS: 'webMemoryRecentTests'
};

const DIFFICULTY_CONFIG = {
  low: { name: 'LOW', time: 20, desc: 'Longer viewing time. Generous 20s exposure for learning layout structures, navigation details, and prominent content zones.' },
  medium: { name: 'MEDIUM', time: 12, desc: 'Medium viewing time. Standard balanced 12s challenge testing selective attention, color accents, and layout memory.' },
  high: { name: 'HIGH', time: 7, desc: 'Shorter viewing time. Rapid 7s flash challenge demanding high-speed perceptual encoding and instant spatial recognition.' }
};

function getDifficultyConfig(diff) {
  const norm = (diff || 'medium').toLowerCase();
  if (norm === 'low' || norm === 'easy') return DIFFICULTY_CONFIG.low;
  if (norm === 'high' || norm === 'hard') return DIFFICULTY_CONFIG.high;
  return DIFFICULTY_CONFIG.medium;
}

// Requirement 6: Test State Management
const TEST_STATES = {
  DIFFICULTY_SELECTION: 'DIFFICULTY_SELECTION',
  WEBSITE_PREVIEW: 'WEBSITE_PREVIEW',
  COUNTDOWN_ACTIVE: 'COUNTDOWN_ACTIVE',
  WEBSITE_HIDDEN: 'WEBSITE_HIDDEN',
  READY_FOR_QUESTIONS: 'READY_FOR_QUESTIONS',
  QUESTIONS: 'QUESTIONS',
  RESULTS: 'RESULTS'
};

let appState = {
  currentView: 'home',
  testStage: TEST_STATES.DIFFICULTY_SELECTION,

  // Explicit test state variables (Requirement 6)
  selectedDifficulty: (localStorage.getItem(STORAGE_KEYS.DIFFICULTY) || 'medium').toLowerCase(),
  selectedTheme: null,
  currentWebsite: null,
  countdown: 12,
  testStarted: false,
  exposureCompleted: false,
  websiteHidden: false,
  readyForQuestions: false,
  questions: [],
  userAnswers: {},
  correctAnswers: {},
  score: 0,

  theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'dark',
  difficulty: (localStorage.getItem(STORAGE_KEYS.DIFFICULTY) || 'medium').toLowerCase(),
  soundEnabled: localStorage.getItem(STORAGE_KEYS.SOUND) !== 'false',
  tests: JSON.parse(localStorage.getItem(STORAGE_KEYS.TESTS) || '[]'),
  currentWebsiteData: null,
  currentQuestions: [],
  countdownInterval: null,
  countdownRemaining: 12,
  activePracticeTheme: null,
  
  // Interactive mode states
  sequenceGame: {
    sequence: [],
    playerIndex: 0,
    level: 1,
    isPlaying: false
  },
  differenceGame: {
    siteA: null,
    siteB: null,
    changedItemKey: null
  }
};

// ==================================================
// 2. AUDIO SYNTHESIZER (Synthesized Web Audio API)
// ==================================================
class SoundController {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.08) {
    if (!appState.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio fallback silent
    }
  }

  click() {
    this.playTone(800, 'sine', 0.05, 0.05);
  }

  tick() {
    this.playTone(1200, 'triangle', 0.04, 0.04);
  }

  correct() {
    this.playTone(523.25, 'sine', 0.12, 0.08); // C5
    setTimeout(() => this.playTone(659.25, 'sine', 0.15, 0.08), 80); // E5
    setTimeout(() => this.playTone(783.99, 'sine', 0.2, 0.08), 160); // G5
  }

  wrong() {
    this.playTone(300, 'sawtooth', 0.12, 0.06);
    setTimeout(() => this.playTone(240, 'sawtooth', 0.18, 0.06), 90);
  }

  complete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 'sine', 0.25, 0.1), idx * 100);
    });
  }
}

const sounds = new SoundController();

// ==================================================
// 3. AMBIENT PARTICLES CANVAS
// ==================================================
function initAmbientCanvas() {
  const canvas = document.getElementById('ambient-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width, height;
  let particles = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  const particleCount = Math.min(38, Math.floor(window.innerWidth / 35));
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 2 + 1,
      color: Math.random() > 0.4 ? 'rgba(0, 229, 255, ' : 'rgba(124, 58, 237, ',
      alpha: Math.random() * 0.4 + 0.15
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    const radGrad = ctx.createRadialGradient(
      width * 0.2, height * 0.2, 50,
      width * 0.5, height * 0.5, width * 0.8
    );
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (!isLight) {
      radGrad.addColorStop(0, 'rgba(0, 229, 255, 0.035)');
      radGrad.addColorStop(0.5, 'rgba(124, 58, 237, 0.025)');
      radGrad.addColorStop(1, 'rgba(7, 17, 31, 0)');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, width, height);
    }

    for (let i = 0; i < particles.length; i++) {
      const p1 = particles[i];
      p1.x += p1.vx;
      p1.y += p1.vy;

      if (p1.x < 0) p1.x = width;
      if (p1.x > width) p1.x = 0;
      if (p1.y < 0) p1.y = height;
      if (p1.y > height) p1.y = 0;

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          const lineAlpha = (1 - dist / 120) * 0.12;
          ctx.strokeStyle = `rgba(0, 229, 255, ${lineAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = p1.color + p1.alpha + ')';
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
}

// ==================================================
// 4. DYNAMIC FAKE WEBSITE GENERATION ENGINE
// ==================================================
const WEBSITE_THEMES = {
  ecommerce: {
    name: 'E-commerce',
    brands: ['ApexGear', 'LuminaStore', 'AuraSound', 'ZenithShop', 'HyperCraft'],
    taglines: [
      'Engineered for Peak Performance',
      'Next-Generation Smart Hardware',
      'Minimalist Precision Goods',
      'Everyday Gear Reimagined'
    ],
    headings: [
      'Precision Audio Without Limits',
      'Elevate Your Everyday Essentials',
      'High Performance Designed for Modern Living',
      'Next-Gen Gadgets Crafted for Creators'
    ],
    buttonTexts: ['Shop Now', 'Explore Gear', 'Order Online', 'View Products', 'Buy Instant'],
    cardsPool: [
      { title: 'Free Express Shipping', desc: 'Overnight priority delivery worldwide with carbon offset tracking.' },
      { title: 'Carbon Neutral Build', desc: 'Sustainably sourced alloy components and 100% recyclable packaging.' },
      { title: '2-Year Direct Warranty', desc: 'Comprehensive damage replacement with instant verified claims.' },
      { title: '24/7 Priority Support', desc: 'Direct chat with hardware engineering specialists around the clock.' },
      { title: '30-Day Risk-Free Trial', desc: 'Experience true comfort or return with full zero-fee refund.' }
    ]
  },
  travel: {
    name: 'Travel',
    brands: ['WanderLust', 'NordicVoyage', 'AeroEscape', 'HorizonTrek', 'TerraVenture'],
    taglines: [
      'Uncharted Journeys for Modern Nomads',
      'Bespoke Wilderness Expeditions',
      'Discover Untouched Natural Frontiers',
      'Curated Global Getaways'
    ],
    headings: [
      'Explore Untamed Arctic Glaciers',
      'Discover The Secrets of Nordic Fjords',
      'Bespoke Expeditions Across Five Continents',
      'Journey Far Beyond Conventional Horizons'
    ],
    buttonTexts: ['Book Journey Now', 'Find Destinations', 'Plan Itinerary', 'Start Exploring', 'Reserve Dates'],
    cardsPool: [
      { title: 'Vetted Local Guides', desc: 'Bilingual mountaineers and historians native to every region.' },
      { title: 'Off-Grid Eco Lodges', desc: '100% solar powered retreats immersed in serene untouched nature.' },
      { title: 'Flexible Cancellation', desc: 'No-penalty reschedule up to 72 hours before expedition departure.' },
      { title: 'Curated Itineraries', desc: 'Tailored pacing balancing photography, hiking, and cuisine.' },
      { title: 'Gear Provided On-Site', desc: 'Professional alpine jackets, boots, and satellite locators ready.' }
    ]
  },
  portfolio: {
    name: 'Portfolio',
    brands: ['StudioKroma', 'Elena Vance', 'VoxelWorks', 'NovaDesign', 'Kinetics Lab'],
    taglines: [
      'Transforming Ideas into Spatial Realities',
      'Award-Winning Digital Product Architecture',
      'Sculpting Brand Systems with Precision',
      'Interactive Design for Ambitious Teams'
    ],
    headings: [
      'Crafting Digital Products That Resonate',
      'Designing Cohesive Brand Architecture',
      'Spatial Interfaces Built for The Future',
      'Merging Aesthetics With High Velocity Code'
    ],
    buttonTexts: ['View Case Studies', 'Explore Portfolio', 'Start a Project', 'See Selected Works', 'Hire The Studio'],
    cardsPool: [
      { title: 'UI/UX Architecture', desc: 'Design systems, high-fidelity prototypes, and component design tokens.' },
      { title: 'Interactive 3D WebGL', desc: 'Immersive spatial experiences optimized for 60fps browser rendering.' },
      { title: 'Brand Identity Systems', desc: 'Comprehensive typographic scales, iconography, and color theory.' },
      { title: 'Design Engineering', desc: 'Pixel-perfect production code crafted in modern accessible web stacks.' },
      { title: 'User Research & Testing', desc: 'Evidence-based usability studies and quantitative task analysis.' }
    ]
  },
  food: {
    name: 'Food & Culinary',
    brands: ['ArtisanBite', 'SavorBotanica', 'UmamiCraft', 'MaisonNosh', 'EmberTable'],
    taglines: [
      'Organic Farm-to-Table Gastronomy',
      'Artisanal Hearth Cuisine & Botanical Pairings',
      'Fresh Ingredients Sourced Daily',
      'Culinary Craftsmanship with Soul'
    ],
    headings: [
      'Taste The Purity of Seasonal Harvest',
      'Modern Gastronomy Meets Wood-Fired Hearth',
      'Sustainable Dining Rooted in Heritage',
      'Crafted Flavors from Certified Local Farms'
    ],
    buttonTexts: ['Reserve a Table', 'View Tasting Menu', 'Order Chef Tasting', 'Book Dining Room', 'Order Takeout'],
    cardsPool: [
      { title: '100% Organic Produce', desc: 'Harvested from certified regenerative farms within 40 miles.' },
      { title: 'Natural Wood-Fired Hearth', desc: 'Smoked using vintage white oak and wild fruitwood embers.' },
      { title: 'Sommelier Wine Pairings', desc: 'Rare biodynamic vintages curated by our Master Sommelier.' },
      { title: 'Seasonal Tasting Rotation', desc: 'Chef changes 8-course tasting selections with every new moon.' },
      { title: 'Private Dining Suites', desc: 'Intimate acoustic-isolated dining rooms with dedicated servers.' }
    ]
  },
  dashboard: {
    name: 'SaaS Dashboard',
    brands: ['DataPulse', 'CloudMetric', 'OmniBoard', 'VectraOps', 'TelemetryIQ'],
    taglines: [
      'Unified Infrastructure Intelligence',
      'Sub-Second Observability for Modern Stacks',
      'AI-Powered Anomaly Detection in Realtime',
      'Distributed Cloud Telemetry Streamlined'
    ],
    headings: [
      'Realtime Cloud Telemetry at Enterprise Scale',
      'Zero-Latency Observability Across Every Cluster',
      'Automated Root Cause Diagnostics in Seconds',
      'Unified Metrics, Traces, and Logs in One Place'
    ],
    buttonTexts: ['Launch Live Demo', 'Start Free Trial', 'Deploy Agent Now', 'Request Enterprise Access', 'Explore Console'],
    cardsPool: [
      { title: 'Sub-Second Latency', desc: 'Stream over 10M events per second with instant live chart updates.' },
      { title: 'AI Anomaly Detection', desc: 'Continuous machine learning models catch regression spikes early.' },
      { title: '99.999% SLA Uptime', desc: 'Multi-region failover ensures zero monitoring blindspots.' },
      { title: 'Single-Line SDK Deploy', desc: 'Drop-in binary compatible with Docker, Kubernetes, and serverless.' },
      { title: 'RBAC Security Governance', desc: 'Granular SSO, audit trails, and SOC2 Type II verified protection.' }
    ]
  },
  education: {
    name: 'Education',
    brands: ['EduSphere', 'MindAcademy', 'CognitaLab', 'SynapseLearn', 'AegisScholar'],
    taglines: [
      'Accelerate Your Mastery with Guided Learning',
      'Interactive STEM Simulations and Labs',
      'World-Class Mentorship for Future Engineers',
      'Hands-On Curriculum Built for Industry'
    ],
    headings: [
      'Master Advanced Systems Engineering Today',
      'Interactive Visual Science & Algorithms',
      'Project-Based Curriculums Taught by Experts',
      'Build Real Systems from First Principles'
    ],
    buttonTexts: ['Enroll in Course', 'Explore Curriculum', 'Start Learning Free', 'View Syllabus', 'Join Next Cohort'],
    cardsPool: [
      { title: 'Interactive Browser Labs', desc: 'Run compilers, simulations, and debuggers directly in your browser.' },
      { title: '1-on-1 Senior Mentorship', desc: 'Weekly code reviews and portfolio feedback from staff engineers.' },
      { title: 'Accredited Certificates', desc: 'Industry-recognized micro-credentials verified on public ledger.' },
      { title: 'Lifetime Alumni Network', desc: 'Private job boards, hackathons, and technical interview workshops.' },
      { title: 'Self-Paced Flexible Paths', desc: 'Bite-sized modules designed around busy professional schedules.' }
    ]
  }
};

const COLOR_PALETTES = [
  { name: 'Electric Cyan', hex: '#00E5FF', textHex: '#07111F' },
  { name: 'Neon Purple', hex: '#7C3AED', textHex: '#FFFFFF' },
  { name: 'Emerald Green', hex: '#22C55E', textHex: '#07111F' },
  { name: 'Amber Gold', hex: '#F59E0B', textHex: '#07111F' },
  { name: 'Coral Red', hex: '#EF4444', textHex: '#FFFFFF' }
];

const CARD_SHAPES = [
  { name: 'Rounded (12px)', class: 'shape-rounded' },
  { name: 'Smooth (20px)', class: 'shape-smooth' },
  { name: 'Pill (28px)', class: 'shape-pill' }
];

const NAV_ALIGNMENTS = ['Left-aligned', 'Centered', 'Right-aligned'];

const BADGE_VARIANTS = [
  'NEW RELEASE', 'PRO PLATFORM', 'VERIFIED 2026', 'MOST POPULAR',
  'COMMUNITY CHOICE', 'FEATURED 2026', 'LIMITED EDITION', 'ENTERPRISE READY'
];

const BUTTON_LABELS = [
  'Explore Platform', 'Get Started', 'Start Free Trial', 'Shop Now',
  'Explore Gear', 'Order Online', 'View Products', 'Buy Instant',
  'Plan Journey', 'Explore Destinations', 'Book Expedition', 'View Itineraries',
  'Launch App', 'Open Workspace', 'Try Sandbox', 'View Docs',
  'Book Table', 'View Full Menu', 'Reserve Experience', 'Order Pickup',
  'Schedule Workout', 'Start Training', 'View Programs', 'Join Club',
  'Start Learning', 'Explore Courses', 'Enroll Free', 'View Syllabus'
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomItems(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateWebsite(themeKeyOverride = null) {
  const themeKey = themeKeyOverride || getRandomItem(Object.keys(WEBSITE_THEMES));
  const themeData = WEBSITE_THEMES[themeKey];
  
  const brandName = getRandomItem(themeData.brands);
  const tagline = getRandomItem(themeData.taglines);
  const heading = getRandomItem(themeData.headings);
  const buttonText = getRandomItem(themeData.buttonTexts);
  const primaryColor = getRandomItem(COLOR_PALETTES);
  const cardShape = getRandomItem(CARD_SHAPES);
  const navAlign = getRandomItem(NAV_ALIGNMENTS);
  const layoutType = Math.random() > 0.35 ? 'split-hero' : 'centered-hero';
  
  const cardCount = getRandomItem([3, 4, 5]);
  const featureCards = getRandomItems(themeData.cardsPool, cardCount);
  
  const allNavLinks = ['Home', 'Features', 'Pricing', 'Docs', 'About', 'Solutions', 'Showcase'];
  const navLinksCount = getRandomItem([3, 4, 5]);
  const navLinks = getRandomItems(allNavLinks, navLinksCount);
  if (!navLinks.includes('Home')) navLinks.unshift('Home');

  const badgeText = getRandomItem(['NEW RELEASE', 'PRO PLATFORM', 'VERIFIED 2026', 'MOST POPULAR', 'COMMUNITY CHOICE']);

  return {
    themeKey,
    themeName: themeData.name,
    brandName,
    tagline,
    heading,
    buttonText,
    buttonColor: primaryColor.name,
    buttonColorHex: primaryColor.hex,
    buttonTextColor: primaryColor.textHex,
    cardShapeName: cardShape.name,
    cardShapeClass: cardShape.class,
    navAlignment: navAlign,
    navLinks,
    badgeText,
    cardCount,
    featureCards,
    layoutType,
    imagePosition: layoutType === 'split-hero' ? 'Right side' : 'Centered below heading'
  };
}

function generateThemeIllustration(themeKey, primaryHex) {
  if (themeKey === 'ecommerce') {
    return `
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        <rect x="40" y="30" width="140" height="120" rx="16" fill="rgba(255,255,255,0.03)" stroke="${primaryHex}" stroke-width="2"/>
        <circle cx="110" cy="75" r="32" fill="${primaryHex}" fill-opacity="0.15" stroke="${primaryHex}" stroke-width="2"/>
        <path d="M100 70 L110 82 L125 66" stroke="${primaryHex}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="65" y="120" width="90" height="10" rx="5" fill="${primaryHex}" fill-opacity="0.3"/>
        <circle cx="55" cy="45" r="4" fill="${primaryHex}"/>
        <circle cx="70" cy="45" r="4" fill="#A78BFA"/>
      </svg>
    `;
  } else if (themeKey === 'travel') {
    return `
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        <circle cx="110" cy="90" r="65" fill="rgba(255,255,255,0.02)" stroke="${primaryHex}" stroke-width="1.5" stroke-dasharray="4 4"/>
        <path d="M60 135 L95 85 L120 115 L145 75 L175 135 Z" fill="${primaryHex}" fill-opacity="0.2" stroke="${primaryHex}" stroke-width="2"/>
        <circle cx="155" cy="55" r="14" fill="#F59E0B" fill-opacity="0.7"/>
        <path d="M85 70 Q110 50 135 68" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  } else if (themeKey === 'portfolio') {
    return `
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        <rect x="35" y="25" width="90" height="80" rx="12" fill="${primaryHex}" fill-opacity="0.2" stroke="${primaryHex}" stroke-width="2"/>
        <rect x="95" y="70" width="90" height="80" rx="12" fill="rgba(124,58,237,0.25)" stroke="#A78BFA" stroke-width="2"/>
        <line x1="50" y1="50" x2="105" y2="50" stroke="${primaryHex}" stroke-width="3" stroke-linecap="round"/>
        <line x1="110" y1="95" x2="165" y2="95" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `;
  } else if (themeKey === 'food') {
    return `
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        <circle cx="110" cy="90" r="60" fill="rgba(255,255,255,0.04)" stroke="${primaryHex}" stroke-width="2"/>
        <circle cx="110" cy="90" r="44" stroke="${primaryHex}" stroke-width="1.5" stroke-dasharray="3 3"/>
        <path d="M90 90 Q110 65 130 90 Q110 115 90 90 Z" fill="${primaryHex}" fill-opacity="0.3" stroke="${primaryHex}" stroke-width="2"/>
        <circle cx="110" cy="90" r="8" fill="#F59E0B"/>
      </svg>
    `;
  } else if (themeKey === 'dashboard') {
    return `
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        <rect x="30" y="30" width="160" height="120" rx="10" fill="rgba(0,0,0,0.3)" stroke="${primaryHex}" stroke-width="1.5"/>
        <path d="M45 120 L75 95 L105 105 L135 70 L165 85" stroke="${primaryHex}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="135" cy="70" r="5" fill="#FFFFFF"/>
        <rect x="45" y="45" width="40" height="8" rx="4" fill="${primaryHex}" fill-opacity="0.5"/>
        <rect x="140" y="45" width="30" height="8" rx="4" fill="#A78BFA" fill-opacity="0.5"/>
      </svg>
    `;
  } else {
    // Education
    return `
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        <path d="M110 40 L175 75 L110 110 L45 75 Z" fill="${primaryHex}" fill-opacity="0.25" stroke="${primaryHex}" stroke-width="2"/>
        <path d="M70 90 V125 C70 140 150 140 150 125 V90" stroke="${primaryHex}" stroke-width="2" fill="none"/>
        <circle cx="110" cy="110" r="6" fill="#FFFFFF"/>
      </svg>
    `;
  }
}

function renderWebsiteHTML(site, isReconstruction = false, userChoices = null) {
  let buttonColor = site.buttonColorHex;
  let buttonTextColor = site.buttonTextColor;
  let buttonText = site.buttonText;
  let heading = site.heading;
  let cardCount = site.cardCount;
  let cardShapeClass = site.cardShapeClass;
  let navAlign = site.navAlignment;

  if (isReconstruction && userChoices) {
    if (userChoices.buttonColor) {
      const match = COLOR_PALETTES.find(c => c.name === userChoices.buttonColor);
      if (match) {
        buttonColor = match.hex;
        buttonTextColor = match.textHex;
      }
    }
    if (userChoices.buttonText) buttonText = userChoices.buttonText;
    if (userChoices.heading) heading = userChoices.heading;
    if (userChoices.cardCount) cardCount = parseInt(userChoices.cardCount, 10) || cardCount;
    if (userChoices.cardShape) {
      const match = CARD_SHAPES.find(s => s.name === userChoices.cardShape);
      if (match) cardShapeClass = match.class;
    }
    if (userChoices.navAlignment) navAlign = userChoices.navAlignment;
  }

  let navJustify = 'space-between';
  if (navAlign === 'Centered') navJustify = 'center';
  else if (navAlign === 'Left-aligned') navJustify = 'flex-start';

  const cardsToRender = site.featureCards.slice(0, cardCount);

  return `
    <div class="fweb-navbar" style="justify-content: ${navJustify}; gap: 2rem;" data-ref="navbar">
      <div class="fweb-logo" data-ref="logo">
        <div class="fweb-logo-icon" style="background: ${buttonColor};">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        </div>
        <span>${site.brandName}</span>
      </div>
      <ul class="fweb-nav-links" data-ref="navlinks">
        ${site.navLinks.map(l => `<li class="fweb-nav-link">${l}</li>`).join('')}
      </ul>
      <div class="fweb-nav-actions" data-ref="navlogin">
        <button class="fweb-btn-secondary" style="padding: 0.45rem 1rem; font-size: 0.85rem;">${site.navActionText || 'Login'}</button>
      </div>
    </div>

    <div class="fweb-hero ${site.layoutType}" data-ref="hero">
      <div class="fweb-hero-content">
        <div class="fweb-badge" data-ref="badge" style="background: rgba(255,255,255,0.06); border: 1px solid ${buttonColor}; color: ${buttonColor};">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${buttonColor}; margin-right:4px;"></span>
          ${site.badgeText}
        </div>
        <h1 class="fweb-heading" data-ref="heading">${heading}</h1>
        <p class="fweb-subtitle" data-ref="subtitle">${site.tagline}</p>
        <div class="fweb-cta-group" data-ref="ctagroup">
          <button class="fweb-btn-primary" data-ref="mainbtn" style="background: ${buttonColor}; color: ${buttonTextColor}; box-shadow: 0 0 20px ${buttonColor}44;">
            ${buttonText}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
          <button class="fweb-btn-secondary">Learn More</button>
        </div>
      </div>
      <div class="fweb-visual-banner" data-ref="illustration">
        ${generateThemeIllustration(site.themeKey, buttonColor)}
      </div>
    </div>

    <div class="fweb-cards-section" data-ref="cardssection">
      <div class="fweb-cards-grid cols-${Math.min(5, Math.max(3, cardCount))}">
        ${cardsToRender.map((c, i) => `
          <div class="fweb-card ${cardShapeClass} ${c.isDiffCard ? 'diff-accent-card' : ''}" data-ref="card-${i}" style="${c.isDiffCard ? 'background: rgba(124, 58, 237, 0.15) !important; border: 2px solid #7C3AED !important;' : ''}">
            <div class="fweb-card-icon" style="background: ${c.isDiffCard ? '#7C3AED44' : buttonColor + '22'}; color: ${c.isDiffCard ? '#A78BFA' : buttonColor};">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div class="fweb-card-title">${c.title}</div>
            <div class="fweb-card-desc">${c.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ==================================================
// 5. DYNAMIC QUESTION GENERATION
// ==================================================
function generateQuestionsForWebsite(site) {
  const questions = [];

  // Question 1: Visual Memory - Primary Button Color
  const wrongColors = COLOR_PALETTES.filter(c => c.name !== site.buttonColor).map(c => c.name);
  const colorOptions = [site.buttonColor, ...getRandomItems(wrongColors, 3)].sort(() => 0.5 - Math.random());
  questions.push({
    id: 'buttonColor',
    category: 'Visual Memory',
    text: 'What color was the primary Call-To-Action (CTA) button?',
    options: colorOptions,
    correctAnswer: site.buttonColor,
    elementRef: 'mainbtn',
    explanation: `The primary button was styled in ${site.buttonColor}.`
  });

  // Question 2: Content Memory - Main Heading
  const otherHeadings = WEBSITE_THEMES[site.themeKey].headings.filter(h => h !== site.heading);
  const headingOptions = [site.heading, ...getRandomItems(otherHeadings, 3)].sort(() => 0.5 - Math.random());
  questions.push({
    id: 'heading',
    category: 'Content Memory',
    text: 'What was the exact headline displayed in the hero section?',
    options: headingOptions,
    correctAnswer: site.heading,
    elementRef: 'heading',
    explanation: `The main heading was "${site.heading}".`
  });

  // Question 3: Visual Memory - Card Shape
  const shapeOptions = CARD_SHAPES.map(s => s.name);
  questions.push({
    id: 'cardShape',
    category: 'Visual Memory',
    text: 'What shape were the feature cards at the bottom of the page?',
    options: shapeOptions,
    correctAnswer: site.cardShapeName,
    elementRef: 'cardssection',
    explanation: `The feature cards had ${site.cardShapeName} corners.`
  });

  // Question 4: Content Memory - Primary Button Text
  const otherButtons = WEBSITE_THEMES[site.themeKey].buttonTexts.filter(b => b !== site.buttonText);
  const btnTextOptions = [site.buttonText, ...getRandomItems(otherButtons, 3)].sort(() => 0.5 - Math.random());
  questions.push({
    id: 'buttonText',
    category: 'Content Memory',
    text: 'What label was written on the primary hero button?',
    options: btnTextOptions,
    correctAnswer: site.buttonText,
    elementRef: 'mainbtn',
    explanation: `The primary button label read "${site.buttonText}".`
  });

  // Question 5: Counting Memory - Number of Cards
  const countOptions = ['3 cards', '4 cards', '5 cards', '6 cards'];
  questions.push({
    id: 'cardCount',
    category: 'Counting Memory',
    text: 'How many feature cards were displayed in the grid?',
    options: countOptions,
    correctAnswer: `${site.cardCount} cards`,
    elementRef: 'cardssection',
    explanation: `There were ${site.cardCount} cards rendered in the grid.`
  });

  // Question 6: Spatial Memory - Navigation Alignment
  questions.push({
    id: 'navAlignment',
    category: 'Spatial Memory',
    text: 'How was the navigation menu aligned in the top header bar?',
    options: ['Left-aligned', 'Centered', 'Right-aligned', 'Hidden in dropdown'],
    correctAnswer: site.navAlignment,
    elementRef: 'navbar',
    explanation: `The header navigation links were ${site.navAlignment}.`
  });

  // Question 7: Spatial Memory - Main Illustration Placement
  questions.push({
    id: 'imagePosition',
    category: 'Spatial Memory',
    text: 'Where was the main illustration / visual banner positioned?',
    options: ['Right side of hero text', 'Centered below hero text', 'Left side of hero text', 'Background watermark'],
    correctAnswer: site.imagePosition === 'Right side' ? 'Right side of hero text' : 'Centered below hero text',
    elementRef: 'illustration',
    explanation: `The visual illustration was placed ${site.imagePosition.toLowerCase()}.`
  });

  // Question 8: Attention - Present Element Detection
  const validNav = getRandomItem(site.navLinks);
  const invalidNavs = ['Careers', 'Community', 'Security', 'Enterprise', 'Investors', 'Downloads'].filter(item => !site.navLinks.includes(item));
  const navTestOptions = [validNav, ...getRandomItems(invalidNavs, 3)].sort(() => 0.5 - Math.random());
  questions.push({
    id: 'presentNav',
    category: 'Attention',
    text: 'Which navigation item was actually present in the top navbar?',
    options: navTestOptions,
    correctAnswer: validNav,
    elementRef: 'navlinks',
    explanation: `"${validNav}" was visible in the header links.`
  });

  return questions;
}

// ==================================================
// 6. VIEW NAVIGATION & ROUTING
// ==================================================
// Requirement 1: Navigation should ONLY navigate to/display the corresponding section.
// Clicking "Tests" must NOT immediately start a memory test.
// Clicking "Themes" must NOT automatically start a test.
// Clicking "Progress" must NOT start or reset anything.
function toggleMobileMenu() {
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    navLinks.classList.toggle('mobile-open');
    sounds.click();
  }
}

function closeMobileMenu() {
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    navLinks.classList.remove('mobile-open');
  }
}

function navigateToView(viewId) {
  // Always close mobile navigation menu when a section is navigated to
  closeMobileMenu();

  // If navigating away from preview while countdown running, clear timer cleanly
  if (appState.countdownInterval && viewId !== 'test-preview') {
    clearInterval(appState.countdownInterval);
    appState.countdownInterval = null;
  }

  appState.currentView = viewId;
  sounds.click();

  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active-view');
  });

  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.add('active-view');
  }

  // Update navbar links active styling
  document.querySelectorAll('.nav-item-btn').forEach(btn => {
    const viewAttr = (btn.dataset && btn.dataset.view) || (btn.getAttribute && btn.getAttribute('data-view'));
    btn.classList.toggle('active', viewAttr === viewId);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update specific view triggers
  if (viewId === 'home') {
    updateHomeStats();
  } else if (viewId === 'progress') {
    renderProgressPage();
  } else if (viewId === 'tests') {
    appState.testStage = TEST_STATES.DIFFICULTY_SELECTION;
    highlightSelectedDifficultyCards();
  }
}

// ==================================================
// 7. MEMORY TEST WORKFLOW CONTROLLER
// ==================================================
// Requirement 2 & 3 & 4 & 5:
// Tests -> Choose Difficulty -> Click Difficulty -> Website Preview -> Countdown -> Website hidden -> User clicks "I'm Ready Now" -> Questions -> Submit -> Results

function selectDifficulty(diff) {
  const norm = (diff || 'medium').toLowerCase();
  const valid = (norm === 'low' || norm === 'easy') ? 'low' : ((norm === 'high' || norm === 'hard') ? 'high' : 'medium');
  appState.selectedDifficulty = valid;
  appState.difficulty = valid;
  localStorage.setItem(STORAGE_KEYS.DIFFICULTY, valid);
  sounds.click();

  highlightSelectedDifficultyCards();

  const cfg = getDifficultyConfig(valid);
  showToast(`Difficulty: ${cfg.name} (${cfg.time}s)`);
}

function highlightSelectedDifficultyCards() {
  const valid = appState.selectedDifficulty;
  document.querySelectorAll('.diff-card').forEach(card => {
    const cardDiff = (card.dataset.diff || '').toLowerCase();
    const isThis = (cardDiff === valid) || (cardDiff === 'easy' && valid === 'low') || (cardDiff === 'hard' && valid === 'high');
    card.classList.toggle('selected', isThis);
  });
}

function startMemoryTestWithDifficulty(diff) {
  selectDifficulty(diff);
  startMemoryTest();
}

function startMemoryTestWithCurrentDifficulty() {
  startMemoryTest();
}

function startMemoryTest(themeKey = null) {
  // Clear any existing countdown
  if (appState.countdownInterval) {
    clearInterval(appState.countdownInterval);
    appState.countdownInterval = null;
  }

  const diffCfg = getDifficultyConfig(appState.selectedDifficulty);
  
  // Requirement 6: Update state variables
  appState.testStage = TEST_STATES.WEBSITE_PREVIEW;
  appState.testStarted = true;
  appState.exposureCompleted = false;
  appState.websiteHidden = false;
  appState.readyForQuestions = false;
  appState.userAnswers = {};
  appState.countdown = diffCfg.time;
  appState.countdownRemaining = diffCfg.time;
  appState.selectedTheme = themeKey || appState.activePracticeTheme || getRandomItem(Object.keys(WEBSITE_THEMES));

  // Generate dynamic website (stored in currentWebsite and currentWebsiteData)
  appState.currentWebsite = generateWebsite(appState.selectedTheme);
  appState.currentWebsiteData = appState.currentWebsite;

  // Generate questions matched directly to this exact generated website
  appState.questions = generateQuestionsForWebsite(appState.currentWebsite);
  appState.currentQuestions = appState.questions;

  appState.correctAnswers = {};
  appState.questions.forEach(q => {
    appState.correctAnswers[q.id] = q.correctAnswer;
  });

  // Render website into preview container
  const container = document.getElementById('generated-website-container');
  const mockup = document.getElementById('browser-mockup-frame');
  if (container && mockup) {
    mockup.classList.remove('hidden-anim');
    container.innerHTML = renderWebsiteHTML(appState.currentWebsite);
  }

  // Set top status indicators
  const themeTag = document.getElementById('test-theme-tag');
  const diffTag = document.getElementById('test-diff-tag');
  const addressUrl = document.getElementById('browser-url-text');

  if (themeTag) themeTag.textContent = `${appState.currentWebsite.themeName} Website`;
  if (diffTag) diffTag.textContent = `${diffCfg.name} (${diffCfg.time}s)`;
  if (addressUrl) {
    const slug = appState.currentWebsite.brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
    addressUrl.textContent = `https://${slug}.io/explore`;
  }

  // Navigate to preview view
  navigateToView('test-preview');

  // Requirement 3: Start countdown. During this ENTIRE countdown:
  // - The website MUST remain visible.
  // - The user MUST be able to study the website.
  // - Do NOT show memory questions yet.
  // - Do NOT hide the website before countdown finishes.
  appState.testStage = TEST_STATES.COUNTDOWN_ACTIVE;
  startCountdown(diffCfg.time);
}

function startCountdown(totalSeconds) {
  const numberElem = document.getElementById('countdown-number-val');
  const ring = document.getElementById('countdown-progress-circle');
  const circumference = 2 * Math.PI * 25; // 157.08
  
  if (ring) {
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `0`;
  }

  updateCountdownDisplay(totalSeconds, totalSeconds, circumference);

  appState.countdownInterval = setInterval(() => {
    appState.countdownRemaining--;
    appState.countdown = appState.countdownRemaining;
    sounds.tick();

    updateCountdownDisplay(appState.countdownRemaining, totalSeconds, circumference);

    // Requirement 4: When countdown reaches 0:
    // 1. Smoothly hide the website.
    // 2. Show the "Website Hidden" screen.
    // 3. Keep memory questions hidden until user clicks "I'm Ready Now".
    if (appState.countdownRemaining <= 0) {
      clearInterval(appState.countdownInterval);
      appState.countdownInterval = null;
      transitionToHiddenScreen();
    }
  }, 1000);
}

function updateCountdownDisplay(current, total, circumference) {
  const numberElem = document.getElementById('countdown-number-val');
  const ring = document.getElementById('countdown-progress-circle');

  if (numberElem) {
    numberElem.textContent = current;
  }

  if (ring) {
    const progress = (total - current) / total;
    const offset = progress * circumference;
    ring.style.strokeDashoffset = `${offset}`;
    
    if (current <= 3) {
      ring.style.stroke = '#EF4444';
    } else {
      ring.style.stroke = 'var(--primary-cyan)';
    }
  }
}

// Requirement 4: After Countdown Finishes
function transitionToHiddenScreen() {
  if (appState.countdownInterval) {
    clearInterval(appState.countdownInterval);
    appState.countdownInterval = null;
  }

  appState.exposureCompleted = true;
  appState.websiteHidden = true;
  appState.testStage = TEST_STATES.WEBSITE_HIDDEN;

  // 1. Smoothly hide the website with opacity + blur + scale transition
  const mockup = document.getElementById('browser-mockup-frame');
  if (mockup) {
    mockup.classList.add('hidden-anim');
  }

  // Re-enable "I'm Ready Now" button for user
  const readyBtn = document.getElementById('btn-ready-now');
  if (readyBtn) {
    readyBtn.disabled = false;
    readyBtn.style.opacity = '1';
    readyBtn.style.pointerEvents = 'auto';
  }

  // 2. Show the "Website Hidden" screen after smooth transition
  setTimeout(() => {
    navigateToView('test-hidden');
  }, 500);
}

// Requirement 5: "I'm Ready Now" button click handler
function handleReadyNowClick() {
  // Prevent invalid actions: only valid when in WEBSITE_HIDDEN stage
  if (appState.testStage !== TEST_STATES.WEBSITE_HIDDEN) {
    return;
  }

  sounds.click();

  // Disable button to prevent double-clicks
  const readyBtn = document.getElementById('btn-ready-now');
  if (readyBtn) {
    readyBtn.disabled = true;
    readyBtn.style.opacity = '0.5';
    readyBtn.style.pointerEvents = 'none';
  }

  appState.readyForQuestions = true;
  appState.testStage = TEST_STATES.QUESTIONS;

  // Navigate to questions section
  navigateToView('test-questions');

  // Render questions generated from the exact website previously viewed
  // (Do NOT regenerate website or questions at this point)
  renderQuestions();
}

function continueToQuestions() {
  handleReadyNowClick();
}

// ==================================================
// 8. QUESTIONS RENDERING & SUBMISSION
// ==================================================
function renderQuestions() {
  const listContainer = document.getElementById('questions-list-container');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  appState.questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `q-card-${q.id}`;

    card.innerHTML = `
      <div class="question-meta">
        <span class="question-category-tag">${q.category}</span>
        <span aria-hidden="true" style="color: var(--text-muted);">·</span>
        <span class="question-number-tag">Question ${idx + 1} of ${appState.questions.length}</span>
      </div>
      <h3 class="question-text">${q.text}</h3>
      <div class="options-grid">
        ${q.options.map(opt => `
          <button type="button" class="option-btn ${appState.userAnswers[q.id] === opt ? 'selected' : ''}" 
                  onclick="selectAnswer('${q.id}', '${encodeURIComponent(opt)}')">
            <span>${opt}</span>
            <div class="option-radio-dot"></div>
          </button>
        `).join('')}
      </div>
    `;

    listContainer.appendChild(card);
  });

  updateQuestionsProgressBar();
}

function selectAnswer(questionId, encodedOption) {
  // Prevent answering outside QUESTIONS stage
  if (appState.testStage !== TEST_STATES.QUESTIONS) return;

  const option = decodeURIComponent(encodedOption);
  appState.userAnswers[questionId] = option;
  sounds.click();

  const card = document.getElementById(`q-card-${questionId}`);
  if (card) {
    card.querySelectorAll('.option-btn').forEach(btn => {
      const isThis = btn.querySelector('span').textContent === option;
      btn.classList.toggle('selected', isThis);
    });
  }

  updateQuestionsProgressBar();
}

function updateQuestionsProgressBar() {
  const answeredCount = Object.keys(appState.userAnswers).length;
  const total = appState.questions.length;
  const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  const textElem = document.getElementById('questions-progress-num');
  const barElem = document.getElementById('questions-progress-bar-fill');

  if (textElem) textElem.textContent = `${answeredCount} of ${total} answered`;
  if (barElem) barElem.style.width = `${percent}%`;
}

function submitAnswers() {
  if (appState.testStage !== TEST_STATES.QUESTIONS) return;

  const answeredCount = Object.keys(appState.userAnswers).length;
  const total = appState.questions.length;

  if (answeredCount < total) {
    const remaining = total - answeredCount;
    showToast(`Please answer all questions (${remaining} remaining)`);
    return;
  }

  appState.testStage = TEST_STATES.RESULTS;
  let correctCount = 0;
  const categoryStats = {
    'Visual Memory': { total: 0, correct: 0 },
    'Content Memory': { total: 0, correct: 0 },
    'Spatial Memory': { total: 0, correct: 0 },
    'Counting Memory': { total: 0, correct: 0 },
    'Attention': { total: 0, correct: 0 }
  };

  const resultsBreakdown = appState.questions.map(q => {
    const userChoice = appState.userAnswers[q.id] || '(No Answer)';
    const isCorrect = userChoice === q.correctAnswer;
    
    if (isCorrect) correctCount++;
    if (categoryStats[q.category]) {
      categoryStats[q.category].total++;
      if (isCorrect) categoryStats[q.category].correct++;
    }

    return {
      id: q.id,
      category: q.category,
      question: q.text,
      userAnswer: userChoice,
      correctAnswer: q.correctAnswer,
      isCorrect,
      elementRef: q.elementRef,
      explanation: q.explanation
    };
  });

  const overallScore = Math.round((correctCount / total) * 100);
  appState.score = overallScore;

  sounds.complete();
  showToast(`Test completed! Your Recall: ${overallScore}%`);

  const diffCfg = getDifficultyConfig(appState.selectedDifficulty);
  const testRecord = {
    id: 'test_' + Date.now(),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    theme: appState.currentWebsite.themeName,
    difficulty: diffCfg.name,
    score: overallScore,
    correctCount,
    totalCount: total,
    categoryStats,
    resultsBreakdown,
    websiteData: appState.currentWebsite,
    userAnswers: appState.userAnswers
  };

  saveTestRecord(testRecord);
  renderResultsView(testRecord);
  navigateToView('test-results');
}

// ==================================================
// 9. LOCALSTORAGE PERSISTENCE
// ==================================================
function saveTestRecord(record) {
  const tests = JSON.parse(localStorage.getItem(STORAGE_KEYS.TESTS) || '[]');
  tests.unshift(record);
  localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(tests));

  const scores = tests.map(t => t.score);
  const best = Math.max(...scores);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  localStorage.setItem(STORAGE_KEYS.BEST_SCORE, best.toString());
  localStorage.setItem(STORAGE_KEYS.AVG_SCORE, avg.toString());

  appState.tests = tests;
}

// ==================================================
// 10. RESULTS, REVEAL WEBSITE & MEMORY REPLAY
// ==================================================
function renderResultsView(record) {
  const scoreNum = document.getElementById('results-score-number');
  const scoreRing = document.getElementById('results-score-ring');
  const tierBadge = document.getElementById('results-tier-badge');
  const feedbackText = document.getElementById('results-feedback-text');

  if (scoreNum) scoreNum.textContent = `${record.score}%`;

  if (scoreRing) {
    const circumference = 440; // 2 * PI * 70
    const offset = circumference - (record.score / 100) * circumference;
    scoreRing.style.strokeDashoffset = `${offset}`;
  }

  let tier = 'Keep Practicing';
  let tierClass = 'practicing';
  let feedback = 'With regular practice, your spatial layout and color recall will sharpen substantially.';

  if (record.score >= 90) {
    tier = 'Exceptional Recall';
    tierClass = 'exceptional';
    feedback = 'Outstanding visual and content recall! You retained layout, typography, and color details with surgical precision.';
  } else if (record.score >= 75) {
    tier = 'Strong Recall';
    tierClass = 'strong';
    feedback = 'You remembered major interface zones, hero texts, and primary accents accurately.';
  } else if (record.score >= 50) {
    tier = 'Developing Recall';
    tierClass = 'developing';
    feedback = 'Good foundation. You captured the broad layout structure while missing a few micro-details.';
  }

  if (tierBadge) {
    tierBadge.textContent = tier;
    tierBadge.className = `tier-badge ${tierClass}`;
  }

  if (feedbackText) {
    feedbackText.textContent = feedback;
  }

  renderCategoryBars(record.categoryStats);
  renderComparisonTable(record.resultsBreakdown);
  renderRevealedWebsite(record.websiteData, record.resultsBreakdown);
  renderMemoryReplay(record.websiteData, record.userAnswers, record.resultsBreakdown);
}

function renderCategoryBars(categoryStats) {
  const container = document.getElementById('results-categories-wrap');
  if (!container) return;

  const cats = [
    { key: 'Visual Memory', label: 'Visual & Color Details', exp: 'Accuracy recalling button colors, card shapes, and accents.' },
    { key: 'Content Memory', label: 'Textual & Content Memory', exp: 'Accuracy recalling headlines, taglines, and button labels.' },
    { key: 'Spatial Memory', label: 'Spatial & Layout Structure', exp: 'Accuracy recalling positions, menus, and visual alignments.' }
  ];

  container.innerHTML = cats.map(c => {
    const stat = categoryStats[c.key] || { total: 1, correct: 1 };
    const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 100;

    return `
      <div class="category-bar-group">
        <div class="category-bar-header">
          <span class="cat-bar-name">${c.label}</span>
          <span class="cat-bar-score">${pct}% (${stat.correct}/${stat.total})</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width: ${pct}%;"></div>
        </div>
        <div class="cat-bar-explanation">${c.exp}</div>
      </div>
    `;
  }).join('');
}

function renderComparisonTable(breakdown) {
  const tbody = document.getElementById('results-table-tbody');
  if (!tbody) return;

  tbody.innerHTML = breakdown.map(row => `
    <tr>
      <td><strong>${row.question}</strong></td>
      <td><span style="color: var(--primary); font-size: 0.8rem; font-weight: 700;">${row.category}</span></td>
      <td>${row.userAnswer}</td>
      <td><span style="color: var(--text-primary); font-weight: 700;">${row.correctAnswer}</span></td>
      <td>
        <span class="res-tag ${row.isCorrect ? 'correct' : 'incorrect'}">
          ${row.isCorrect ? '✓ Correct' : '✕ Incorrect'}
        </span>
      </td>
    </tr>
  `).join('');
}

function renderRevealedWebsite(site, breakdown) {
  const container = document.getElementById('revealed-website-container');
  if (!container) return;

  container.innerHTML = renderWebsiteHTML(site);

  breakdown.forEach(item => {
    if (!item.elementRef) return;
    const targetElem = container.querySelector(`[data-ref="${item.elementRef}"]`);
    if (targetElem) {
      if (item.isCorrect) {
        targetElem.classList.add('highlight-correct');
      } else {
        targetElem.classList.add('highlight-incorrect');
      }
    }
  });
}

function renderMemoryReplay(site, userAnswers, breakdown) {
  const originalWrap = document.getElementById('replay-original-container');
  const reconstructedWrap = document.getElementById('replay-user-container');
  const differencesList = document.getElementById('replay-diff-list');

  if (originalWrap) {
    originalWrap.innerHTML = renderWebsiteHTML(site);
  }

  if (reconstructedWrap) {
    reconstructedWrap.innerHTML = renderWebsiteHTML(site, true, userAnswers);
  }

  if (differencesList) {
    differencesList.innerHTML = breakdown.map(item => `
      <div class="diff-item-row ${item.isCorrect ? 'success' : 'missed'}">
        <div class="diff-item-icon">
          ${item.isCorrect 
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
          }
        </div>
        <div>
          <div style="font-weight: 700; color: ${item.isCorrect ? 'var(--primary-cyan)' : 'var(--error)'};">
            ${item.category}: ${item.isCorrect ? 'Accurately Remembered' : 'Memory Discrepancy'}
          </div>
          <div style="font-size: 0.82rem; color: var(--text-soft); margin-top: 2px;">
            ${item.isCorrect 
              ? item.explanation 
              : `You recalled "${item.userAnswer}", but the actual detail was "${item.correctAnswer}".`}
          </div>
        </div>
      </div>
    `).join('');
  }
}

// ==================================================
// 11. ADVANCED PLAYABLE MODES
// ==================================================

// --- SPOT THE DIFFERENCE MODE ---
function generateSpotTheDifferenceChallenge() {
  const siteA = generateWebsite();
  // Deep clone to create base for siteB
  const siteB = JSON.parse(JSON.stringify(siteA));

  // Candidate pool of 8 real, intentional difference types
  const candidateDiffs = [
    {
      id: 'heading',
      target: 'heading',
      name: 'Main Heading Text',
      apply: (b, a) => {
        const altHeadings = WEBSITE_THEMES[a.themeKey].headings.filter(h => h !== a.heading);
        b.heading = getRandomItem(altHeadings) || 'Next-Gen Visual Intelligence Platform';
      }
    },
    {
      id: 'badge',
      target: 'badge',
      name: 'Hero Badge',
      apply: (b, a) => {
        const altBadges = BADGE_VARIANTS.filter(bg => bg !== a.badgeText);
        b.badgeText = getRandomItem(altBadges) || '⚡ 2026 Enhanced Edition';
      }
    },
    {
      id: 'mainbtn',
      target: 'mainbtn',
      name: 'Primary CTA Button',
      apply: (b, a) => {
        const altBtns = BUTTON_LABELS.filter(btn => btn !== a.buttonText);
        b.buttonText = getRandomItem(altBtns) || 'Explore Live Demo';
        const altColors = COLOR_PALETTES.filter(c => c.name !== a.buttonColor);
        const newColor = getRandomItem(altColors);
        b.buttonColor = newColor.name;
        b.buttonColorHex = newColor.hex;
        b.buttonTextColor = newColor.textHex;
      }
    },
    {
      id: 'card-1',
      target: 'card-1',
      name: 'Feature Card #2',
      apply: (b, a) => {
        if (!b.featureCards[1]) b.featureCards[1] = { title: 'Adaptive Core', desc: 'Real-time synchronization.' };
        b.featureCards[1] = {
          ...b.featureCards[1],
          title: '✦ Advanced ' + b.featureCards[1].title,
          isDiffCard: true
        };
      }
    },
    {
      id: 'subtitle',
      target: 'subtitle',
      name: 'Hero Subtitle Description',
      apply: (b, a) => {
        b.tagline = 'Experience revolutionary speed and effortless workflows built for modern creative teams.';
      }
    },
    {
      id: 'card-0',
      target: 'card-0',
      name: 'Feature Card #1',
      apply: (b, a) => {
        if (!b.featureCards[0]) b.featureCards[0] = { title: 'Ultra Fast', desc: 'Optimized performance.' };
        b.featureCards[0] = {
          ...b.featureCards[0],
          title: '⚡ Boosted ' + b.featureCards[0].title,
          desc: 'Automated 120fps engine with instant precision recall.'
        };
      }
    },
    {
      id: 'card-2',
      target: 'card-2',
      name: 'Feature Card #3',
      apply: (b, a) => {
        if (!b.featureCards[2]) b.featureCards[2] = { title: 'Cloud Sync', desc: 'Multi-device storage.' };
        b.featureCards[2] = {
          ...b.featureCards[2],
          desc: 'Enterprise-grade encryption with persistent cloud snapshots and history.'
        };
      }
    },
    {
      id: 'logo',
      target: 'logo',
      name: 'Brand Logo Title',
      apply: (b, a) => {
        b.brandName = a.brandName + ' PRO';
      }
    },
    {
      id: 'navlogin',
      target: 'navlogin',
      name: 'Navigation Action Button',
      apply: (b, a) => {
        b.navActionText = 'Free Trial';
      }
    }
  ];

  // Pick exactly 5 real intentional differences
  const shuffled = candidateDiffs.sort(() => 0.5 - Math.random());
  const selectedDiffs = shuffled.slice(0, 5);

  // Apply the 5 differences to siteB
  selectedDiffs.forEach(diff => diff.apply(siteB, siteA));

  return {
    siteA,
    siteB,
    differences: selectedDiffs.map(d => ({ id: d.id, target: d.target, name: d.name }))
  };
}

function startDifferenceMode() {
  const challenge = generateSpotTheDifferenceChallenge();
  appState.differenceGame = {
    siteA: challenge.siteA,
    siteB: challenge.siteB,
    differences: challenge.differences,
    foundIds: []
  };

  const modal = document.getElementById('diff-mode-modal');
  const containerA = document.getElementById('diff-site-a');
  const containerB = document.getElementById('diff-site-b');
  const counter = document.getElementById('diff-found-counter');
  const banner = document.getElementById('diff-feedback-banner');
  const tryAgainBtn = document.getElementById('btn-diff-try-again');

  if (counter) counter.textContent = '0 / 5';
  if (banner) {
    banner.innerHTML = '<span style="color: var(--text-secondary);">Click directly on any difference you spot</span>';
  }
  if (tryAgainBtn) {
    tryAgainBtn.classList.remove('btn-primary');
    tryAgainBtn.classList.add('btn-secondary');
  }

  if (containerA) {
    containerA.innerHTML = renderWebsiteHTML(challenge.siteA);
    containerA.querySelectorAll('.diff-target-found').forEach(el => el.classList.remove('diff-target-found'));
  }
  if (containerB) {
    containerB.innerHTML = renderWebsiteHTML(challenge.siteB);
    containerB.querySelectorAll('.diff-target-found').forEach(el => el.classList.remove('diff-target-found'));
  }

  if (modal) modal.classList.add('active');
  sounds.click();
}

function showDiffClickFeedback(event, isCorrect, message) {
  const bubble = document.createElement('div');
  bubble.className = `diff-click-bubble ${isCorrect ? 'correct' : 'incorrect'}`;
  bubble.textContent = message;

  let x = event.clientX;
  let y = event.clientY;
  if ((x === undefined || y === undefined) && event.touches && event.touches[0]) {
    x = event.touches[0].clientX;
    y = event.touches[0].clientY;
  } else if ((x === undefined || y === undefined) && event.changedTouches && event.changedTouches[0]) {
    x = event.changedTouches[0].clientX;
    y = event.changedTouches[0].clientY;
  }
  if (x === undefined || y === undefined) {
    x = window.innerWidth / 2;
    y = window.innerHeight / 2;
  }

  // Constrain to viewport safely so feedback bubble never cuts off on mobile screens
  const safeX = Math.max(65, Math.min(window.innerWidth - 65, x));
  const safeY = Math.max(35, Math.min(window.innerHeight - 30, y - 22));

  bubble.style.left = `${safeX}px`;
  bubble.style.top = `${safeY}px`;
  document.body.appendChild(bubble);

  setTimeout(() => {
    if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
  }, 950);
}

function closeDiffModeModal() {
  closeModal('diff-mode-modal');
  navigateToView('modes');
}

function handleDiffPreviewClick(event, previewSide) {
  if (!appState.differenceGame || !appState.differenceGame.differences) return;

  // Find clicked element with a data-ref
  const targetElem = event.target.closest('[data-ref]');
  if (!targetElem) {
    showDiffClickFeedback(event, false, '✕ Not a difference');
    sounds.wrong();
    return;
  }

  const clickedRef = targetElem.getAttribute('data-ref');

  // Check if this ref matches one of the 5 intentional differences
  const matchedDiff = appState.differenceGame.differences.find(d => d.target === clickedRef);

  if (matchedDiff) {
    // Check if already found
    if (appState.differenceGame.foundIds.includes(matchedDiff.id)) {
      showDiffClickFeedback(event, true, 'Already found!');
      return;
    }

    // Found an actual difference!
    appState.differenceGame.foundIds.push(matchedDiff.id);
    sounds.correct();

    // Mark visual highlight in BOTH previews!
    const foundRef = matchedDiff.target;
    const elemsA = document.querySelectorAll(`#diff-site-a [data-ref="${foundRef}"]`);
    const elemsB = document.querySelectorAll(`#diff-site-b [data-ref="${foundRef}"]`);
    elemsA.forEach(el => el.classList.add('diff-target-found'));
    elemsB.forEach(el => el.classList.add('diff-target-found'));

    // Update counter
    const foundCount = appState.differenceGame.foundIds.length;
    const counterElem = document.getElementById('diff-found-counter');
    if (counterElem) counterElem.textContent = `${foundCount} / 5`;

    // Show feedback
    showDiffClickFeedback(event, true, '✓ Difference found!');

    const banner = document.getElementById('diff-feedback-banner');
    if (banner) {
      banner.innerHTML = `<span style="color: var(--primary); font-weight: 800;">✓ Difference found! (${foundCount} / 5)</span>`;
    }

    // Check completion
    if (foundCount >= 5) {
      sounds.complete();
      if (banner) {
        banner.innerHTML = `<span style="color: var(--success); font-weight: 800; font-size: 1.05rem;">🎉 All differences found!</span>`;
      }
      showToast('🎉 All 5 differences found! Fantastic observation skills.');
      const tryAgainBtn = document.getElementById('btn-diff-try-again');
      if (tryAgainBtn) {
        tryAgainBtn.classList.remove('btn-secondary');
        tryAgainBtn.classList.add('btn-primary');
        tryAgainBtn.focus();
      }
    }
  } else {
    // Clicked an area with NO difference
    sounds.wrong();
    showDiffClickFeedback(event, false, '✕ Not a difference');
    const banner = document.getElementById('diff-feedback-banner');
    if (banner && appState.differenceGame.foundIds.length < 5) {
      banner.innerHTML = `<span style="color: var(--danger); font-weight: 700;">✕ Not a difference</span>`;
    }
  }
}

// Legacy helper for backwards compatibility
function verifyDifferenceGuess(guessKey) {
  showToast('Click directly on the website previews to spot differences!');
}

// --- SEQUENCE MEMORY MODE ---
let sequenceGameTimers = [];

function clearAllSequenceTimers() {
  sequenceGameTimers.forEach(id => clearTimeout(id));
  sequenceGameTimers = [];
  document.querySelectorAll('.sequence-tile').forEach(tile => {
    tile.classList.remove('active-flash', 'user-clicked', 'flash-error');
  });
}

function startSequenceMode() {
  // Starting the game sets initial level 1
  appState.sequenceGame = {
    level: 1,
    currentSequence: [],
    sequenceIndex: 0,
    userSequence: [],
    isShowingSequence: false,
    isUserInputEnabled: false
  };

  const modal = document.getElementById('sequence-mode-modal');
  if (modal) modal.classList.add('active');

  restartSequenceRound();
}

function restartSequenceRound(isLevelAdvance = false) {
  // Clear any and all running timers/animations
  clearAllSequenceTimers();

  const levelNumElem = document.getElementById('sequence-level-num');
  const statusElem = document.getElementById('sequence-status-msg');

  // Maintain current level on restart (stays on the same level per requirements)
  const currentLevel = (appState.sequenceGame && appState.sequenceGame.level) ? appState.sequenceGame.level : 1;

  // Level 1: 4 steps (e.g. Logo → Nav Links → Hero Text → Primary CTA as requested)
  // Higher levels: 3 + currentLevel steps
  const seqLength = 3 + currentLevel;
  const tiles = ['logo', 'nav', 'hero', 'cta'];
  const newSeq = [];
  for (let i = 0; i < seqLength; i++) {
    newSeq.push(getRandomItem(tiles));
  }

  // Completely reset round state
  appState.sequenceGame = {
    level: currentLevel,
    currentSequence: newSeq,
    sequenceIndex: 0,
    userSequence: [],
    isShowingSequence: true,
    isUserInputEnabled: false
  };

  if (levelNumElem) levelNumElem.textContent = currentLevel;
  if (statusElem) {
    statusElem.innerHTML = `<span style="color: var(--primary);">Watch the flashing sequence... (${seqLength} steps)</span>`;
  }

  // Play audio click on restart
  sounds.click();

  // Play animation sequence safely using managed timeouts
  const startDelay = 550;
  const stepDuration = 650;

  newSeq.forEach((tileId, idx) => {
    const flashTimer = setTimeout(() => {
      flashSequenceTile(tileId);
    }, startDelay + idx * stepDuration);
    sequenceGameTimers.push(flashTimer);
  });

  // Enable user input after full sequence finishes
  const finishTimer = setTimeout(() => {
    appState.sequenceGame.isShowingSequence = false;
    appState.sequenceGame.isUserInputEnabled = true;
    if (statusElem) {
      statusElem.innerHTML = `<span style="color: var(--text-primary);">Your turn! Click the components in the exact order.</span>`;
    }
  }, startDelay + newSeq.length * stepDuration);
  sequenceGameTimers.push(finishTimer);
}

function flashSequenceTile(tileId, toneFreq = null) {
  const tile = document.getElementById(`seq-tile-${tileId}`);
  if (tile) {
    const freqs = { logo: 350, nav: 440, hero: 554, cta: 659 };
    const freq = toneFreq || freqs[tileId] || 440;
    sounds.playTone(freq, 'sine', 0.18, 0.12);

    tile.classList.add('active-flash');
    const offTimer = setTimeout(() => {
      tile.classList.remove('active-flash');
    }, 320);
    sequenceGameTimers.push(offTimer);
  }
}

function handleSequenceTileClick(tileId) {
  if (!appState.sequenceGame || !appState.sequenceGame.isUserInputEnabled) {
    return;
  }

  const seq = appState.sequenceGame.currentSequence;
  const currentIdx = appState.sequenceGame.userSequence.length;
  const expectedTile = seq[currentIdx];

  // Visual click reaction
  const tile = document.getElementById(`seq-tile-${tileId}`);
  if (tile) {
    tile.classList.add('user-clicked');
    const resetClickTimer = setTimeout(() => {
      tile.classList.remove('user-clicked');
    }, 200);
    sequenceGameTimers.push(resetClickTimer);
  }

  const freqs = { logo: 350, nav: 440, hero: 554, cta: 659 };
  sounds.playTone(freqs[tileId] || 440, 'triangle', 0.12, 0.08);

  if (tileId === expectedTile) {
    // Correct step
    appState.sequenceGame.userSequence.push(tileId);
    const statusElem = document.getElementById('sequence-status-msg');

    if (appState.sequenceGame.userSequence.length === seq.length) {
      // Completed the entire sequence for this level!
      appState.sequenceGame.isUserInputEnabled = false;
      sounds.correct();

      if (statusElem) {
        statusElem.innerHTML = `<span style="color: var(--success); font-weight: 800;">✓ Correct! Level ${appState.sequenceGame.level} Completed!</span>`;
      }
      showToast(`Level ${appState.sequenceGame.level} Clear! Advancing...`);

      // Advance level
      appState.sequenceGame.level++;
      const nextRoundTimer = setTimeout(() => {
        restartSequenceRound(true);
      }, 1200);
      sequenceGameTimers.push(nextRoundTimer);
    } else {
      if (statusElem) {
        statusElem.innerHTML = `<span style="color: var(--primary);">✓ Correct! (${appState.sequenceGame.userSequence.length} / ${seq.length})</span>`;
      }
    }
  } else {
    // Wrong order clicked!
    appState.sequenceGame.isUserInputEnabled = false;
    sounds.wrong();

    if (tile) {
      tile.classList.add('flash-error');
      const errorTimer = setTimeout(() => {
        tile.classList.remove('flash-error');
      }, 500);
      sequenceGameTimers.push(errorTimer);
    }

    const statusElem = document.getElementById('sequence-status-msg');
    if (statusElem) {
      statusElem.innerHTML = `<span style="color: var(--danger); font-weight: 800;">✕ Wrong order! Click "Restart Sequence" to try Level ${appState.sequenceGame.level} again.</span>`;
    }
    showToast('Wrong order!');
  }
}

function startAttentionMode() {
  startMemoryTest();
  showToast('Attention Challenge: Focus intently on all present features!');
}

// ==================================================
// 12. PROGRESS PAGE & CLEAR HISTORY MODAL
// ==================================================
// Requirement 8 & 9: Professional Confirmation Modal & LocalStorage Cleanliness
function openClearHistoryModal() {
  sounds.click();
  const modal = document.getElementById('clear-history-modal');
  if (modal) modal.classList.add('active');
}

function executeClearHistory() {
  sounds.click();
  
  // Requirement 9: localStorage.removeItem("webMemoryTests")
  localStorage.removeItem(STORAGE_KEYS.TESTS);
  localStorage.removeItem(STORAGE_KEYS.BEST_SCORE);
  localStorage.removeItem(STORAGE_KEYS.AVG_SCORE);
  localStorage.removeItem(STORAGE_KEYS.RECENT_TESTS);

  appState.tests = [];
  closeModal('clear-history-modal');

  // Immediately update progress section and home stats without reloading
  renderProgressPage();
  updateHomeStats();

  showToast('Test history cleared.');
}

function resetAllProgressData() {
  openClearHistoryModal();
}

function renderProgressPage() {
  const tests = JSON.parse(localStorage.getItem(STORAGE_KEYS.TESTS) || '[]');
  
  const totalElem = document.getElementById('prog-total-tests');
  const bestElem = document.getElementById('prog-best-score');
  const avgElem = document.getElementById('prog-avg-score');
  const tableBody = document.getElementById('prog-history-tbody');

  const total = tests.length;
  const scores = tests.map(t => t.score);
  const best = total > 0 ? Math.max(...scores) : 0;
  const avg = total > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0;

  if (totalElem) totalElem.textContent = total;
  if (bestElem) bestElem.textContent = `${best}%`;
  if (avgElem) avgElem.textContent = `${avg}%`;

  if (tableBody) {
    if (tests.length === 0) {
      // Requirement 9: Display "No tests completed yet."
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2.5rem; color: var(--text-muted); font-size: 0.95rem;">No tests completed yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = tests.map(t => {
      let badgeClass = 'high';
      if (t.score < 50) badgeClass = 'low';
      else if (t.score < 75) badgeClass = 'med';

      return `
        <tr>
          <td><span style="font-weight: 700; color: var(--text-main);">${t.theme}</span></td>
          <td><span style="color: var(--primary-cyan); text-transform: uppercase; font-size: 0.8rem; font-weight: 700;">${t.difficulty}</span></td>
          <td><span class="score-badge ${badgeClass}">${t.score}%</span></td>
          <td>${t.correctCount} / ${t.totalCount}</td>
          <td style="color: var(--text-soft); font-size: 0.85rem;">${t.date}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="reviewHistoricalTest('${t.id}')">
              View Replay
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function reviewHistoricalTest(testId) {
  const tests = JSON.parse(localStorage.getItem(STORAGE_KEYS.TESTS) || '[]');
  const match = tests.find(t => t.id === testId);
  if (match) {
    renderResultsView(match);
    navigateToView('test-results');
  }
}

function updateHomeStats() {
  const tests = JSON.parse(localStorage.getItem(STORAGE_KEYS.TESTS) || '[]');
  const total = tests.length;
  const scores = tests.map(t => t.score);
  const best = total > 0 ? Math.max(...scores) : 0;
  const avg = total > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0;

  animateCounter('stat-total-tests', total);
  animateCounter('stat-best-score', best, '%');
  animateCounter('stat-avg-score', avg, '%');
}

function animateCounter(elemId, targetValue, suffix = '') {
  const elem = document.getElementById(elemId);
  if (!elem) return;

  if (targetValue === 0) {
    elem.textContent = `0${suffix}`;
    return;
  }

  let current = 0;
  const step = Math.max(1, Math.ceil(targetValue / 20));
  const timer = setInterval(() => {
    current += step;
    if (current >= targetValue) {
      current = targetValue;
      clearInterval(timer);
    }
    elem.textContent = `${current}${suffix}`;
  }, 25);
}

// ==================================================
// 13. TOAST NOTIFICATIONS & MODALS
// ==================================================
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary-cyan)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function openModal(modalId) {
  sounds.click();
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  sounds.click();
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// ==================================================
// 14. THEME & DIFFICULTY TOGGLERS
// ==================================================
function toggleTheme() {
  const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
  appState.theme = newTheme;
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  sounds.click();

  const themeIcon = document.getElementById('theme-toggle-icon');
  if (themeIcon) {
    themeIcon.innerHTML = newTheme === 'dark' 
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  }

  showToast(`Switched to ${newTheme} mode.`);
}

function toggleSound() {
  appState.soundEnabled = !appState.soundEnabled;
  localStorage.setItem(STORAGE_KEYS.SOUND, appState.soundEnabled.toString());
  sounds.click();

  const icon = document.getElementById('sound-toggle-icon');
  if (icon) {
    icon.innerHTML = appState.soundEnabled
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
  }

  showToast(`Audio cues ${appState.soundEnabled ? 'enabled' : 'muted'}.`);
}

function practiceSpecificTheme(themeKey) {
  appState.activePracticeTheme = themeKey;
  // Opening difficulty selection with practice theme chosen
  navigateToView('tests');
  showToast(`Practice Theme: ${WEBSITE_THEMES[themeKey] ? WEBSITE_THEMES[themeKey].name : themeKey}`);
}

// ==================================================
// 15. INITIALIZATION & BINDINGS
// ==================================================
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute('data-theme', appState.theme);
  const themeIcon = document.getElementById('theme-toggle-icon');
  if (themeIcon) {
    themeIcon.innerHTML = appState.theme === 'dark' 
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  }
  initAmbientCanvas();
  highlightSelectedDifficultyCards();
  updateHomeStats();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      closeMobileMenu();
    }
  });

  // Close mobile nav when clicking anywhere outside
  document.addEventListener('click', (e) => {
    const navLinks = document.querySelector('.nav-links');
    const toggleBtn = document.getElementById('mobile-menu-toggle-btn');
    if (navLinks && navLinks.classList.contains('mobile-open')) {
      if (!navLinks.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        closeMobileMenu();
      }
    }
  });
});

// Expose key methods globally for inline markup handlers
window.navigateToView = navigateToView;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.selectDifficulty = selectDifficulty;
window.startMemoryTest = startMemoryTest;
window.startMemoryTestWithDifficulty = startMemoryTestWithDifficulty;
window.startMemoryTestWithCurrentDifficulty = startMemoryTestWithCurrentDifficulty;
window.handleReadyNowClick = handleReadyNowClick;
window.continueToQuestions = continueToQuestions;
window.selectAnswer = selectAnswer;
window.submitAnswers = submitAnswers;
window.openClearHistoryModal = openClearHistoryModal;
window.executeClearHistory = executeClearHistory;
window.resetAllProgressData = resetAllProgressData;
window.reviewHistoricalTest = reviewHistoricalTest;
window.toggleTheme = toggleTheme;
window.toggleSound = toggleSound;
window.practiceSpecificTheme = practiceSpecificTheme;
window.startDifferenceMode = startDifferenceMode;
window.closeDiffModeModal = closeDiffModeModal;
window.handleDiffPreviewClick = handleDiffPreviewClick;
window.verifyDifferenceGuess = verifyDifferenceGuess;
window.startSequenceMode = startSequenceMode;
window.restartSequenceRound = restartSequenceRound;
window.handleSequenceTileClick = handleSequenceTileClick;
window.startAttentionMode = startAttentionMode;
window.openModal = openModal;
window.closeModal = closeModal;
