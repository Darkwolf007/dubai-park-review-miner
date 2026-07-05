import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
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
      try {
        let datasetPath = path.join(process.cwd(), 'dataset', APIFY_DATASETS[placeId as string].filename);
        if (!fs.existsSync(datasetPath)) {
          datasetPath = path.join(__dirname, '..', 'dataset', APIFY_DATASETS[placeId as string].filename);
        }
        if (!fs.existsSync(datasetPath)) {
          datasetPath = path.join(__dirname, 'dataset', APIFY_DATASETS[placeId as string].filename);
        }

        if (fs.existsSync(datasetPath)) {
          const rawData = fs.readFileSync(datasetPath, 'utf8');
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
          
          return res.json(parkToReturn);
        }
      } catch (err) {
        console.error('Error loading Apify dataset:', err);
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

async function initServer() {
  // Serve static assets or use Vite dev server
  if (process.env.NODE_ENV !== 'production') {
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
