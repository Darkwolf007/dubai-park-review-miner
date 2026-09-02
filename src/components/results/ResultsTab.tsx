import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Feature, Polygon } from 'geojson';
import { bbox as turfBbox } from '@turf/turf';
import { Sparkles, Loader2, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { PRESEEDED_PARKS, fetchParkDetails } from '../../lib/googlePlaces';
import { analyzeReviewsLocally, type NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { fetchGisManifest, fetchGisLayer } from '../../lib/gis/gisEngine';
import { downloadJson, downloadZip } from '../../lib/gis/exportEngine';
import type { GisManifest, H3Feature, GeoJsonFeature } from '../../lib/gis/types';
import type { CommunityFacilityLayers } from '../../lib/gis/communityEngine';
import { buildSiteGrid } from '../../lib/gis/siteGrid';
import { computeAllOpportunities, type OpportunityResult } from '../../lib/gis/opportunityEngine';
import { buildReviewSummary } from '../../lib/results/reviewSummary';
import { buildGisSummary } from '../../lib/results/gisSummary';
import { AL_SAFA_2_CLIMATE_SUMMARY } from '../../lib/results/climateData';
import { AL_SAFA_2_COMPETITION_BRIEF } from '../../lib/results/competitionBrief';
import { generateResultsSynthesis, type ResultsSynthesisResult } from '../../lib/gis/resultsSynthesisEngine';
import { SectionCard } from '../ui/SectionCard';
import { BudgetStatusCard } from './BudgetStatusCard';
import { ExperienceMatrixTable } from './ExperienceMatrixTable';
import { ExperienceSankeyFlow } from './ExperienceSankeyFlow';
import { SharedPrioritySpaces } from './SharedPrioritySpaces';
import { SpaceJourneyGraph } from './SpaceJourneyGraph';
import { ParkBrainKnowledgeGuide } from './ParkBrainKnowledgeGuide';
import { ApprovedRuleCompilerPanel } from './ApprovedRuleCompilerPanel';
import { buildParkDesignPackageFiles } from '../../lib/gis/parkDesignPackage';
import { DEFAULT_MASTERPLAN_EXPORT_SETTINGS, measureSiteBoundaryAreaM2, type MasterplanExportSettings } from '../../lib/gis/parkDesignPackage';
import type { CompiledRuleEdge, UnresolvedApprovedRule } from '../../lib/results/approvedRuleCompiler';
import { MasterplanExportSettingsPanel } from './MasterplanExportSettingsPanel';
import { MovementGisOverlay } from './MovementGisOverlay';
import { AreaReconciliationPanel } from './AreaReconciliationPanel';
import { buildAreaReconciliation } from '../../lib/designPackage/areaReconciliation';

const AL_SAFA_2_PLACE_ID = 'ChIJW2n2fB9tXz4R3Gqf-661oQE';
// Same match used by PlaygroundTab to find Al Safa 2's own polygon within the 'parks' layer --
// Opportunity Lab's site grid is built from this polygon's own bbox, not the wider 5km catchment.
const AL_SAFA_2_ARABIC_NAME = 'حديقة الصفا 2';

export function ResultsTab() {
  const parkCenter = useMemo(() => {
    const park = PRESEEDED_PARKS.find(p => p.placeId === AL_SAFA_2_PLACE_ID);
    return park ? { lat: park.lat, lng: park.lng } : { lat: 25.1706, lng: 55.2289 };
  }, []);

  const [manifest, setManifest] = useState<GisManifest | null>(null);
  const [hexes, setHexes] = useState<H3Feature[]>([]);
  const [busStops, setBusStops] = useState<GeoJsonFeature[]>([]);
  const [reviews, setReviews] = useState<NLPAnalyzedReview[]>([]);
  const [facilities, setFacilities] = useState<CommunityFacilityLayers | null>(null);
  const [parkPolygon, setParkPolygon] = useState<Feature<Polygon> | null>(null);
  const [oppBuildings, setOppBuildings] = useState<GeoJsonFeature[]>([]);
  const [oppRoads, setOppRoads] = useState<GeoJsonFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [result, setResult] = useState<ResultsSynthesisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [acceptedRuleEdges, setAcceptedRuleEdges] = useState<CompiledRuleEdge[]>([]);
  const [unresolvedRules, setUnresolvedRules] = useState<UnresolvedApprovedRule[]>([]);
  const [masterplanSettings, setMasterplanSettings] = useState<MasterplanExportSettings>(() => ({ ...DEFAULT_MASTERPLAN_EXPORT_SETTINGS }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [manifestRes, h3Res, busRes, parkRes, schools, mosques, clinics, hospitals, playgrounds, sports, restaurants, cafes, shops, toilets, drinkingWater, parks] = await Promise.all([
          fetchGisManifest(),
          fetchGisLayer<H3Feature['properties']>('h3_grid'),
          fetchGisLayer('bus_stops'),
          fetchParkDetails(AL_SAFA_2_PLACE_ID),
          fetchGisLayer('schools'),
          fetchGisLayer('mosques'),
          fetchGisLayer('clinics'),
          fetchGisLayer('hospitals'),
          fetchGisLayer('playgrounds'),
          fetchGisLayer('sports'),
          fetchGisLayer('restaurants'),
          fetchGisLayer('cafes'),
          fetchGisLayer('shops'),
          fetchGisLayer('toilets'),
          fetchGisLayer('drinking_water'),
          fetchGisLayer('parks')
        ]);
        if (cancelled) return;
        setManifest(manifestRes);
        if (h3Res) setHexes(h3Res.features as H3Feature[]);
        if (busRes) setBusStops(busRes.features);
        setReviews(analyzeReviewsLocally(parkRes.reviews));
        setFacilities({
          schools: schools?.features ?? null,
          mosques: mosques?.features ?? null,
          clinics: clinics?.features ?? null,
          hospitals: hospitals?.features ?? null,
          playgrounds: playgrounds?.features ?? null,
          sports: sports?.features ?? null,
          restaurants: restaurants?.features ?? null,
          cafes: cafes?.features ?? null,
          shops: shops?.features ?? null,
          toilets: toilets?.features ?? null,
          drinkingWater: drinkingWater?.features ?? null,
          parks: parks?.features ?? null
        });
        const alSafa2 = parks?.features.find(
          f => f.geometry.type === 'Polygon' && (f.properties as any)?.name === AL_SAFA_2_ARABIC_NAME
        );
        if (alSafa2) setParkPolygon(alSafa2 as unknown as Feature<Polygon>);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Failed to load site evidence');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Opportunity Lab's 10m site grid needs real building/road geometry scoped to the park's own
  // small bbox (same pattern as PlaygroundTab's Opportunity Lab data fetch) -- this is what makes
  // gisSummary.opportunities the exact same catalog Opportunity Lab itself renders.
  useEffect(() => {
    if (!parkPolygon) return;
    let cancelled = false;
    const bbox = turfBbox(parkPolygon) as [number, number, number, number];
    (async () => {
      const [buildingsRes, roadsRes] = await Promise.all([
        fetchGisLayer('buildings', bbox),
        fetchGisLayer('roads', bbox)
      ]);
      if (cancelled) return;
      if (buildingsRes) setOppBuildings(buildingsRes.features);
      if (roadsRes) setOppRoads(roadsRes.features);
    })();
    return () => { cancelled = true; };
  }, [parkPolygon]);

  const siteGrid = useMemo(() => {
    if (!parkPolygon || hexes.length === 0) return [];
    return buildSiteGrid(parkPolygon, hexes, oppBuildings, oppRoads);
  }, [parkPolygon, hexes, oppBuildings, oppRoads]);

  const opportunities: OpportunityResult[] = useMemo(() => {
    if (siteGrid.length === 0) return [];
    return computeAllOpportunities(siteGrid, reviews, manifest?.roadStats ?? null);
  }, [siteGrid, reviews, manifest]);

  const areaReconciliation = useMemo(() => buildAreaReconciliation({
    briefGrossAreaM2: AL_SAFA_2_COMPETITION_BRIEF.areaStatement.grossSiteAreaM2,
    measuredBoundaryAreaM2: parkPolygon ? measureSiteBoundaryAreaM2(parkPolygon) : null,
    maximumLeasableAreaPercent: AL_SAFA_2_COMPETITION_BRIEF.areaStatement.maximumLeasableAreaPercent,
    opportunities,
    settings: masterplanSettings
  }), [parkPolygon, opportunities, masterplanSettings]);

  const reviewSummary = useMemo(() => reviews.length ? buildReviewSummary(reviews) : null, [reviews]);
  const gisSummary = useMemo(() => {
    if (!facilities || hexes.length === 0 || opportunities.length === 0) return null;
    return buildGisSummary({
      hexes,
      busStops,
      roadStats: manifest?.roadStats ?? null,
      accessibilityStats: manifest?.accessibilityStats ?? null,
      reviews,
      parkCenter,
      facilities,
      opportunities
    });
  }, [hexes, busStops, manifest, reviews, parkCenter, facilities, opportunities]);

  const ready = !loading && !!reviewSummary && !!gisSummary;

  async function handleRunSynthesis() {
    if (!reviewSummary || !gisSummary) return;
    setRunning(true);
    setRunError(null);
    try {
      const synthesis = await generateResultsSynthesis({
        reviewSummary,
        gisSummary,
        climateSummary: AL_SAFA_2_CLIMATE_SUMMARY,
        competitionBrief: AL_SAFA_2_COMPETITION_BRIEF
      });
      setResult(synthesis);
    } catch (e: any) {
      setRunError(e?.message || 'Synthesis failed');
    } finally {
      setRunning(false);
    }
  }

  function handleExportGrasshopperPackage() {
    if (!result || !parkPolygon || siteGrid.length === 0 || opportunities.length === 0) return;
    const selectedProgramZones: Record<string, string> = {};
    for (const row of result.archetype_experience_matrix) {
      const type = row.tier_5_assigned_space.opportunity_type;
      if (type && !(type in selectedProgramZones)) {
        selectedProgramZones[type] = row.tier_6_spatial_properties_and_scores.preferred_location_zone;
      }
    }
    const files = buildParkDesignPackageFiles({
      siteName: AL_SAFA_2_COMPETITION_BRIEF.siteName,
      siteBoundary: parkPolygon,
      siteGrid,
      opportunities,
      selectedProgramZones,
      acceptedRuleEdges,
      unresolvedRules,
      h3Catchment: hexes,
      roads: oppRoads,
      buildings: oppBuildings,
      schools: facilities?.schools ?? [],
      busStops,
      masterplanSettings,
      climateSummary: AL_SAFA_2_CLIMATE_SUMMARY,
      personaJourneys: result.persona_journeys,
      roadEdgeRoles: [
        { edge: 'northwest', role: 'road_facing', authority: 'competition_site_context' },
        { edge: 'southwest', role: 'road_facing', authority: 'competition_site_context' }
      ]
    });
    downloadZip(files, 'al_safa_2_park_design_package.zip');
  }

  function handleExportSpaceGraph() {
    if (!result) return;
    downloadJson({ space_graph: result.space_graph, persona_journeys: result.persona_journeys }, 'al_safa_2_space_graph_and_journeys.json');
  }

  const handleRuleCompilationChange = useCallback((accepted: CompiledRuleEdge[], unresolved: UnresolvedApprovedRule[]) => {
    setAcceptedRuleEdges(accepted);
    setUnresolvedRules(unresolved);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading site evidence (GIS, reviews, facility layers)...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
      <SectionCard
        icon={Sparkles}
        title="Results -- Experience-to-Space Synthesis"
        action={
          <div className="flex items-center gap-2">
            {result && (
              <button
                onClick={handleExportSpaceGraph}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Download className="w-3 h-3" />
                Export Space Graph &amp; Journeys JSON
              </button>
            )}
            {result && (
              <button
                onClick={handleExportGrasshopperPackage}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Download className="w-3 h-3" />
                Export Grasshopper Package
              </button>
            )}
            <button
              onClick={handleRunSynthesis}
              disabled={!ready || running}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {result ? 'Re-run Synthesis' : 'Run Synthesis'}
            </button>
          </div>
        }
      >
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Combines review analytics, GIS/H3 catchment analysis, and the infrared.city CFD/UTCI microclimate simulation
          for {AL_SAFA_2_COMPETITION_BRIEF.siteName} into a single 6-tier flow: Age Group (persona) &rarr; User Archetype &rarr; Activities &rarr;
          Desired Experience &rarr; Usable Space &amp; Amenities (from Opportunity Lab) &rarr; Spatial Score &amp; Cost, checked against the {AL_SAFA_2_COMPETITION_BRIEF.totalSiteAreaM2Cap.toLocaleString()} m&sup2; site
          cap and AED {(AL_SAFA_2_COMPETITION_BRIEF.totalBudgetCapAed / 1_000_000).toFixed(0)}M budget cap.
        </p>
        {reviewSummary && gisSummary && (
          <p className="text-[9px] text-slate-400 mt-2">
            Evidence loaded: {reviewSummary.totalReviews} analyzed reviews, {hexes.length} H3 cells (~{gisSummary.h3CatchmentAreaKm2} km&sup2;),
            {' '}{gisSummary.opportunities.length} Opportunity Lab program spaces, infrared.city climate simulation ({AL_SAFA_2_CLIMATE_SUMMARY.source.split(',')[1]?.trim()}).
          </p>
        )}
        {!gisSummary && !loading && !loadError && (
          <p className="text-[9px] text-amber-600 mt-2">Building Opportunity Lab's site grid (buildings/roads for the park's own footprint)...</p>
        )}
      </SectionCard>

      {(loadError || runError) && (
        <div className="flex items-center gap-2 p-3 rounded border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-semibold">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{loadError || runError}</span>
        </div>
      )}

      <ParkBrainKnowledgeGuide />
      <ApprovedRuleCompilerPanel
        opportunities={opportunities}
        onCompilationChange={handleRuleCompilationChange}
      />

      <MasterplanExportSettingsPanel settings={masterplanSettings} onChange={setMasterplanSettings} />

      {parkPolygon && opportunities.length > 0 && (
        <AreaReconciliationPanel reconciliation={areaReconciliation} />
      )}

      {parkPolygon && siteGrid.length > 0 && opportunities.length > 0 && (
        <MovementGisOverlay
          siteGrid={siteGrid}
          opportunities={opportunities}
          parkBoundary={parkPolygon}
          parkCenter={parkCenter}
        />
      )}

      {result && (
        <>
          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Engine: {result.engine}</div>
          <BudgetStatusCard projectMetadata={result.project_metadata} />
          <SharedPrioritySpaces spaces={result.shared_priority_spaces} />
          <ExperienceSankeyFlow rows={result.archetype_experience_matrix} />
          <ExperienceMatrixTable rows={result.archetype_experience_matrix} />
          <SpaceJourneyGraph spaceGraph={result.space_graph} personaJourneys={result.persona_journeys} />
        </>
      )}

      {!result && !running && (
        <div className="text-center text-[10px] text-slate-400 font-semibold py-10">
          Click "Run Synthesis" to generate the Experience-to-Space Matrix.
        </div>
      )}
    </div>
  );
}
