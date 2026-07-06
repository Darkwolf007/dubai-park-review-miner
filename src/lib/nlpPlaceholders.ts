export interface Review {
  parkName: string;
  placeId: string;
  authorName: string;
  rating: number;
  reviewText: string;
  publishedTimeStr?: string;
  publishedAtDate?: string;
  language?: string;
  source: string;
  extractedDate: string;
}

export interface NLPAnalyzedReview extends Review {
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  keywords: string[];
  topic: string;
  issueCategory: string;
  designRequirement: string;
  categoryConfidence?: number;
}

const ISSUE_KEYWORDS: { category: string; keywords: string[]; designRec: string }[] = [
  {
    category: 'shade / heat comfort',
    keywords: ['shade', 'heat', 'hot', 'sun', 'temperature', 'burning', 'sweat', 'summer', 'canopy'],
    designRec: 'Incorporate bioclimatic tensile membrane structures and high-density broadleaf mature tree canopies (e.g., Ficus nitida) over playgrounds and primary paths.'
  },
  {
    category: 'toilets',
    keywords: ['toilet', 'restroom', 'wc', 'bathroom', 'washroom'],
    designRec: 'Optimize municipal utility distribution with smart, self-cleaning unisex restroom kiosks placed within a 3-minute walking radius of high-density nodes.'
  },
  {
    category: 'cleanliness',
    keywords: ['clean', 'dirty', 'litter', 'trash', 'garbage', 'bin', 'waste', 'smell', 'messy'],
    designRec: 'Implement automated solar-powered waste compactor bins and organize strategic service corridors for clean, unobtrusive waste management.'
  },
  {
    category: 'parking',
    keywords: ['parking', 'car', 'vehicle', 'drive', 'garage', 'space'],
    designRec: 'Establish high-permeability grass pavement parking bays with bioswales to filter stormwater runoff and solar-panel shade carports.'
  },
  {
    category: 'safety',
    keywords: ['safe', 'security', 'guard', 'dangerous', 'dark', 'fence', 'gate', 'kid safe', 'police'],
    designRec: 'Implement passive surveillance design (CPTED) by maintaining clear sightlines across active corridors and establishing visible eco-guard posts.'
  },
  {
    category: 'playground',
    keywords: ['playground', 'slide', 'kid', 'child', 'swing', 'play', 'toddler', 'toy', 'family'],
    designRec: 'Deploy sensory-rich, multi-generational inclusive play equipment with safety-compliant poured-in-place (PIP) rubber heat-insulated surfaces.'
  },
  {
    category: 'accessibility',
    keywords: ['wheelchair', 'ramp', 'stroller', 'accessible', 'disabled', 'path', 'walkway', 'step', 'slope'],
    designRec: 'Enforce universal access guidelines (ADA standard) with a 1:12 maximum ramp slope, tactile paving, and continuous step-free pathway loops.'
  },
  {
    category: 'lighting',
    keywords: ['light', 'night', 'dark', 'evening', 'lamp', 'illuminate', 'lantern', 'bright'],
    designRec: 'Install dimmable, high-efficiency solar LED pole fixtures with localized light spill shields to maintain safety while avoiding light pollution.'
  },
  {
    category: 'crowding',
    keywords: ['crowd', 'busy', 'packed', 'full', 'popular', 'rowdy', 'quiet', 'peace', 'peaceful'],
    designRec: 'Introduce spatial buffering through curvilinear pathway layout, vegetated berms, and pocket seating nodes to separate high-activity and quiet zones.'
  },
  {
    category: 'maintenance',
    keywords: ['maintenance', 'broken', 'old', 'repair', 'fix', 'damage', 'neglect', 'rusty', 'care'],
    designRec: 'Specify regional materials with high architectural resilience (such as GRC, localized limestone, or composite wood) to reduce long-term operational wear.'
  },
  {
    category: 'seating',
    keywords: ['bench', 'seat', 'sit', 'chair', 'table', 'rest', 'furniture'],
    designRec: 'Integrate custom-designed precast concrete benches with natural wood slats, oriented in shaded cluster groupings to promote social interaction.'
  },
  {
    category: 'sports facilities',
    keywords: ['sport', 'run', 'jog', 'track', 'tennis', 'basket', 'gym', 'football', 'workout', 'exercise'],
    designRec: 'Introduce porous running tracks (synthetic EPDM) and separate high-impact active court zones from passive lawns with layered planting screens.'
  },
  {
    category: 'pets',
    keywords: ['dog', 'pet', 'cat', 'animal', 'bark'],
    designRec: 'Incorporate fenced double-gated dog parks with specialized sand/turf zones, self-draining wash stations, and dedicated pet waste disposal.'
  },
  {
    category: 'food / cafe',
    keywords: ['food', 'cafe', 'coffee', 'restaurant', 'eat', 'snack', 'kiosk', 'vendor', 'drink'],
    designRec: 'Design architectural modular food pavilions wrapped in vegetative green screens, providing shaded outdoor seating with views of water features.'
  },
  {
    category: 'water features',
    keywords: ['water', 'fountain', 'lake', 'pond', 'stream', 'splash', 'pool', 'canal', 'bridge'],
    designRec: 'Utilize low-evaporation, graywater-recirculating naturalized wetlands or dynamic zero-depth splash decks that double as microclimatic coolers.'
  },
  {
    category: 'landscape / greenery',
    keywords: ['green', 'tree', 'plant', 'flower', 'grass', 'lawn', 'landscape', 'garden', 'nature', 'flora', 'palm'],
    designRec: 'Specify drought-tolerant, native xerophytic plant species (e.g., Ghaf tree, Pennisetum) integrated with smart, sensor-driven drip irrigation.'
  }
];

