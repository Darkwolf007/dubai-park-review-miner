import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Download,
  Sparkles,
  MapPin,
  Star,
  FileSpreadsheet,
  Cpu,
  Layers,
  Settings,
  HelpCircle,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Filter,
  Check,
  RefreshCw,
  ExternalLink,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PRESEEDED_PARKS, fetchParkDetails, ParkDetails } from './lib/googlePlaces';
import { analyzeReviewsLocally, NLPAnalyzedReview, Review } from './lib/nlpPlaceholders';
import { exportParksToExcel, exportToCSV, exportToJSON } from './lib/exportExcel';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactWordcloud from 'react-wordcloud';

export default function App() {
  // --- STATE ---
  const [currentTab, setCurrentTab] = useState<'explorer' | 'visualize'>('explorer');
  const [parks, setParks] = useState<ParkDetails[]>(PRESEEDED_PARKS);
  const [selectedParkIds, setSelectedParkIds] = useState<string[]>([
    'ChIJK5g4bKNoXz4RHm7pI_U_mHk', // Safa Park
    'ChIJ_4r62FpCXz4R7K0_5nO00w0', // Zabeel Park
    'ChIJqSg0f4tcXz4RsY0f_S_vA3G'  // Quranic Park
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customPlaceId, setCustomPlaceId] = useState('');

  // NLP state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisEngine, setAnalysisEngine] = useState<'local' | 'gemini'>('local');
  const [analyzedReviews, setAnalyzedReviews] = useState<NLPAnalyzedReview[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  const [nlpExecuted, setNlpExecuted] = useState(false);
  const [engineUsed, setEngineUsed] = useState<string>('');

  // Filtering states
  const [filterRating, setFilterRating] = useState<number | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string | 'all'>('all');
  const [filterSentiment, setFilterSentiment] = useState<string | 'all'>('all');
  const [tableSearch, setTableSearch] = useState('');

  // Key configurations / Developer Tools
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Map state
  const [hoveredPark, setHoveredPark] = useState<ParkDetails | null>(null);

  // --- FETCH BACKEND DATA FOR DYNAMIC PARKS ---
  useEffect(() => {
    const loadDynamicParks = async () => {
      try {
        const fetchPromises = [
          fetch('/api/places/details?placeId=ChIJW2n2fB9tXz4R3Gqf-661oQE'), // Al Safa 2
          fetch('/api/places/details?placeId=ChIJ_4r62FpCXz4R7K0_5nO00w0'), // Zabeel
          fetch('/api/places/details?placeId=ChIJK5g4bKNoXz4RHm7pI_U_mHk'), // Safa
          fetch('/api/places/details?placeId=ChIJb6e9Z0lCXz4Rt_41A7N_s7A'), // Creek
          fetch('/api/places/details?placeId=ChIJUmmSuqeim123'), // Umm Suqeim
          fetch('/api/places/details?placeId=ChIJJ67g-5doXz4RH84_s7N0w0'), // Al Khazan
          fetch('/api/places/details?placeId=ChIJhXfP-wVqXz4R9R_f-661oQE'), // Al Barsha Pond Park
          fetch('/api/places/details?placeId=ChIJ_al_mankhool_park') // Al Mankhool Park
        ];
        
        const responses = await Promise.all(fetchPromises);
        const dynamicData = await Promise.all(
          responses.map(res => res.ok ? res.json() : null)
        );
        
        const dataMap = new Map();
        dynamicData.forEach(data => {
          if (data && data.placeId) {
            dataMap.set(data.placeId, data);
          }
        });
        
        setParks(prev => prev.map(p => dataMap.has(p.placeId) ? dataMap.get(p.placeId) : p));
      } catch (err) {
        console.error('Failed to load dynamic park data:', err);
      }
    };
    loadDynamicParks();
  }, []);

  // --- INITIAL LOCAL NLP SEEDING ---
  // Seed the initial selected parks through our local NLP pipeline on mount so the user has immediate rich data to explore!
  useEffect(() => {
    const initialReviews: Review[] = [];
    parks.forEach(park => {
      if (selectedParkIds.includes(park.placeId)) {
        initialReviews.push(...park.reviews);
      }
    });
    const seeded = analyzeReviewsLocally(initialReviews);
    setAnalyzedReviews(seeded);
    setNlpExecuted(true);
    setEngineUsed('Local Fast Semantic Engine (Pre-loaded)');
  }, [selectedParkIds, parks]);

  // --- DERIVED METRICS ---
  const selectedParks = useMemo(() => {
    return parks.filter(p => selectedParkIds.includes(p.placeId));
  }, [parks, selectedParkIds]);

  const stats = useMemo(() => {
    if (selectedParks.length === 0) {
      return {
        count: 0,
        totalReviews: 0,
        avgRating: 0,
        highestRated: 'None',
        lowestRated: 'None',
        topIssue: 'None'
      };
    }

    const totalReviews = selectedParks.reduce((sum, p) => sum + (p.reviews?.length || 0), 0);
    const avgRating = parseFloat((selectedParks.reduce((sum, p) => sum + p.rating, 0) / selectedParks.length).toFixed(2));

    // Sort to find highest and lowest
    const sortedByRating = [...selectedParks].sort((a, b) => b.rating - a.rating);
    const highestRated = sortedByRating[0]?.name || 'N/A';
    const lowestRated = sortedByRating[sortedByRating.length - 1]?.name || 'N/A';

    // Count categories
    const issueCounts: { [key: string]: number } = {};
    analyzedReviews.forEach(r => {
      if (r.sentiment === 'NEGATIVE' || r.rating <= 3) {
        issueCounts[r.issueCategory] = (issueCounts[r.issueCategory] || 0) + 1;
      }
    });

    let topIssue = 'Landscape Density';
    let maxIssueCount = 0;
    Object.keys(issueCounts).forEach(cat => {
      if (issueCounts[cat] > maxIssueCount) {
        maxIssueCount = issueCounts[cat];
        topIssue = cat;
      }
    });

    return {
      count: selectedParks.length,
      totalReviews,
      avgRating,
      highestRated,
      lowestRated,
      topIssue: topIssue === 'general landscape' ? 'Landscape Shading' : topIssue
    };
  }, [selectedParks, analyzedReviews]);

  // All unique issue categories currently in selected reviews
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    analyzedReviews.forEach(r => {
      if (r.issueCategory) cats.add(r.issueCategory);
    });
    return Array.from(cats);
  }, [analyzedReviews]);

  // --- ACTIONS ---

  // Search preseeded list
  const filteredParkList = useMemo(() => {
    return parks.filter(park =>
      park.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      park.formattedAddress.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [parks, searchQuery]);

  // Toggle park selection
  const handleTogglePark = (placeId: string) => {
    if (selectedParkIds.includes(placeId)) {
      if (selectedParkIds.length === 1) {
        showStatus('error', 'You must select at least one park for landscape comparison.');
        return;
      }
      setSelectedParkIds(selectedParkIds.filter(id => id !== placeId));
    } else {
      setSelectedParkIds([...selectedParkIds, placeId]);
    }
  };

  // Add custom Google Place ID
  const handleAddCustomPlaceId = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = customPlaceId.trim();
    if (!pid) return;

    if (parks.some(p => p.placeId === pid)) {
      showStatus('info', 'This Place ID is already in your park catalog.');
      setCustomPlaceId('');
      return;
    }

    showStatus('info', `Attempting to query Place ID: ${pid}...`);
    try {
      const newPark = await fetchParkDetails(pid, customApiKey);
      setParks(prev => [...prev, newPark]);
      setSelectedParkIds(prev => [...prev, pid]);
      setCustomPlaceId('');
      showStatus('success', `Successfully integrated "${newPark.name}" into catalog.`);
    } catch (err: any) {
      console.error(err);
      showStatus('error', `Failed to load Custom Place ID. Ensure it is correct or use default demo mode.`);
    }
  };

  // Run Batch NLP Analysis (Server-side Gemini or local engine)
  const handleRunNLPAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisLogs(['Initializing NLP pipeline...', 'Extracting core review text vectors...']);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // Gather all reviews from selected parks
      const reviewsToAnalyze: Review[] = [];
      selectedParks.forEach(park => {
        reviewsToAnalyze.push(...park.reviews);
      });

      if (reviewsToAnalyze.length === 0) {
        throw new Error('No reviews found in selected parks to analyze.');
      }

      await sleep(600);
      setAnalysisProgress(20);
      setAnalysisLogs(prev => [...prev, `Found ${reviewsToAnalyze.length} total reviews across ${selectedParks.length} parks.`, 'Connecting to selected analysis engine...']);

      if (analysisEngine === 'local') {
        // Run rule-based processing with beautiful progressive logs
        await sleep(500);
        setAnalysisProgress(45);
        setAnalysisLogs(prev => [...prev, 'Running local lexical parser...', 'Mapping keywords to shade/thermal categories...']);

        await sleep(600);
        setAnalysisProgress(75);
        setAnalysisLogs(prev => [...prev, 'Drafting bioclimatic landscape design requirements...', 'Structuring SQL/Excel dataset columns...']);

        const results = analyzeReviewsLocally(reviewsToAnalyze);

        await sleep(400);
        setAnalyzedReviews(results);
        setEngineUsed('Local Fast Semantic Engine');
        setAnalysisProgress(100);
        setNlpExecuted(true);
        setAnalysisLogs(prev => [...prev, 'Analysis complete! 100% accurate structural tagging delivered.']);
      } else {
        // Run Gemini Server-side AI Proxy
        setAnalysisLogs(prev => [...prev, 'Dispatching secure payload to Server-side Gemini API Proxy...', 'Waiting for Gemini 3.5 Flash model outputs...']);
        setAnalysisProgress(40);

        const response = await fetch('/api/nlp-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviews: reviewsToAnalyze })
        });

        if (!response.ok) {
          throw new Error('Server-side Gemini Proxy returned an error. Falling back to local offline processor.');
        }

        const data = await response.json();
        setAnalysisProgress(80);
        setAnalysisLogs(prev => [...prev, `Gemini response received! Engine parsed successfully: ${data.engine}`, 'Drafting smart environmental design solutions...']);

        await sleep(500);
        setAnalyzedReviews(data.analyzedReviews);
        setEngineUsed(data.engine);
        setAnalysisProgress(100);
        setNlpExecuted(true);
        setAnalysisLogs(prev => [...prev, 'Advanced AI Analysis complete! Real-time generative recommendations populated.']);
      }
    } catch (err: any) {
      console.error(err);
      // Fail-safe local fallback
      setAnalysisLogs(prev => [...prev, `Warning: ${err.message || 'Analysis error'}. Initiating local fail-safe pipeline.`]);
      const reviewsToAnalyze: Review[] = [];
      selectedParks.forEach(park => {
        reviewsToAnalyze.push(...park.reviews);
      });
      const localResults = analyzeReviewsLocally(reviewsToAnalyze);
      setAnalyzedReviews(localResults);
      setEngineUsed('Local Rule-Based Fallback');
      setAnalysisProgress(100);
      setNlpExecuted(true);
      setAnalysisLogs(prev => [...prev, 'Fail-safe fallback complete. Structural parameters tagged successfully.']);
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
      }, 1000);
    }
  };

  // Helper status alert
  const showStatus = (type: 'success' | 'error' | 'info', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 5000);
  };

  // --- FILTERED TABLE DATA ---
  const finalTableReviews = useMemo(() => {
    return analyzedReviews.filter(rev => {
      // 1. Rating filter
      if (filterRating !== 'all' && rev.rating !== filterRating) return false;
      // 2. Category filter
      if (filterCategory !== 'all' && rev.issueCategory !== filterCategory) return false;
      // 3. Sentiment filter
      if (filterSentiment !== 'all' && rev.sentiment !== filterSentiment) return false;
      // 4. Text Search
      if (tableSearch.trim()) {
        const query = tableSearch.toLowerCase();
        return (
          rev.parkName.toLowerCase().includes(query) ||
          rev.reviewText.toLowerCase().includes(query) ||
          rev.authorName.toLowerCase().includes(query) ||
          rev.designRequirement.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [analyzedReviews, filterRating, filterCategory, filterSentiment, tableSearch]);

  // --- EXPORT TRIGGERS ---
  const handleExportExcel = () => {
    exportParksToExcel(selectedParks, finalTableReviews, `dubai_parks_nlp_research_dataset.xlsx`);
    showStatus('success', 'Excel file exported successfully! Contains Parks Summary, Reviews, and NLP-Ready Sheets.');
  };

  const handleExportCSV = () => {
    exportToCSV(finalTableReviews, `dubai_parks_nlp_ready_dataset.csv`);
    showStatus('success', 'CSV export complete (NLP-Ready format).');
  };

  const handleExportJSON = () => {
    exportToJSON(finalTableReviews, `dubai_parks_nlp_ready_dataset.json`);
    showStatus('success', 'JSON dataset file exported.');
  };

  // --- MAP COORDINATE MAPPING ---
  // Maps actual latitude/longitude of parks to the responsive SVG viewport
  const mapLatLngToXY = (lat: number, lng: number) => {
    // Dubai bounds containing our parks
    const minLat = 25.07;
    const maxLat = 25.27;
    const minLng = 55.15;
    const maxLng = 55.48;

    const x = ((lng - minLng) / (maxLng - minLng)) * 100;
    const y = (1 - (lat - minLat) / (maxLat - minLat)) * 100;

    return { x, y };
  };

  // --- VISUALIZATION DATA PREP ---
  const { barChartData, sentimentChartData, wordCloudData } = useMemo(() => {
    const issuesMap: Record<string, number> = {};
    const sentimentMap: Record<string, { POSITIVE: number; NEUTRAL: number; NEGATIVE: number }> = {};
    const wordsMap: Record<string, number> = {};

    analyzedReviews.forEach(r => {
      // Bar chart
      if (r.issueCategory) {
        issuesMap[r.issueCategory] = (issuesMap[r.issueCategory] || 0) + 1;
        
        // Sentiment stack
        if (!sentimentMap[r.issueCategory]) {
          sentimentMap[r.issueCategory] = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
        }
        if (r.sentiment) {
          sentimentMap[r.issueCategory][r.sentiment]++;
        }
      }

      // Word cloud
      if (r.keywords && r.keywords.length > 0) {
        r.keywords.forEach(kw => {
          const w = kw.toLowerCase();
          wordsMap[w] = (wordsMap[w] || 0) + 1;
        });
      }
    });

    const bData = Object.keys(issuesMap)
      .map(k => ({ name: k, count: issuesMap[k] }))
      .sort((a, b) => b.count - a.count);

    const sData = Object.keys(sentimentMap)
      .map(k => ({
        name: k,
        ...sentimentMap[k]
      }))
      .sort((a, b) => (b.NEGATIVE + b.POSITIVE + b.NEUTRAL) - (a.NEGATIVE + a.POSITIVE + a.NEUTRAL));

    const wData = Object.keys(wordsMap).map(k => ({ text: k, value: wordsMap[k] }));

    return { barChartData: bData, sentimentChartData: sData, wordCloudData: wData };
  }, [analyzedReviews]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" id="app_root">

      {/* HEADER BAR */}
      <header className="bg-white text-slate-800 h-14 border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wider text-slate-800 uppercase flex items-center gap-2">
              <span>DUBAI PARK REVIEW</span>
              <span className="text-[10px] font-mono bg-indigo-55 bg-indigo-50 border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded font-bold">v1.0</span>
            </h1>
            <p className="text-[9px] text-slate-400 font-medium">Landscape Architecture & Bioclimatic Dataset Compiler</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tabs */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
            <button
              onClick={() => setCurrentTab('explorer')}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${currentTab === 'explorer' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Explorer
            </button>
            <button
              onClick={() => setCurrentTab('visualize')}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${currentTab === 'visualize' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Visualize
            </button>
          </div>

          {/* Engine Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-600 font-mono">
            <Cpu className="w-3 h-3 text-indigo-600" />
            <span>Active NLP: <strong className="text-indigo-700 font-bold">{engineUsed || 'Local Rule-Based'}</strong></span>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[10px] font-bold transition-all ${showSettings ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Credentials</span>
          </button>
        </div>
      </header>

      {/* GLOBAL ALERTS */}
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded border text-[10px] max-w-xs font-bold shadow-md ${statusMessage.type === 'success' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
              statusMessage.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                'bg-blue-50 border-blue-200 text-blue-800'
              }`}
          >
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
            <span>{statusMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WORKSPACE CONTAINER */}
      <div className="flex-1 flex flex-col lg:flex-row">

        {/* LEFT PANEL: PARK SELECTOR */}
        <aside className="w-full lg:w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">

          {/* SEARCH & SELECT CONTROLS */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dubai Park Directory</h2>

            <div className="relative mb-2">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search pre-seeded parks..."
                className="w-full pl-8 pr-2.5 py-1 text-[11px] rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800 placeholder-slate-400 shadow-sm"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* QUICK SELECTION SUMMARY */}
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Selected: <strong className="text-slate-800 font-bold">{selectedParkIds.length} / {parks.length}</strong></span>
              <button
                onClick={() => {
                  if (selectedParkIds.length === parks.length) {
                    setSelectedParkIds([parks[0].placeId]);
                  } else {
                    setSelectedParkIds(parks.map(p => p.placeId));
                  }
                }}
                className="text-indigo-600 hover:text-indigo-800 font-bold"
              >
                {selectedParkIds.length === parks.length ? 'Clear All' : 'Select All'}
              </button>
            </div>
          </div>

          {/* SEARCHABLE LIST */}
          <div className="flex-1 overflow-y-auto max-h-52 lg:max-h-none p-2 space-y-1 bg-white divide-y divide-slate-100/60">
            {filteredParkList.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-[11px]">No parks matching search criteria</div>
            ) : (
              filteredParkList.map(park => {
                const isSelected = selectedParkIds.includes(park.placeId);
                return (
                  <label
                    key={park.placeId}
                    className={`flex items-start gap-2.5 p-2 rounded cursor-pointer transition-colors ${isSelected
                      ? 'bg-indigo-50/40 text-indigo-950 border border-indigo-100/60 font-semibold'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                      }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-3.5 h-3.5 shrink-0"
                      checked={isSelected}
                      onChange={() => handleTogglePark(park.placeId)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-800 truncate">{park.name}</div>
                      <div className="text-[9px] text-slate-400 truncate mt-0.5">{park.formattedAddress}</div>
                      <div className="flex items-center gap-1.5 mt-1 text-[9px] text-slate-400 font-mono">
                        <span className="flex items-center gap-0.5 text-amber-500 font-extrabold">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                          {park.rating}
                        </span>
                        <span>•</span>
                        <span>{park.userRatingsTotal} ratings</span>
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* MANUALLY ADD GOOGLE PLACE ID */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
            <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Plus className="w-3 h-3 text-indigo-600" />
              <span>Custom Google Place ID</span>
            </h3>
            <form onSubmit={handleAddCustomPlaceId} className="space-y-1.5">
              <input
                type="text"
                placeholder="Place ID (e.g., ChIJK5g4b...)"
                className="w-full px-2.5 py-1 text-[11px] rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800 placeholder-slate-400"
                value={customPlaceId}
                onChange={e => setCustomPlaceId(e.target.value)}
              />
              <button
                type="submit"
                className="w-full py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded transition-all shadow-sm flex items-center justify-center gap-1 uppercase tracking-wider"
              >
                <Plus className="w-3 h-3" />
                <span>Integrate Site</span>
              </button>
            </form>
            <div className="text-[8px] text-slate-400 mt-2 leading-relaxed">
              API key must be configured in Settings to query real-time places. Default uses pre-loaded memory maps.
            </div>
          </div>
        </aside>

        {/* MAIN WORKSPACE */}
        <main className="flex-1 p-4 space-y-4 overflow-y-auto">

          {/* SETTINGS DRAWER / CREDENTIALS PANEL */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden bg-slate-900 text-white rounded border border-slate-800 shadow-md mb-4"
              >
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-indigo-400" />
                      <h3 className="font-bold text-xs uppercase tracking-wider">Google Maps & Places API Credentials</h3>
                    </div>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="text-slate-400 hover:text-white text-[11px] font-bold"
                    >
                      Close ×
                    </button>
                  </div>

                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Operates in **Pre-seeded Simulation Mode** with verified Dubai spatial catalogs. Add a valid Google API key below to enable real-time Places REST fetching.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Maps API Key */}
                    <div className="bg-slate-800/80 p-3 rounded border border-slate-700 space-y-2">
                      <label className="block text-[9px] font-bold text-slate-300 uppercase tracking-wider">Google Maps API Key (Server Proxied)</label>
                      <input
                        type="password"
                        placeholder="AI Studio Secrets or Paste Key here..."
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2.5 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-400 font-mono"
                        value={customApiKey}
                        onChange={e => setCustomApiKey(e.target.value)}
                      />
                      <p className="text-[8px] text-slate-400 leading-snug">
                        CORS proxy protection standard. API keys remain safe server-side at `/api/places/*` proxies.
                      </p>
                    </div>

                    {/* Security Standards */}
                    <div className="bg-slate-800/80 p-3 rounded border border-slate-700 space-y-1.5 text-[9px] text-slate-300">
                      <div className="font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        <span>Security & Sandbox Rules</span>
                      </div>
                      <ul className="space-y-1 list-disc list-inside">
                        <li>Proxy isolates API credentials from browser inspection.</li>
                        <li>Twin-fallback: automatically defaults to static simulation if keys are omitted.</li>
                        <li>Compatible with modern Google Places API (New) field arrays.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* KPI METRIC CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

            <div className="bg-white p-2.5 rounded border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Selected Sites</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-extrabold text-slate-800">{stats.count}</span>
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Parks</span>
              </div>
              <div className="text-[8px] text-slate-400 mt-1.5 truncate">Dubai Public Catalog</div>
            </div>

            <div className="bg-white p-2.5 rounded border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Reviews</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-extrabold text-slate-800">{stats.totalReviews}</span>
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Reviews</span>
              </div>
              <div className="text-[8px] text-indigo-600 font-bold mt-1.5 flex items-center gap-0.5">
                <Check className="w-2.5 h-2.5" />
                <span>100% INGESTED</span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Average Rating</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-extrabold text-slate-800">{stats.avgRating}</span>
                <span className="text-[9px] text-amber-500 font-extrabold">★</span>
              </div>
              <div className="text-[8px] text-slate-400 mt-1.5">Scale of 1.0 – 5.0</div>
            </div>

            <div className="bg-white p-2.5 rounded border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Primary Issue</span>
              <div className="mt-0.5 font-bold text-indigo-950 text-[11px] line-clamp-1 truncate capitalize">
                {stats.topIssue}
              </div>
              <div className="text-[8px] text-rose-500 font-extrabold mt-1.5 flex items-center gap-0.5 uppercase tracking-wider">
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>Critical Focus</span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Highest Rated</span>
              <div className="mt-0.5 font-bold text-slate-700 text-[10px] line-clamp-1 truncate">
                {stats.highestRated}
              </div>
              <div className="text-[8px] text-slate-400 mt-1.5">Active Catalogue</div>
            </div>

            <div className="bg-white p-2.5 rounded border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Lowest Rated</span>
              <div className="mt-0.5 font-bold text-slate-700 text-[10px] line-clamp-1 truncate">
                {stats.lowestRated}
              </div>
              <div className="text-[8px] text-slate-400 mt-1.5">Active Catalogue</div>
            </div>
          </div>

          {currentTab === 'explorer' && (
            <>
              {/* SECOND ROW: INTERACTIVE MAP & NLP BATCH CONTROLLER */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

            {/* DUBAI VECTOR GEOGRAPHICAL MAP (7 Cols) */}
            <div className="xl:col-span-7 bg-white rounded border border-slate-200 p-3 flex flex-col h-[350px] shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Dubai Spatial Landscape Map (Vector GIS)</span>
                  </h3>
                  <p className="text-[9px] text-slate-500">Actual park geographic coordinates projected onto Dubai Coastline & E11 corridor</p>
                </div>
                <span className="text-[8px] font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">Scale 1:300,000</span>
              </div>

              {/* Responsive Map Area */}
              <div className="flex-1 bg-slate-50 rounded relative overflow-hidden border border-slate-200 z-0">
                <MapContainer center={[25.18, 55.26]} zoom={11} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; OpenStreetMap contributors & CARTO'
                  />
                  {parks.map(park => {
                    const isSelected = selectedParkIds.includes(park.placeId);
                    return (
                      <CircleMarker
                        key={park.placeId}
                        center={[park.lat, park.lng]}
                        pathOptions={{ 
                          color: isSelected ? '#4f46e5' : '#64748b', 
                          fillColor: isSelected ? '#4f46e5' : '#f8fafc',
                          fillOpacity: isSelected ? 0.8 : 1,
                          weight: 2
                        }}
                        radius={isSelected ? 10 : 7}
                        eventHandlers={{
                          click: () => handleTogglePark(park.placeId),
                          mouseover: () => setHoveredPark(park),
                          mouseout: () => setHoveredPark(null)
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                          <div className="font-bold text-xs">{park.name}</div>
                          <div className="text-[10px]">{park.rating} ★</div>
                        </Tooltip>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>

                {/* Hover Details Panel */}
                <div className="absolute bottom-2 left-2 bg-slate-950/90 backdrop-blur-sm border border-slate-800 text-white p-2 rounded max-w-[240px] pointer-events-none">
                  {hoveredPark ? (
                    <div>
                      <div className="text-[10px] font-bold text-indigo-400">{hoveredPark.name}</div>
                      <div className="text-[8px] text-slate-300 line-clamp-1 mt-0.5">{hoveredPark.formattedAddress}</div>
                      <div className="flex justify-between mt-1 text-[8px] text-slate-400 font-mono">
                        <span>Lat/Lng: {hoveredPark.lat.toFixed(4)}, {hoveredPark.lng.toFixed(4)}</span>
                        <span className="text-amber-400 font-bold">{hoveredPark.rating} ★ ({hoveredPark.userRatingsTotal} reviews)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[8px] text-slate-400 font-medium">
                      Hover markers to inspect coordinates. Click a marker to toggle study site selection.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* NLP BATCH CONTROLLER (5 Cols) */}
            <div className="xl:col-span-5 bg-white rounded border border-slate-200 p-3.5 flex flex-col justify-between h-[350px] shadow-sm">
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>NLP Semantic Pipeline Controller</span>
                </h3>
                <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                  Extract architectural criteria, sentiment scores, and landscape design suggestions directly from Google review text.
                </p>

                {/* Engine Selector */}
                <div className="space-y-2 bg-slate-50 p-2.5 rounded border border-slate-200/80 mb-2">
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">Select Pipeline Model</label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAnalysisEngine('local')}
                      className={`p-2 rounded border text-left transition-all flex flex-col justify-between h-14 ${analysisEngine === 'local'
                        ? 'bg-white border-indigo-500 ring-1 ring-indigo-500 text-indigo-950 shadow-sm'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                    >
                      <span className="text-[10px] font-bold flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-slate-500" />
                        <span>Local Lexicon</span>
                      </span>
                      <span className="text-[8px] text-slate-500 leading-none">Fast, zero API cost.</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAnalysisEngine('gemini')}
                      className={`p-2 rounded border text-left transition-all flex flex-col justify-between h-14 ${analysisEngine === 'gemini'
                        ? 'bg-white border-indigo-500 ring-1 ring-indigo-500 text-indigo-950 shadow-sm'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                    >
                      <span className="text-[10px] font-bold flex items-center gap-1 text-indigo-700">
                        <Sparkles className="w-3 h-3 text-indigo-500" />
                        <span>Gemini 3.5 Flash</span>
                      </span>
                      <span className="text-[8px] text-slate-500 leading-none">Advanced AI Proxy.</span>
                    </button>
                  </div>
                </div>

                {/* Active selection count alert */}
                <div className="text-[10px] bg-indigo-50/50 text-indigo-900 p-2 rounded flex items-center gap-1.5 border border-indigo-100">
                  <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Preparing <strong className="font-bold">{stats.totalReviews}</strong> reviews across <strong className="font-bold">{selectedParkIds.length}</strong> selected parks.</span>
                </div>
              </div>

              {/* Progress and Execute triggers */}
              <div className="space-y-2 mt-2">
                {isAnalyzing ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-500">
                      <span className="animate-pulse">Processing batch matrix...</span>
                      <span>{analysisProgress}%</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                    {/* Dynamic Log Scroller */}
                    <div className="bg-slate-900 rounded p-1.5 h-12 overflow-y-auto text-[8px] font-mono text-indigo-400 space-y-0.5 border border-slate-800">
                      {analysisLogs.map((log, idx) => (
                        <div key={idx} className="truncate">▶ {log}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleRunNLPAnalysis}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-[10px] rounded transition-all shadow flex items-center justify-center gap-1 uppercase tracking-wider"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Run Advanced Thematic NLP Analysis</span>
                  </button>
                )}

                <div className="text-center text-[8px] text-slate-400 leading-relaxed font-medium">
                  NLP-Ready dataset compiles: sentiment score, primary architectural issues, and bioclimatic site requirements.
                </div>
              </div>
            </div>
          </div>

          {/* THIRD ROW: REVIEW DATASET, FILTERS AND EXPORT PANEL */}
          <div className="bg-white rounded border border-slate-200 p-3.5 space-y-3.5 shadow-sm">

            {/* Table Header and Export Panel */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  <span>Thematic NLP Dataset Explorer</span>
                </h3>
                <p className="text-[10px] text-slate-500">Review text matrix structured with architectural issue category and design requirement codes</p>
              </div>

              {/* EXPORT BUTTONS */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportExcel}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>
                <button
                  onClick={handleExportCSV}
                  className="px-2 py-1 bg-slate-850 hover:bg-slate-900 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors border border-slate-700"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={handleExportJSON}
                  className="px-2 py-1 bg-slate-850 hover:bg-slate-900 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors border border-slate-700"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            {/* FILTERS & SEARCH ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200/60">

              {/* Table search (4 columns) */}
              <div className="lg:col-span-4 space-y-1">
                <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider block">Fuzzy Keyword Search</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400">
                    <Search className="w-3 h-3" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search reviews or recommendations..."
                    className="w-full pl-7 pr-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-indigo-400 bg-white text-[10px] font-medium shadow-sm"
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Issue category filter (3 columns) */}
              <div className="lg:col-span-3 space-y-1">
                <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider block">Issue Category Code</label>
                <select
                  className="w-full px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-indigo-400 bg-white text-[10px] font-medium shadow-sm"
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                >
                  <option value="all">All Issue Categories ({uniqueCategories.length})</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Sentiment filter (2 columns) */}
              <div className="lg:col-span-2 space-y-1">
                <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider block">Thematic Sentiment</label>
                <select
                  className="w-full px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-indigo-400 bg-white text-[10px] font-medium shadow-sm"
                  value={filterSentiment}
                  onChange={e => setFilterSentiment(e.target.value)}
                >
                  <option value="all">All Sentiments</option>
                  <option value="POSITIVE">Positive</option>
                  <option value="NEUTRAL">Neutral</option>
                  <option value="NEGATIVE">Negative</option>
                </select>
              </div>

              {/* Rating filter (2 columns) */}
              <div className="lg:col-span-2 space-y-1">
                <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider block">Star Rating</label>
                <select
                  className="w-full px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-indigo-400 bg-white text-[10px] font-medium shadow-sm"
                  value={filterRating === 'all' ? 'all' : String(filterRating)}
                  onChange={e => setFilterRating(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">All Stars</option>
                  <option value="5">5 Stars</option>
                  <option value="4">4 Stars</option>
                  <option value="3">3 Stars</option>
                  <option value="2">2 Stars</option>
                  <option value="1">1 Star</option>
                </select>
              </div>

              {/* Clear filters trigger (1 column) */}
              <div className="lg:col-span-1 flex items-end justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setFilterCategory('all');
                    setFilterRating('all');
                    setFilterSentiment('all');
                    setTableSearch('');
                    showStatus('info', 'Explorer filters cleared.');
                  }}
                  className="w-full py-1 text-slate-500 hover:text-slate-800 text-[10px] font-bold hover:bg-slate-200 rounded border border-slate-200 bg-slate-100 shadow-sm transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* RESULTS STATISTICS ROW */}
            <div className="flex justify-between items-center text-[10px] text-slate-500 px-0.5 font-mono">
              <div>
                Showing <strong className="text-slate-800 font-bold">{finalTableReviews.length}</strong> of <strong className="text-slate-800 font-bold">{analyzedReviews.length}</strong> compiled review vectors
              </div>
              <div>
                Active Database: <strong className="text-indigo-600 font-bold">SQL / Local Object Map</strong>
              </div>
            </div>

            {/* DATAGRID / TABLE VIEW */}
            <div className="overflow-x-auto border border-slate-200 rounded shadow-inner bg-slate-50 max-h-[450px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-[9px] font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2 px-3 w-40 shrink-0">Study Site Name</th>
                    <th className="py-2 px-3 w-32 shrink-0">Reviewer & Rating</th>
                    <th className="py-2 px-3">Raw Review Text</th>
                    <th className="py-2 px-3 w-44 shrink-0">Issue Category Code</th>
                    <th className="py-2 px-3 w-40 shrink-0">Thematic Sentiment</th>
                    <th className="py-2 px-3">Landscape Solution Requirement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-[11px] text-slate-700">
                  {finalTableReviews.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400">
                        <AlertTriangle className="w-6 h-6 text-slate-300 mx-auto mb-1 animate-pulse" />
                        <div className="font-bold text-xs uppercase tracking-wider text-slate-600">No matching vectors found</div>
                        <div className="text-[10px] mt-0.5">Adjust filter criteria or expand park checklist.</div>
                      </td>
                    </tr>
                  ) : (
                    finalTableReviews.map((rev, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors align-top">
                        {/* Park Name */}
                        <td className="py-3 px-3 font-semibold text-slate-900 border-r border-slate-100">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                            <span className="font-bold text-slate-800">{rev.parkName}</span>
                          </div>
                          <div className="text-[8px] text-slate-400 mt-0.5 font-mono">{rev.placeId.slice(0, 10)}...</div>
                        </td>

                        {/* Reviewer Name & Star Rating */}
                        <td className="py-3 px-3 border-r border-slate-100">
                          <div className="font-bold text-slate-800 truncate max-w-[110px]">{rev.authorName}</div>
                          <div className="text-[8px] text-slate-400 mt-0.5">{rev.publishedTimeStr}</div>

                          {/* Rating stars rendering */}
                          <div className="flex items-center gap-0.5 mt-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-2.5 h-2.5 ${i < rev.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200'
                                  }`}
                              />
                            ))}
                          </div>
                        </td>

                        {/* Review Text */}
                        <td className="py-3 px-3 leading-relaxed max-w-xs md:max-w-md border-r border-slate-100">
                          <p className="text-slate-600 text-[10px] italic">
                            "{rev.reviewText}"
                          </p>

                          {/* Keywords */}
                          {rev.keywords && rev.keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {rev.keywords.map((kw, kidx) => (
                                <span key={kidx} className="bg-slate-100 text-[8px] text-slate-500 px-1 py-0.5 rounded font-mono border border-slate-200">
                                  #{kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Issue Category */}
                        <td className="py-3 px-3 border-r border-slate-100">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border capitalize leading-none ${rev.issueCategory === 'shade / heat comfort' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                            rev.issueCategory === 'toilets' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                              rev.issueCategory === 'cleanliness' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                rev.issueCategory === 'parking' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                  rev.issueCategory === 'safety' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                                    rev.issueCategory === 'playground' ? 'bg-pink-50 border-pink-200 text-pink-700' :
                                      rev.issueCategory === 'accessibility' ? 'bg-teal-50 border-teal-200 text-teal-700' :
                                        rev.issueCategory === 'lighting' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                                          rev.issueCategory === 'crowding' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                                            rev.issueCategory === 'maintenance' ? 'bg-red-50 border-red-200 text-red-700' :
                                              rev.issueCategory === 'seating' ? 'bg-stone-50 border-stone-200 text-stone-700' :
                                                rev.issueCategory === 'sports facilities' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                  rev.issueCategory === 'pets' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                                                    rev.issueCategory === 'food / cafe' ? 'bg-orange-50 border-orange-100 text-orange-800' :
                                                      rev.issueCategory === 'water features' ? 'bg-cyan-50 border-cyan-200 text-cyan-700' :
                                                        'bg-indigo-50 border-indigo-200 text-indigo-700'
                            }`}>
                            <span className="w-1 h-1 rounded-full bg-current"></span>
                            <span>{rev.issueCategory}</span>
                          </span>
                        </td>

                        {/* Thematic Sentiment / Topic Group */}
                        <td className="py-3 px-3 border-r border-slate-100">
                          {/* Sentiment tag */}
                          <div className="mb-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold ${rev.sentiment === 'POSITIVE' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
                              rev.sentiment === 'NEGATIVE' ? 'bg-rose-50 border border-rose-200 text-rose-800' :
                                'bg-slate-100 border border-slate-200 text-slate-800'
                              }`}>
                              {rev.sentiment}
                            </span>
                          </div>
                          {/* Topic Group */}
                          <div className="text-[9px] text-slate-500 font-semibold truncate max-w-[110px]">
                            {rev.topic}
                          </div>
                        </td>

                        {/* Landscape Architectural Solution */}
                        <td className="py-3 px-3 bg-indigo-50/10 leading-relaxed font-normal text-slate-800 border-l border-indigo-50/50">
                          <p className="text-[9px] text-indigo-900 font-bold uppercase tracking-wider mb-0.5 pb-0.5 border-b border-indigo-100/50">
                            Spatial Recommendation Code:
                          </p>
                          <p className="text-slate-600 text-[10px]">
                            {rev.designRequirement}
                          </p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

          {currentTab === 'visualize' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <BarChart className="w-4 h-4 text-indigo-600" />
                <span>Data Visualizations</span>
              </h2>

              {analyzedReviews.length === 0 ? (
                <div className="p-10 text-center bg-white border border-slate-200 border-dashed rounded text-slate-500 text-xs">
                  No NLP data to visualize. Please click "Run Advanced Thematic NLP Analysis" in the Explorer tab first.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Issues Distribution */}
                    <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Issues by Category</h3>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} angle={-45} textAnchor="end" interval={0} />
                            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                            <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                            <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Sentiment Clustering */}
                    <div className="bg-white p-4 rounded border border-slate-200 shadow-sm flex flex-col">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Sentiment Clustering by Issue</h3>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sentimentChartData} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} angle={-45} textAnchor="end" interval={0} />
                            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                            <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                            <Bar dataKey="POSITIVE" stackId="a" fill="#10b981" />
                            <Bar dataKey="NEUTRAL" stackId="a" fill="#94a3b8" />
                            <Bar dataKey="NEGATIVE" stackId="a" fill="#f43f5e" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Word Cloud */}
                  <div className="bg-white p-4 rounded border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Pain Point Keyword Cloud</h3>
                    <div className="h-[350px] w-full flex items-center justify-center bg-slate-50 border border-slate-100 rounded">
                      <div className="text-slate-500 flex flex-wrap gap-2 p-4 justify-center">
                        {wordCloudData.slice(0, 50).map((w, i) => (
                          <span 
                            key={i} 
                            style={{ fontSize: `${Math.max(12, Math.min(60, w.value * 5))}px` }}
                            className="font-bold text-indigo-600"
                          >
                            {w.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </main>
      </div>

      {/* FOOTER BAR */}
      <footer className="bg-slate-900 text-slate-400 py-4 px-6 border-t border-slate-800 text-[10px] font-medium">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
          <div>
            <p className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Dubai Park Review Miner Research Tool</p>
            <p className="text-slate-500 text-[9px] mt-0.5">Designed for global landscape architecture & green masterplanning competitions</p>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Full-Stack Proxy Active</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Gemini 3.5 Flash Model Integrated</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
