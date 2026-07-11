import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

import { PRESEEDED_PARKS } from './src/lib/googlePlaces.js';
import { analyzeReviewLocally } from './src/lib/nlpPlaceholders.js';
import fs from 'fs';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- GIS static dataset loader (Playground tab) ---
// Same 3-path fallback pattern as the Apify dataset loader above, applied to
// the pre-converted GeoJSON files under dataset/gis/ (see scripts/convert_gis_data.py).
const gisFileCache = new Map<string, any>();

function resolveGisFile(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'dataset', 'gis', filename),
    path.join(__dirname, '..', 'dataset', 'gis', filename),
    path.join(__dirname, 'dataset', 'gis', filename)
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function loadGisJson(filename: string): any | null {
  if (gisFileCache.has(filename)) return gisFileCache.get(filename);
  const filePath = resolveGisFile(filename);
  if (!filePath) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  gisFileCache.set(filename, data);
  return data;
}

function geometryBBox(geometry: any): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const walk = (coords: any): void => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      coords.forEach(walk);
    }
  };
  walk(geometry.coordinates);
  return [minLng, minLat, maxLng, maxLat];
}

function bboxIntersects(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// Buildings/roads are too large (~9MB/~15MB as GeoJSON) to ship whole -- gated by bbox.
const BBOX_GATED_LAYERS = new Set(['buildings', 'roads']);
const MAX_FEATURES_PER_RESPONSE = 4000;

app.get('/api/gis/manifest', (req, res) => {
  const manifest = loadGisJson('manifest.json');
  if (!manifest) {
    return res.status(404).json({ error: 'GIS manifest not found. Run scripts/convert_gis_data.py first.' });
  }
  const roadStats = loadGisJson('road_stats.json');
  const spaceSyntaxStats = loadGisJson('space_syntax_stats.json');
  const accessibilityStats = loadGisJson('accessibility_stats.json');
  res.json({ ...manifest, roadStats, spaceSyntaxStats, accessibilityStats });
});

app.get('/api/gis/layer/:name', (req, res) => {
  const { name } = req.params;
  const data = loadGisJson(`${name}.geojson`);
  if (!data) {
    return res.status(404).json({ error: `Layer '${name}' not found` });
  }

  if (!BBOX_GATED_LAYERS.has(name) || !req.query.bbox) {
    return res.json(data);
  }

  const bboxParts = String(req.query.bbox).split(',').map(Number);
  if (bboxParts.length !== 4 || bboxParts.some(n => isNaN(n))) {
    return res.status(400).json({ error: 'bbox query param must be minLng,minLat,maxLng,maxLat' });
  }
  const queryBbox = bboxParts as [number, number, number, number];

  const matched = data.features.filter((f: any) => bboxIntersects(geometryBBox(f.geometry), queryBbox));
  const truncated = matched.length > MAX_FEATURES_PER_RESPONSE;
  const features = truncated ? matched.slice(0, MAX_FEATURES_PER_RESPONSE) : matched;

  res.json({ type: 'FeatureCollection', features, truncated, matchedCount: matched.length });
});

  // API Route: Get Park Details and Reviews (Google Places API Proxy)
  app.get('/api/places/details', async (req, res) => {
    const { placeId } = req.query;

    if (!placeId || typeof placeId !== 'string') {
      return res.status(400).json({ error: 'placeId query parameter is required' });
    }

    // Identify standard preseeded park
    const preseededPark = PRESEEDED_PARKS.find(p => p.placeId === placeId);

    const APIFY_DATASETS: Record<string, { filename: string, name: string }> = {
      'ChIJW2n2fB9tXz4R3Gqf-661oQE': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_16-00-40-982.json', name: 'Al Safa 2 Park' },
      'ChIJ_4r62FpCXz4R7K0_5nO00w0': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_19-31-06-619.json', name: 'Zabeel Park' },
      'ChIJK5g4bKNoXz4RHm7pI_U_mHk': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_19-39-19-281.json', name: 'Safa Park' },
      'ChIJb6e9Z0lCXz4Rt_41A7N_s7A': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_19-41-50-179.json', name: 'Creek Park' },
      'ChIJUmmSuqeim123': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_19-56-57-274.json', name: 'Umm Suqeim Park' },
      'ChIJJ67g-5doXz4RH84_s7N0w0': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_20-04-15-265.json', name: 'Al Khazzan Park' },
      'ChIJhXfP-wVqXz4R9R_f-661oQE': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_20-07-53-370.json', name: 'Al Barsha Pond Park' },
      'ChIJ_al_mankhool_park': { filename: 'dataset_Google-Maps-Reviews-Scraper_2026-07-05_20-10-40-200.json', name: 'Al Mankhool Park' }
    };

    if (APIFY_DATASETS[placeId as string]) {
      console.log(`[Dataset Loader] Attempting to load dataset for Place ID: ${placeId} (${APIFY_DATASETS[placeId as string].name})`);
      try {
        let datasetPath = path.join(process.cwd(), 'dataset', APIFY_DATASETS[placeId as string].filename);
        console.log(`[Dataset Loader] Checking process.cwd path: ${datasetPath} (exists: ${fs.existsSync(datasetPath)})`);

        if (!fs.existsSync(datasetPath)) {
          datasetPath = path.join(__dirname, '..', 'dataset', APIFY_DATASETS[placeId as string].filename);
          console.log(`[Dataset Loader] Checking __dirname parent path: ${datasetPath} (exists: ${fs.existsSync(datasetPath)})`);
        }
        if (!fs.existsSync(datasetPath)) {
          datasetPath = path.join(__dirname, 'dataset', APIFY_DATASETS[placeId as string].filename);
          console.log(`[Dataset Loader] Checking __dirname direct path: ${datasetPath} (exists: ${fs.existsSync(datasetPath)})`);
        }

        if (fs.existsSync(datasetPath)) {
          const rawData = fs.readFileSync(datasetPath, 'utf8');
          console.log(`[Dataset Loader] Successfully read file. Size: ${rawData.length} bytes.`);
          const apifyReviews = JSON.parse(rawData);
          const mappedReviews = apifyReviews
            .filter((r: any) => r.text && r.text.trim().length > 0)
            .map((r: any) => ({
              parkName: APIFY_DATASETS[placeId as string].name,
              placeId: placeId,
              authorName: r.name || 'Anonymous',
              rating: r.stars || 0,
              reviewText: r.textTranslated || r.text || '',
              publishedTimeStr: r.publishAt || 'Unknown',
              publishedAtDate: r.publishedAtDate || undefined,
              language: 'en',
              source: 'Apify Scraped Dataset',
              extractedDate: new Date().toISOString().split('T')[0]
            }));
          
          let parkToReturn = preseededPark ? JSON.parse(JSON.stringify(preseededPark)) : {
            placeId,
            name: APIFY_DATASETS[placeId as string].name,
            formattedAddress: 'Dubai, United Arab Emirates',
            lat: 25.2,
            lng: 55.2,
            rating: 4.5,
            userRatingsTotal: mappedReviews.length,
            openingHours: ['Open 24 hours'],
            types: ['park'],
            mapsUrl: `https://maps.google.com/?q=place_id:${placeId}`,
            reviews: []
          };
          
          parkToReturn.reviews = mappedReviews;
          parkToReturn.userRatingsTotal = mappedReviews.length;
          
          console.log(`[Dataset Loader] Loaded and mapped ${mappedReviews.length} reviews for ${APIFY_DATASETS[placeId as string].name}`);
          return res.json(parkToReturn);
        } else {
          console.warn(`[Dataset Loader] Dataset file not found in any checked location for Place ID: ${placeId}`);
        }
      } catch (err) {
        console.error('[Dataset Loader] Error loading Apify dataset:', err);
      }
    }

    // Get API Key from various sources
    const apiKey = 
      process.env.GOOGLE_MAPS_PLATFORM_KEY || 
      process.env.VITE_GOOGLE_MAPS_API_KEY || 
      req.headers['x-google-maps-api-key'];

    if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey === 'MY_GOOGLE_MAPS_API_KEY') {
      console.log(`No active Google Places API Key. Serving pre-seeded data for Place ID: ${placeId}`);
      if (preseededPark) {
        return res.json(preseededPark);
      }
      // If custom manually-added place ID, we fall back to generating dynamic local details in frontend or standard fallback
      return res.json({
        placeId,
        name: `Custom Location (${placeId.slice(0, 8)})`,
        formattedAddress: 'Manual Entry Location, Dubai, UAE',
        lat: 25.2048,
        lng: 55.2708,
        rating: 4.5,
        userRatingsTotal: 310,
        openingHours: ['Open 24 hours'],
        types: ['park', 'establishment'],
        mapsUrl: `https://maps.google.com/?q=place_id:${placeId}`,
        reviews: [
          {
            parkName: `Custom Location (${placeId.slice(0, 8)})`,
            placeId,
            authorName: 'Academic Reviewer (Local Mode)',
            rating: 4,
            reviewText: 'Fascinating custom study area. High operational potential but needs microclimate mitigation such as more shade trees or active cooling water structures.',
            publishedTimeStr: 'Recently',
            language: 'en',
            source: 'Google Places (Fallback)',
            extractedDate: new Date().toISOString().split('T')[0]
          }
        ]
      });
    }

    try {
      console.log(`Querying Google Places API for Place ID: ${placeId}`);
      
      // Call Google Places Details REST API (Legacy Details API matches standard fields)
      const googleApiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${apiKey}&fields=name,formatted_address,geometry,rating,user_ratings_total,opening_hours,types,website,formatted_phone_number,url,reviews`;
      
      const response = await fetch(googleApiUrl);
      if (!response.ok) {
        throw new Error(`Google API request failed with status: ${response.status}`);
      }
      
      const googleData = await response.json();
      
      if (googleData.status !== 'OK') {
        throw new Error(`Google Places API returned status: ${googleData.status}. Message: ${googleData.error_message || 'No additional details'}`);
      }

      const result = googleData.result;
      
      // Map API reviews to internal structure
      const fetchedReviews = (result.reviews || []).map((rev: any) => ({
        parkName: result.name || 'Unknown Park',
        placeId: placeId,
        authorName: rev.author_name || 'Anonymous',
        rating: rev.rating || 3,
        reviewText: rev.text || '',
        publishedTimeStr: rev.relative_time_description || 'some time ago',
        publishedAtDate: typeof rev.time === 'number' ? new Date(rev.time * 1000).toISOString() : undefined,
        language: rev.language || 'en',
        source: 'Google Places API (Live)',
        extractedDate: new Date().toISOString().split('T')[0]
      }));

      // Map entire details to match ParkDetails type
      const parkDetails = {
        placeId,
        name: result.name || 'Unknown Park',
        formattedAddress: result.formatted_address || 'Dubai, UAE',
        lat: result.geometry?.location?.lat || 25.2048,
        lng: result.geometry?.location?.lng || 55.2708,
        rating: result.rating || 0,
        userRatingsTotal: result.user_ratings_total || 0,
        openingHours: result.opening_hours?.weekday_text || ['Opening hours not available'],
        types: result.types || ['park'],
        website: result.website,
        phoneNumber: result.formatted_phone_number,
        mapsUrl: result.url || `https://maps.google.com/?q=place_id:${placeId}`,
        reviews: fetchedReviews
      };

      return res.json(parkDetails);
    } catch (error: any) {
      console.error('Google Places Proxy Error:', error);
      // Return preseeded as ultimate fallback so the application doesn't crash
      if (preseededPark) {
        console.warn('Falling back to preseeded park due to Google API proxy failure.');
        return res.json(preseededPark);
      }
      return res.status(500).json({ error: error.message || 'Failed to fetch places details' });
    }
  });

  // API Route: Run NLP Sentiment & Design Requirements Analysis via Gemini
  app.post('/api/nlp-analyze', async (req, res) => {
    const { reviews } = req.body;

    if (!reviews || !Array.isArray(reviews)) {
      return res.status(400).json({ error: 'reviews array is required' });
    }

    if (reviews.length === 0) {
      return res.json([]);
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
      console.log('No GEMINI_API_KEY configured. Falling back to local rule-based NLP processing.');
      const localResults = reviews.map(rev => {
        const analyzed = analyzeReviewLocally(rev);
        return {
          ...analyzed,
          source: `${analyzed.source} (Offline NLP Fallback)`
        };
      });
      return res.json({
        analyzedReviews: localResults,
        engine: 'Local Offline NLP Engine'
      });
    }

    try {
      console.log(`Running Gemini NLP analysis on ${reviews.length} reviews`);
      
      // Initialize Gemini client with proper user-agent telemetry
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      // Prepare reviews in a single condensed prompt to conserve tokens
      const promptInput = reviews.map((rev, index) => ({
        id: index,
        parkName: rev.parkName,
        rating: rev.rating,
        text: rev.reviewText
      }));

      const systemInstruction = `You are an expert Landscape Architecture Professor and Landscape Design Specialist.
Your task is to perform advanced NLP / thematic sentiment analysis on a batch of park reviews.
For each review, determine:
1. Sentiment: Must be either 'POSITIVE', 'NEUTRAL', or 'NEGATIVE'.
2. Keywords: Extract 3-5 highly descriptive nouns/adjectives related to the landscape design, park planning, microclimate, or facilities mentioned.
3. Topic: Classify into one of these research topics:
   - 'Microclimate & Environmental Design' (e.g., shade, heat comfort, flora, water features)
   - 'Recreation, Play & Active Zones' (e.g., sports, playground, pets)
   - 'Operational Facilities & Maintenance' (e.g., toilets, cleanliness, waste, parking)
   - 'Universal Access & Street Furniture' (e.g., accessibility, lighting, safety, seating)
   - 'Leisure & General Landscape' (anything else)
4. Issue Category: Classify into EXACTLY one of these standard landscape design categories:
   - 'shade / heat comfort'
   - 'toilets'
   - 'cleanliness'
   - 'parking'
   - 'safety'
   - 'playground'
   - 'accessibility'
   - 'lighting'
   - 'crowding'
   - 'maintenance'
   - 'seating'
   - 'sports facilities'
   - 'pets'
   - 'food / cafe'
   - 'water features'
   - 'landscape / greenery'
5. Design Requirement: Write a professional, highly specific, and practical landscape architectural design recommendation or spatial solution that directly addresses the issue or maintains the positive qualities highlighted in the review text. Use professional terminology (e.g., 'permeable surfaces', 'thermal comfort', 'native flora', 'xerophytic species', 'Ghaf trees', 'solar bioswales'). Do not write generic advice.`;

      const contents = `Analyze the following park reviews and output a JSON array of analysis objects corresponding to each review in the exact order:
${JSON.stringify(promptInput, null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: "The ID matching the index of the review in the input list." },
                sentiment: { type: Type.STRING, description: "Must be POSITIVE, NEUTRAL, or NEGATIVE" },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 to 5 key terms" },
                topic: { type: Type.STRING, description: "One of the 5 listed topics" },
                issueCategory: { type: Type.STRING, description: "One of the 16 listed categories" },
                designRequirement: { type: Type.STRING, description: "Concrete, professional landscape recommendation." }
              },
              required: ["id", "sentiment", "keywords", "topic", "issueCategory", "designRequirement"]
            }
          }
        }
      });

      const textOutput = response.text || '[]';
      console.log('Gemini raw response fetched.');
      
      const parsedResults = JSON.parse(textOutput);

      // Merge Gemini results back into the original reviews
      const analyzedReviews = reviews.map((rev, index) => {
        // Find matching analysis by ID or index fallback
        const analysis = parsedResults.find((r: any) => r.id === index) || parsedResults[index] || {};
        return {
          ...rev,
          sentiment: (analysis.sentiment || 'NEUTRAL').toUpperCase() as any,
          keywords: analysis.keywords || ['landscape', 'park'],
          topic: analysis.topic || 'Leisure & General Landscape',
          issueCategory: analysis.issueCategory || 'landscape / greenery',
          designRequirement: analysis.designRequirement || 'Enhance planting diversity and introduce passive shade design structures.',
          categoryConfidence: 0.85,
          source: `${rev.source} + Gemini 3.5 AI Analysis`
        };
      });

      return res.json({
        analyzedReviews,
        engine: 'Gemini 3.5 Flash Model'
      });
    } catch (error: any) {
      console.error('Gemini NLP Analysis Error, falling back to local processing:', error);
      // Fail-safe fallback to local analysis
      const localResults = reviews.map(rev => {
        const analyzed = analyzeReviewLocally(rev);
        return {
          ...analyzed,
          source: `${analyzed.source} (Offline NLP Fallback)`
        };
      });
      return res.json({
        analyzedReviews: localResults,
        engine: 'Local Offline NLP Engine (Fallback due to error)'
      });
    }
  });

  // API Route: AI Design Assistant (Playground tab) -- synthesizes real computed
  // GIS + review-NLP metrics into a design strategy. Same Gemini-with-template-
  // fallback pattern as /api/nlp-analyze above; the metrics bundle is always
  // real evidence computed client-side (population, coverage, road density,
  // amenity counts, top review issues) -- Gemini is asked to reason over it,
  // never to invent numbers of its own.
  app.post('/api/design-strategy', async (req, res) => {
    const { metrics } = req.body;

    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'metrics object is required' });
    }

    function buildTemplateStrategy() {
      const {
        population = 0, popDensityKm2 = 0, buildingCoveragePct = 0, greenCoveragePct = 0,
        amenityTotal = 0, topIssues = []
      } = metrics;

      const keyProblems: string[] = [];
      const designOpportunities: string[] = [];
      const recommendedInterventions: string[] = [];
      const supportingEvidence: string[] = [];

      if (greenCoveragePct < 15) {
        keyProblems.push(`Green coverage is low at ${greenCoveragePct.toFixed(1)}% of the analyzed area.`);
        designOpportunities.push('Significant opportunity to expand tree canopy and planted area.');
        recommendedInterventions.push('Introduce native xerophytic planting and shade tree corridors along primary pedestrian routes.');
        supportingEvidence.push(`Green coverage: ${greenCoveragePct.toFixed(1)}% (H3 grid analysis)`);
      }
      if (buildingCoveragePct > 40) {
        keyProblems.push(`Building coverage is high at ${buildingCoveragePct.toFixed(1)}%, limiting open/green space.`);
        supportingEvidence.push(`Building coverage: ${buildingCoveragePct.toFixed(1)}% (OSM building footprints)`);
      }
      (topIssues as any[]).slice(0, 3).forEach(issue => {
        keyProblems.push(`Reviewers frequently cite "${issue.category}" issues (${issue.mentions} mentions, ${issue.priority} priority).`);
        recommendedInterventions.push(issue.designRequirement || `Address ${issue.category} concerns raised in park reviews.`);
        supportingEvidence.push(`${issue.mentions} reviews mention ${issue.category} (priority index ${issue.priorityIndex})`);
      });
      if (popDensityKm2 > 5000) {
        designOpportunities.push('High surrounding population density supports investment in higher-capacity park infrastructure.');
        supportingEvidence.push(`Population density: ${Math.round(popDensityKm2)} per km² (H3 aggregation)`);
      }
      if (amenityTotal > 0) {
        supportingEvidence.push(`${amenityTotal} community amenities counted within the analyzed grid.`);
      }

      const priorityScore = Math.max(0, Math.min(100, Math.round(
        (100 - greenCoveragePct) * 0.3 +
        (topIssues[0]?.priorityIndex || 0) * 0.4 +
        Math.min(100, popDensityKm2 / 100) * 0.3
      )));
      const aiConfidenceScore = Math.min(95, 35 + supportingEvidence.length * 8);

      return {
        siteSummary: `Al Safa 2 Park sits in an area with an estimated ${Math.round(population)} residents (${Math.round(popDensityKm2)}/km²), ${buildingCoveragePct.toFixed(1)}% building coverage, and ${greenCoveragePct.toFixed(1)}% green coverage within the analyzed H3 grid.`,
        keyProblems: keyProblems.length ? keyProblems : ['No significant problems detected in the available data.'],
        designOpportunities: designOpportunities.length ? designOpportunities : ['Insufficient data to identify additional opportunities.'],
        recommendedInterventions: recommendedInterventions.length ? recommendedInterventions : ['Insufficient data to recommend specific interventions.'],
        priorityScore,
        supportingEvidence,
        aiConfidenceScore
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
      console.log('No GEMINI_API_KEY configured. Using template design-strategy synthesis.');
      return res.json({ ...buildTemplateStrategy(), engine: 'Template Synthesis (Offline)' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const systemInstruction = `You are an expert landscape architecture and urban planning consultant. You will be given real, pre-computed site evidence (population, building/green coverage, road density, amenity counts, and review-derived issue priorities) for a public park in Dubai. Synthesize this into a design strategy. Use ONLY the numbers provided -- do not invent statistics. Every item in supportingEvidence must reference a number that was actually given to you.`;

      const contents = `Site evidence:\n${JSON.stringify(metrics, null, 2)}\n\nGenerate a design strategy grounded strictly in this evidence.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              siteSummary: { type: Type.STRING },
              keyProblems: { type: Type.ARRAY, items: { type: Type.STRING } },
              designOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedInterventions: { type: Type.ARRAY, items: { type: Type.STRING } },
              priorityScore: { type: Type.INTEGER, description: '0-100' },
              supportingEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
              aiConfidenceScore: { type: Type.INTEGER, description: '0-100' }
            },
            required: ['siteSummary', 'keyProblems', 'designOpportunities', 'recommendedInterventions', 'priorityScore', 'supportingEvidence', 'aiConfidenceScore']
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ ...parsed, engine: 'Gemini 3.5 Flash Model' });
    } catch (error: any) {
      console.error('Design Strategy Gemini Error, falling back to template:', error);
      return res.json({ ...buildTemplateStrategy(), engine: 'Template Synthesis (Fallback due to error)' });
    }
  });

  // API Route: Population Analysis AI Interpretation (Playground -> Population module).
  // Same Gemini-with-template-fallback pattern as /api/design-strategy -- the
  // metrics bundle is always real evidence computed client-side from the H3
  // grid, catchment rings, and demand metrics; Gemini reasons over it, never
  // invents numbers of its own.
  app.post('/api/population-insights', async (req, res) => {
    const { metrics } = req.body;

    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'metrics object is required' });
    }

    function buildTemplateInsights() {
      const {
        primaryCommunity = 'a mixed community', overallDemandLevel = 'MEDIUM', highestDemandZone = 'the surrounding area',
        aggregateDensityKm2 = 0, greenSpaceDeficitPct = 0, accessibilityScore = 0, pressureScore = 0, criticalMetrics = []
      } = metrics;

      const strengths: string[] = [];
      const weaknesses: string[] = [];
      const opportunities: string[] = [];
      const priorityRecommendations: { recommendation: string; evidence: string[]; priority: string; confidence: number }[] = [];

      if (accessibilityScore >= 60) {
        strengths.push('Strong accessibility -- good road and amenity connectivity around the site.');
      } else {
        weaknesses.push('Limited accessibility -- road/amenity connectivity is below a well-served urban benchmark.');
      }
      if (aggregateDensityKm2 >= 5000) {
        strengths.push('High surrounding population density supports strong potential park usage.');
      }
      if (greenSpaceDeficitPct > 30) {
        weaknesses.push(`Green space deficit of ~${Math.round(greenSpaceDeficitPct)}% against the WHO/UN-Habitat per-capita benchmark.`);
        opportunities.push('Expand green/planted area to close the per-capita green space gap.');
        priorityRecommendations.push({
          recommendation: 'Increase green and shaded open space',
          evidence: [`Green space deficit: ${Math.round(greenSpaceDeficitPct)}%`, `Population pressure score: ${pressureScore}/100`],
          priority: 'High',
          confidence: Math.min(95, 50 + criticalMetrics.length * 8)
        });
      }
      if (pressureScore >= 60) {
        weaknesses.push('High population pressure relative to available park capacity.');
        opportunities.push('Increase seating and gathering capacity to absorb peak demand.');
      }
      opportunities.push(`Prioritize improvements toward the ${highestDemandZone}, the highest-demand zone identified in this analysis.`);

      priorityRecommendations.push({
        recommendation: `Target design investment toward the ${highestDemandZone}`,
        evidence: [`Overall demand level: ${overallDemandLevel}`, `Primary community: ${primaryCommunity}`],
        priority: overallDemandLevel === 'HIGH' || overallDemandLevel === 'VERY HIGH' ? 'High' : 'Medium',
        confidence: Math.min(90, 45 + criticalMetrics.length * 7)
      });

      return {
        communityProfile: `The park primarily serves ${primaryCommunity.toLowerCase()}, with demand concentrated toward the ${highestDemandZone}. Overall demand is assessed as ${overallDemandLevel}.`,
        strengths: strengths.length ? strengths : ['No standout strengths identified from the available data.'],
        weaknesses: weaknesses.length ? weaknesses : ['No significant weaknesses identified from the available data.'],
        keyFindings: [
          `Aggregate surrounding population density: ${Math.round(aggregateDensityKm2).toLocaleString()} people/km².`,
          `${criticalMetrics.length} demand metric(s) flagged as critical priority.`
        ],
        designDrivers: opportunities.slice(0, 2),
        constraints: weaknesses.slice(0, 2),
        opportunities: opportunities.length ? opportunities : ['Insufficient data to identify additional opportunities.'],
        priorityRecommendations
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
      console.log('No GEMINI_API_KEY configured. Using template population-insights synthesis.');
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Offline)' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const systemInstruction = `You are an expert urban planner and landscape architect writing a Population Analysis interpretation for a public park in Dubai. You will be given real, pre-computed evidence (population, density, catchment, and demand metrics). Use ONLY the numbers provided -- do not invent statistics. Every recommendation's evidence array must reference a number that was actually given to you.`;

      const contents = `Population analysis evidence:\n${JSON.stringify(metrics, null, 2)}\n\nGenerate a planning interpretation grounded strictly in this evidence.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              communityProfile: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              keyFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
              designDrivers: { type: Type.ARRAY, items: { type: Type.STRING } },
              constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
              opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              priorityRecommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    recommendation: { type: Type.STRING },
                    evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                    priority: { type: Type.STRING, description: 'Low, Medium, or High' },
                    confidence: { type: Type.INTEGER, description: '0-100' }
                  },
                  required: ['recommendation', 'evidence', 'priority', 'confidence']
                }
              }
            },
            required: ['communityProfile', 'strengths', 'weaknesses', 'keyFindings', 'designDrivers', 'constraints', 'opportunities', 'priorityRecommendations']
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ ...parsed, engine: 'Gemini 3.5 Flash Model' });
    } catch (error: any) {
      console.error('Population Insights Gemini Error, falling back to template:', error);
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Fallback due to error)' });
    }
  });

  // API Route: Urban Analysis AI Interpretation (Playground -> Urban module).
  // Same Gemini-with-template-fallback pattern as /api/population-insights --
  // the metrics bundle is real evidence computed client-side from the H3 grid,
  // road network, land use, and morphology engines.
  app.post('/api/urban-insights', async (req, res) => {
    const { metrics } = req.body;

    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'metrics object is required' });
    }

    function buildTemplateInsights() {
      const {
        urbanCharacter = 'a mixed urban fabric', roadConnectivity = 'Medium', dominantLandUse = 'Residential',
        developmentPressure = 'Medium', buildingCoveragePct = 0, connectivityScore = 0, landUseDiversityIndex = 0,
        criticalMetrics = []
      } = metrics;

      const strengths: string[] = [];
      const weaknesses: string[] = [];
      const developmentOpportunities: string[] = [];
      const priorityInterventions: { intervention: string; evidence: string[]; priority: string; confidence: number }[] = [];

      if (roadConnectivity === 'High') {
        strengths.push('Strong road network connectivity supports good site access.');
      } else {
        weaknesses.push(`Road connectivity is ${String(roadConnectivity).toLowerCase()} -- access may be constrained in parts of the study area.`);
      }
      if (buildingCoveragePct > 35) {
        weaknesses.push(`High building coverage (${Math.round(buildingCoveragePct)}%) leaves limited unbuilt/green area.`);
        developmentOpportunities.push('Prioritize green/open space interventions where building coverage is highest.');
        priorityInterventions.push({
          intervention: 'Introduce green infrastructure in high-coverage zones',
          evidence: [`Building coverage: ${Math.round(buildingCoveragePct)}%`, `Development pressure: ${developmentPressure}`],
          priority: 'High',
          confidence: Math.min(95, 50 + criticalMetrics.length * 8)
        });
      }
      if (landUseDiversityIndex < 40) {
        weaknesses.push('Low land-use diversity -- the surrounding fabric leans toward a single dominant use.');
        developmentOpportunities.push('Introduce mixed-use or complementary program to diversify the immediate context.');
      } else {
        strengths.push('Reasonably diverse surrounding land use supports varied park users.');
      }
      developmentOpportunities.push(`Align design entrances/frontage with the ${String(dominantLandUse).toLowerCase()} fabric that dominates this catchment.`);

      priorityInterventions.push({
        intervention: `Strengthen park integration with the surrounding ${String(dominantLandUse).toLowerCase()} fabric`,
        evidence: [`Urban character: ${urbanCharacter}`, `Connectivity score: ${connectivityScore}/100`],
        priority: developmentPressure === 'High' ? 'High' : 'Medium',
        confidence: Math.min(90, 45 + criticalMetrics.length * 7)
      });

      return {
        urbanCharacter: `The site sits within ${urbanCharacter.toLowerCase ? urbanCharacter.toLowerCase() : urbanCharacter} fabric, with ${String(roadConnectivity).toLowerCase()} road connectivity and a dominant ${String(dominantLandUse).toLowerCase()} land use.`,
        strengths: strengths.length ? strengths : ['No standout strengths identified from the available data.'],
        weaknesses: weaknesses.length ? weaknesses : ['No significant weaknesses identified from the available data.'],
        constraints: weaknesses.slice(0, 2),
        developmentOpportunities: developmentOpportunities.length ? developmentOpportunities : ['Insufficient data to identify additional opportunities.'],
        designDrivers: developmentOpportunities.slice(0, 2),
        priorityInterventions
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
      console.log('No GEMINI_API_KEY configured. Using template urban-insights synthesis.');
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Offline)' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const systemInstruction = `You are an expert urban planner and urban designer writing an Urban Analysis interpretation for a public park in Dubai. You will be given real, pre-computed evidence (building, road network, land use, and morphology metrics). Use ONLY the numbers provided -- do not invent statistics. Every intervention's evidence array must reference a number that was actually given to you.`;

      const contents = `Urban analysis evidence:\n${JSON.stringify(metrics, null, 2)}\n\nGenerate a planning interpretation grounded strictly in this evidence.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              urbanCharacter: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
              developmentOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              designDrivers: { type: Type.ARRAY, items: { type: Type.STRING } },
              priorityInterventions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    intervention: { type: Type.STRING },
                    evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                    priority: { type: Type.STRING, description: 'Low, Medium, or High' },
                    confidence: { type: Type.INTEGER, description: '0-100' }
                  },
                  required: ['intervention', 'evidence', 'priority', 'confidence']
                }
              }
            },
            required: ['urbanCharacter', 'strengths', 'weaknesses', 'constraints', 'developmentOpportunities', 'designDrivers', 'priorityInterventions']
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ ...parsed, engine: 'Gemini 3.5 Flash Model' });
    } catch (error: any) {
      console.error('Urban Insights Gemini Error, falling back to template:', error);
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Fallback due to error)' });
    }
  });

  // API Route: Accessibility Analysis AI Interpretation (Playground -> Accessibility module).
  // Same Gemini-with-template-fallback pattern as /api/population-insights and /api/urban-insights --
  // the metrics bundle is real evidence computed client-side from network-routed walking catchments,
  // transit proximity, pedestrian network quality, and barrier-exposure fields.
  app.post('/api/accessibility-insights', async (req, res) => {
    const { metrics } = req.body;

    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'metrics object is required' });
    }

    function buildTemplateInsights() {
      const {
        overallAccessibilityScore = 0, walkabilityScore = 0, transitAccessibility = 'Moderate',
        mostUnderservedZone = 'the surrounding area', pop15MinWalkPct = 0, avgWalkingTimeMinutes = 0,
        deadEndCount = 0, barrierExposureLabel = 'Moderate', criticalMetrics = []
      } = metrics;

      const strengths: string[] = [];
      const weaknesses: string[] = [];
      const criticalBarriers: string[] = [];
      const underservedCommunities: string[] = [];
      const pedestrianDesignDrivers: string[] = [];
      const priorityInterventions: { intervention: string; evidence: string[]; priority: string; confidence: number }[] = [];

      if (walkabilityScore >= 60) {
        strengths.push('Strong pedestrian network quality -- good street connectivity and intersection density support walking.');
      } else {
        weaknesses.push(`Walkability score is ${walkabilityScore}/100 -- pedestrian network quality is below a well-served benchmark.`);
      }
      if (transitAccessibility === 'High') {
        strengths.push('Good transit proximity -- bus stops are well distributed near the site.');
      } else {
        weaknesses.push(`Transit accessibility is assessed as ${String(transitAccessibility).toLowerCase()} -- bus stop coverage is limited in parts of the catchment.`);
      }
      if (pop15MinWalkPct < 50) {
        weaknesses.push(`Only ${Math.round(pop15MinWalkPct)}% of the surrounding population falls within a 15-minute network walk of the park.`);
        underservedCommunities.push(`${mostUnderservedZone} shows the longest network walking times to the park.`);
        priorityInterventions.push({
          intervention: `Improve pedestrian connectivity toward the ${mostUnderservedZone}`,
          evidence: [`${Math.round(pop15MinWalkPct)}% of population within 15-minute walk`, `Average network walking time: ${avgWalkingTimeMinutes} min`],
          priority: 'High',
          confidence: Math.min(95, 50 + criticalMetrics.length * 8)
        });
      } else {
        strengths.push(`${Math.round(pop15MinWalkPct)}% of the surrounding population is within a 15-minute network walk of the park.`);
      }
      if (deadEndCount > 0) {
        criticalBarriers.push(`${deadEndCount.toLocaleString()} dead-end street segments fragment the surrounding pedestrian grid.`);
      }
      if (barrierExposureLabel === 'High') {
        criticalBarriers.push('High exposure to primary/secondary road barriers along likely walking routes to the park.');
        pedestrianDesignDrivers.push('Prioritize signalized or raised crossings where major roads intersect the walking catchment.');
      }
      pedestrianDesignDrivers.push('Reinforce the drivable street grid used for routing with continuous, shaded pedestrian frontage.');

      priorityInterventions.push({
        intervention: 'Add a shaded, direct walking route from the highest-population underserved zone',
        evidence: [`Overall accessibility score: ${overallAccessibilityScore}/100`, `Walkability score: ${walkabilityScore}/100`],
        priority: overallAccessibilityScore < 50 ? 'High' : 'Medium',
        confidence: Math.min(90, 45 + criticalMetrics.length * 7)
      });

      return {
        accessibilityProfile: `The park's network-based walking accessibility scores ${overallAccessibilityScore}/100 overall, with ${String(transitAccessibility).toLowerCase()} transit accessibility. ${Math.round(pop15MinWalkPct)}% of the surrounding population reaches the park within a 15-minute walk on the drivable street network; the ${mostUnderservedZone} lags furthest behind.`,
        strengths: strengths.length ? strengths : ['No standout strengths identified from the available data.'],
        weaknesses: weaknesses.length ? weaknesses : ['No significant weaknesses identified from the available data.'],
        criticalBarriers: criticalBarriers.length ? criticalBarriers : ['No major barrier concentrations identified from the available data.'],
        underservedCommunities: underservedCommunities.length ? underservedCommunities : ['No significantly underserved zone identified from the available data.'],
        pedestrianDesignDrivers,
        priorityInterventions
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
      console.log('No GEMINI_API_KEY configured. Using template accessibility-insights synthesis.');
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Offline)' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const systemInstruction = `You are an expert pedestrian planner and accessibility consultant writing an Accessibility Analysis interpretation for a public park in Dubai. You will be given real, pre-computed evidence (network-routed walking catchments, transit proximity, pedestrian network quality, and barrier-exposure metrics). Use ONLY the numbers provided -- do not invent statistics. Every intervention's evidence array must reference a number that was actually given to you.`;

      const contents = `Accessibility analysis evidence:\n${JSON.stringify(metrics, null, 2)}\n\nGenerate a planning interpretation grounded strictly in this evidence.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              accessibilityProfile: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              criticalBarriers: { type: Type.ARRAY, items: { type: Type.STRING } },
              underservedCommunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              pedestrianDesignDrivers: { type: Type.ARRAY, items: { type: Type.STRING } },
              priorityInterventions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    intervention: { type: Type.STRING },
                    evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                    priority: { type: Type.STRING, description: 'Low, Medium, or High' },
                    confidence: { type: Type.INTEGER, description: '0-100' }
                  },
                  required: ['intervention', 'evidence', 'priority', 'confidence']
                }
              }
            },
            required: ['accessibilityProfile', 'strengths', 'weaknesses', 'criticalBarriers', 'underservedCommunities', 'pedestrianDesignDrivers', 'priorityInterventions']
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ ...parsed, engine: 'Gemini 3.5 Flash Model' });
    } catch (error: any) {
      console.error('Accessibility Insights Gemini Error, falling back to template:', error);
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Fallback due to error)' });
    }
  });

  // API Route: Environmental Analysis AI Interpretation (Playground -> Environmental module).
  // Same Gemini-with-template-fallback pattern as the other three insights endpoints -- the
  // metrics bundle is real evidence from surface-composition proxies (this dataset has no
  // satellite/thermal/wind data) plus review-sentiment thermal-comfort/biodiversity scores.
  app.post('/api/environmental-insights', async (req, res) => {
    const { metrics } = req.body;

    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'metrics object is required' });
    }

    function buildTemplateInsights() {
      const {
        overallEnvironmentalScore = 0, greenCoveragePct = 0, imperviousSurfacePct = 0,
        thermalComfortScore = 0, biodiversityScore = 0, hotspotAreaPct = 0, peakHeatZone = 'the site',
        coolingOpportunityScore = 0, waterFeatureConcernScore = 0, criticalMetrics = []
      } = metrics;

      const strengths: string[] = [];
      const weaknesses: string[] = [];
      const constraints: string[] = [];
      const ecologicalOpportunities: string[] = [];
      const designDrivers: string[] = [];
      const priorityInterventions: { intervention: string; evidence: string[]; priority: string; confidence: number }[] = [];

      if (greenCoveragePct >= 25) {
        strengths.push(`Green coverage of ${Math.round(greenCoveragePct)}% is comparatively strong for this study area.`);
      } else {
        weaknesses.push(`Green coverage is only ${Math.round(greenCoveragePct)}% -- limited vegetated area to draw on for shade and cooling.`);
      }
      if (imperviousSurfacePct > 40) {
        weaknesses.push(`Estimated impervious surface is high (${Math.round(imperviousSurfacePct)}%), driving heat retention across much of the study area.`);
        constraints.push('High estimated impervious coverage limits where new hardscape can be added without worsening heat exposure.');
      }
      if (thermalComfortScore < 45) {
        weaknesses.push(`Thermal comfort (from visitor sentiment) is low at ${thermalComfortScore}/100 -- shade and heat comfort are recurring visitor complaints.`);
        priorityInterventions.push({
          intervention: `Create a shaded pedestrian corridor toward the ${peakHeatZone}`,
          evidence: [`Hotspot area: ${Math.round(hotspotAreaPct)}% of the study area`, `Thermal comfort score: ${thermalComfortScore}/100`],
          priority: 'High',
          confidence: Math.min(95, 50 + criticalMetrics.length * 8)
        });
      } else {
        strengths.push('Visitor sentiment on shade/heat comfort is comparatively favorable.');
      }
      if (biodiversityScore >= 65) {
        strengths.push('Visitor sentiment reflects positive wildlife/nature presence.');
        ecologicalOpportunities.push('Reinforce existing habitat value with native/pollinator planting.');
      } else {
        ecologicalOpportunities.push('Introduce native and pollinator-friendly planting to build ecological value from a currently low baseline.');
      }
      if (waterFeatureConcernScore >= 50) {
        weaknesses.push('Visitor sentiment shows above-average concern with existing water features.');
      }
      designDrivers.push(`Target cooling interventions toward the ${peakHeatZone}, the highest estimated heat-exposure zone identified.`);
      if (coolingOpportunityScore >= 60) {
        priorityInterventions.push({
          intervention: 'Introduce tree planting and permeable surface in the highest cooling-opportunity zones',
          evidence: [`Cooling opportunity score: ${coolingOpportunityScore}/100`, `Estimated impervious surface: ${Math.round(imperviousSurfacePct)}%`],
          priority: coolingOpportunityScore >= 75 ? 'High' : 'Medium',
          confidence: Math.min(90, 45 + criticalMetrics.length * 7)
        });
      }
      constraints.push('No wind/CFD, NDVI, thermal-raster, or tree-survey data exists for this site -- all heat/shade/canopy figures are documented surface-composition proxies, not measurements.');

      return {
        environmentalProfile: `The study area scores ${overallEnvironmentalScore}/100 overall on the composite Environmental Score, with an estimated ${Math.round(hotspotAreaPct)}% of the area in a heat-exposure hotspot concentrated toward the ${peakHeatZone}. Green coverage sits at ${Math.round(greenCoveragePct)}%.`,
        strengths: strengths.length ? strengths : ['No standout strengths identified from the available data.'],
        weaknesses: weaknesses.length ? weaknesses : ['No significant weaknesses identified from the available data.'],
        constraints,
        ecologicalOpportunities: ecologicalOpportunities.length ? ecologicalOpportunities : ['Insufficient data to identify additional ecological opportunities.'],
        designDrivers,
        priorityInterventions: priorityInterventions.length ? priorityInterventions : [{
          intervention: 'Maintain current green coverage and monitor as the site develops',
          evidence: [`Overall environmental score: ${overallEnvironmentalScore}/100`],
          priority: 'Low',
          confidence: 40
        }]
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
      console.log('No GEMINI_API_KEY configured. Using template environmental-insights synthesis.');
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Offline)' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const systemInstruction = `You are an expert landscape architect and environmental planner writing an Environmental Analysis interpretation for a public park in Dubai. You will be given real, pre-computed evidence. IMPORTANT: this dataset has NO satellite, thermal, NDVI, or wind data -- heat/shade/canopy figures are documented surface-composition proxies, not measurements. Do not describe them as measured temperatures or satellite-derived values. Use ONLY the numbers provided -- do not invent statistics. Every intervention's evidence array must reference a number that was actually given to you.`;

      const contents = `Environmental analysis evidence:\n${JSON.stringify(metrics, null, 2)}\n\nGenerate a planning interpretation grounded strictly in this evidence.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              environmentalProfile: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
              ecologicalOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              designDrivers: { type: Type.ARRAY, items: { type: Type.STRING } },
              priorityInterventions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    intervention: { type: Type.STRING },
                    evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                    priority: { type: Type.STRING, description: 'Low, Medium, or High' },
                    confidence: { type: Type.INTEGER, description: '0-100' }
                  },
                  required: ['intervention', 'evidence', 'priority', 'confidence']
                }
              }
            },
            required: ['environmentalProfile', 'strengths', 'weaknesses', 'constraints', 'ecologicalOpportunities', 'designDrivers', 'priorityInterventions']
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ ...parsed, engine: 'Gemini 3.5 Flash Model' });
    } catch (error: any) {
      console.error('Environmental Insights Gemini Error, falling back to template:', error);
      return res.json({ ...buildTemplateInsights(), engine: 'Template Synthesis (Fallback due to error)' });
    }
  });

async function initServer() {
  // Serve static assets or use Vite dev server
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Only serve static files locally in production mode.
    // On Vercel, static assets are served from the global CDN automatically.
    if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  if (process.env.NODE_ENV !== 'production' || (!process.env.VERCEL && !process.env.VERCEL_ENV)) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Dubai Park Review Miner Backend running on port ${PORT}`);
    });
  }
}

initServer().catch(console.error);

export default app;