// Helper to analyze a single review locally using rules
export function analyzeReviewLocally(review: Review): NLPAnalyzedReview {
  const text = (review.reviewText || '').toLowerCase();
  
  // 1. Sentiment analysis
  let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
  const posWords = ['love', 'beautiful', 'great', 'excellent', 'amazing', 'good', 'wonderful', 'nice', 'pleasant', 'best', 'clean', 'perfect'];
  const negWords = ['hot', 'shade', 'crowded', 'dirty', 'toilet', 'poor', 'uncomfortable', 'broken', 'disappointed', 'bad', 'expensive', 'smell', 'no shade'];
  
  let posCount = 0;
  let negCount = 0;
  
  posWords.forEach(w => { if (text.includes(w)) posCount++; });
  negWords.forEach(w => { if (text.includes(w)) negCount++; });

  if (review.rating >= 4) {
    sentiment = negCount > posCount + 1 ? 'NEUTRAL' : 'POSITIVE';
  } else if (review.rating <= 2) {
    sentiment = 'NEGATIVE';
  } else {
    // rating is 3
    if (negCount > posCount) {
      sentiment = 'NEGATIVE';
    } else if (posCount > negCount) {
      sentiment = 'POSITIVE';
    } else {
      sentiment = 'NEUTRAL';
    }
  }

  // 2. Keyword extraction
  const keywords: string[] = [];
  const words = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").split(/\s+/);
  const commonStopwords = new Set(['the', 'a', 'and', 'to', 'in', 'is', 'it', 'for', 'of', 'with', 'on', 'at', 'this', 'that', 'are', 'but', 'as', 'very', 'park', 'dubai', 'parks']);
  
  const wordFreq: { [key: string]: number } = {};
  words.forEach(w => {
    if (w.length > 3 && !commonStopwords.has(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  });

  const sortedWords = Object.keys(wordFreq).sort((a, b) => wordFreq[b] - wordFreq[a]);
  keywords.push(...sortedWords.slice(0, 5));

  // 3. Issue Category & Design Requirement
  let issueCategory = 'general landscape';
  let designRequirement = 'Incorporate native planting screens and high-durability modern street furniture aligned with standard Dubai public park design patterns.';
  
  let maxScore = 0;
  ISSUE_KEYWORDS.forEach(item => {
    let score = 0;
    item.keywords.forEach(kw => {
      if (text.includes(kw)) {
        score += 1;
        // give weight to exact match in short text
        if (new RegExp(`\\b${kw}\\b`).test(text)) {
          score += 1;
        }
      }
    });
    
    // adjust based on rating (negative rating highlights negative issues)
    if (score > maxScore) {
      maxScore = score;
      issueCategory = item.category;
      designRequirement = item.designRec;
    }
  });

  // 4. Topic Clustering
  let topic = 'Leisure & Park Infrastructure';
  if (issueCategory === 'shade / heat comfort' || issueCategory === 'landscape / greenery' || issueCategory === 'water features') {
    topic = 'Microclimate & Environmental Design';
  } else if (issueCategory === 'sports facilities' || issueCategory === 'playground' || issueCategory === 'pets') {
    topic = 'Recreation, Play & Active Zones';
  } else if (issueCategory === 'toilets' || issueCategory === 'cleanliness' || issueCategory === 'parking' || issueCategory === 'maintenance') {
    topic = 'Operational Facilities & Maintenance';
  } else if (issueCategory === 'safety' || issueCategory === 'lighting' || issueCategory === 'accessibility' || issueCategory === 'seating') {
    topic = 'Universal Access & Street Furniture';
  }

  // categoryConfidence: normalize the winning keyword-match score into a 0-1 band.
  // A score of 0 (fell through to the 'general landscape' default) is a low-confidence guess;
  // a score of ~4+ (multiple exact-boundary keyword hits) is treated as fully confident.
  const categoryConfidence = maxScore === 0 ? 0.3 : Math.min(1, 0.5 + maxScore / 8);

  return {
    ...review,
    sentiment,
    keywords,
    topic,
    issueCategory,
    designRequirement,
    categoryConfidence
  };
}

// Bulk process reviews locally
export function analyzeReviewsLocally(reviews: Review[]): NLPAnalyzedReview[] {
  return reviews.map(analyzeReviewLocally);
}

/**
 * Loose, multi-label version of the classification in analyzeReviewLocally:
 * returns every category whose keywords appear at all (score >= 1), not just
 * the single winning category. A review often touches multiple issues at
 * once ("hot and no shade near the benches"), which analyzeReviewLocally
 * collapses to one category by design -- this is what the co-occurrence
 * network needs instead.
 */
export function matchAllCategories(text: string): string[] {
  const lower = (text || '').toLowerCase();
  const matched: string[] = [];
  ISSUE_KEYWORDS.forEach(item => {
    const hit = item.keywords.some(kw => lower.includes(kw));
    if (hit) matched.push(item.category);
  });
  return matched;
}
