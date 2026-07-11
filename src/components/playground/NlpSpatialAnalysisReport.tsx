import { useMemo, useRef, useState } from 'react';
import {
  Download, FileSpreadsheet, FileJson, Camera, FileText, Package,
  Sparkles, MessageSquareText, Search
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import type { H3Feature, RoadStats } from '../../lib/gis/types';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import type { NlpSpatialAnalysisReportData } from '../../lib/gis/reviewNlpSpatialEngine';
import type { NlpSpatialInsightsResult } from '../../lib/gis/nlpSpatialInsightsEngine';
import { computeNlpGrasshopperExport, nlpGrasshopperExportToCsv, type NlpTopicRate } from '../../lib/gis/grasshopperExportEngine';
import { downloadCsv, downloadExcel, downloadGeoJson, downloadJson, downloadMapScreenshot } from '../../lib/gis/exportEngine';
import { MetricTile } from './MetricTile';
import { CollapsibleSection } from './CollapsibleSection';
import { Pill } from '../ui/Pill';

const SENTIMENT_COLORS: Record<string, string> = { POSITIVE: '#10b981', NEUTRAL: '#94a3b8', NEGATIVE: '#e34948' };
const SEVERITY_COLORS: Record<string, string> = { Critical: 'text-rose-600', High: 'text-orange-600', Medium: 'text-amber-600', Low: 'text-slate-400' };
const BADGE_COLORS: Record<string, string> = {
  'VERY NEGATIVE': 'bg-rose-50 border-rose-200 text-rose-700',
  'NEGATIVE': 'bg-orange-50 border-orange-200 text-orange-700',
  'MIXED': 'bg-amber-50 border-amber-200 text-amber-700',
  'POSITIVE': 'bg-indigo-50 border-indigo-200 text-indigo-700',
  'VERY POSITIVE': 'bg-emerald-50 border-emerald-200 text-emerald-700'
};

export function NlpSpatialAnalysisReport({
  report,
  aiInsights,
  aiInsightsError,
  hexes,
  reviews,
  roadStats
}: {
  report: NlpSpatialAnalysisReportData;
  aiInsights: NlpSpatialInsightsResult | null;
  aiInsightsError: string | null;
  hexes: H3Feature[];
  reviews: NLPAnalyzedReview[];
  roadStats: RoadStats | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    executiveSummary, cleaning, kpis, topicAnalysis, complaints, positiveFeatures, userGroups,
    temporal, ratingSentimentMismatches, requirements
  } = report;

  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerTopic, setExplorerTopic] = useState<string>('all');
  const [explorerSentiment, setExplorerSentiment] = useState<string>('all');

  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (explorerTopic !== 'all' && r.issueCategory !== explorerTopic) return false;
      if (explorerSentiment !== 'all' && r.sentiment !== explorerSentiment) return false;
      if (explorerSearch && !r.reviewText.toLowerCase().includes(explorerSearch.toLowerCase())) return false;
      return true;
    }).slice(0, 50);
  }, [reviews, explorerTopic, explorerSentiment, explorerSearch]);

  function exportCsvRows() {
    const rows: Record<string, any>[] = [];
    rows.push({ section: 'Executive Summary', metric: 'Overall Sentiment', value: `${executiveSummary.overallCommunitySatisfactionScore}/100 (${executiveSummary.overallSentiment})` });
    rows.push({ section: 'Executive Summary', metric: 'Top Positive Topic', value: executiveSummary.topPositiveTopic });
    rows.push({ section: 'Executive Summary', metric: 'Top Negative Topic', value: executiveSummary.topNegativeTopic });
    kpis.metrics.forEach(m => rows.push({ section: 'Review KPIs', metric: m.label, value: m.displayValue }));
    complaints.forEach(c => rows.push({ section: 'Complaints', metric: c.category, value: `${c.mentions} mentions, ${c.severity}` }));
    return rows;
  }

  function toCsvString(rows: Record<string, any>[]): string {
    if (rows.length === 0) return '';
    const cols = Object.keys(rows[0]);
    return [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  }

  function handleGrasshopperExport(format: 'json' | 'csv' | 'geojson') {
    const topicRates: NlpTopicRate[] = topicAnalysis.rows.map(r => ({
      category: r.category,
      mentionShare: reviews.length > 0 ? r.multiLabelMentions / reviews.length : 0,
      positiveSharePct: r.positiveSharePct,
      negativeSharePct: r.negativeSharePct,
      mentions: r.multiLabelMentions
    }));
    const gh = computeNlpGrasshopperExport(hexes, reviews.length, kpis.overallSentimentScore, topicRates);
    if (format === 'json') downloadJson(gh, 'nlp_design_inputs.json');
    if (format === 'csv') downloadCsv(nlpGrasshopperExportToCsv(gh), 'nlp_design_inputs.csv');
    if (format === 'geojson') {
      downloadGeoJson({
        type: 'FeatureCollection',
        features: hexes.map((h, i) => ({ type: 'Feature', geometry: h.geometry, properties: { h3_id: h.properties.h3_id, ...gh.cells[i] } }))
      }, 'nlp_design_inputs.geojson');
    }
  }

  const availableTopics = useMemo(() => Array.from(new Set(reviews.map(r => r.issueCategory))).sort(), [reviews]);

  return (
    <div ref={containerRef} className="space-y-2">
      {/* EXPORT TOOLBAR */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => downloadCsv(toCsvString(exportCsvRows()), 'nlp_spatial_analysis.csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> CSV
        </button>
        <button onClick={() => downloadExcel(exportCsvRows(), 'nlp_spatial_analysis.xlsx', 'NLP Spatial Analysis')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="w-3 h-3" /> Excel
        </button>
        <button onClick={() => downloadGeoJson({ type: 'FeatureCollection', features: hexes }, 'nlp_h3_grid.geojson')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="w-3 h-3" /> GeoJSON
        </button>
        <button onClick={() => downloadJson(report, 'nlp_spatial_analysis.json')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <FileJson className="w-3 h-3" /> Analysis JSON
        </button>
        <button onClick={() => containerRef.current && downloadMapScreenshot(containerRef.current, 'nlp_spatial_analysis.png')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Camera className="w-3 h-3" /> PNG
        </button>
        <button disabled title="Not yet available -- needs a PDF report layout engine" className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-300 cursor-not-allowed">
          <FileText className="w-3 h-3" /> PDF (soon)
        </button>
        <button disabled title="Not yet available -- needs a GeoPackage/Shapefile writer" className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-300 cursor-not-allowed">
          <Package className="w-3 h-3" /> GeoPackage / Shapefile (soon)
        </button>
      </div>

      {/* 1. EXECUTIVE SUMMARY */}
      <CollapsibleSection title="Executive Summary">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-extrabold text-slate-800">NLP Spatial Analysis Complete</span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${BADGE_COLORS[executiveSummary.overallSentiment]}`}>
            {executiveSummary.overallSentiment} &middot; {executiveSummary.overallCommunitySatisfactionScore}/100
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <MetricTile label="Reviews Analyzed" value={executiveSummary.reviewsAnalyzed.toLocaleString()} />
          <MetricTile label="Average Rating" value={`${executiveSummary.averageRating} / 5`} />
          <MetricTile label="Top Positive Topic" value={executiveSummary.topPositiveTopic} />
          <MetricTile label="Top Negative Topic" value={executiveSummary.topNegativeTopic} />
          <MetricTile label="Most Requested Improvement" value={executiveSummary.mostRequestedImprovement} />
          <MetricTile label="Most Mentioned User Group" value={executiveSummary.mostMentionedUserGroup} />
          <MetricTile label="Critical Issue Cluster" value={executiveSummary.criticalIssueCluster} />
        </div>
      </CollapsibleSection>

      {/* 2. REVIEW KPIs */}
      <CollapsibleSection title="Review KPIs" defaultOpen={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Metric</th>
                <th className="py-1.5 px-3 font-bold text-right">Value</th>
                <th className="py-1.5 px-3 font-bold">Source</th>
                <th className="py-1.5 pl-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {kpis.metrics.map(m => (
                <tr key={m.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-3 font-semibold text-slate-700">{m.label}{m.note && <p className="text-[8px] text-slate-400 font-normal mt-0.5">{m.note}</p>}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-slate-600">{m.displayValue}</td>
                  <td className="py-1.5 px-3 text-slate-500 text-[9px]">{m.dataSource}</td>
                  <td className={`py-1.5 pl-3 font-bold uppercase text-[9px] ${m.status === 'critical' ? 'text-rose-600' : m.status === 'watch' ? 'text-amber-600' : 'text-emerald-600'}`}>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[8px] text-slate-400 mt-2">{cleaning.languageNote}</p>
      </CollapsibleSection>

      {/* 3. TOPIC ANALYSIS */}
      <CollapsibleSection title="Topic Analysis" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2">Multi-label: a review can touch more than one topic. {topicAnalysis.rows.length} of 20 real topic categories appear in this review set (see Review KPIs for the full taxonomy accounting).</p>
        <div className="h-64 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topicAnalysis.rows.slice(0, 12).map(r => ({ name: r.category, mentions: r.multiLabelMentions }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="mentions" fill="#4a3aa7" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-left text-[9px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                <th className="py-1.5 pr-2 font-bold">Topic</th>
                <th className="py-1.5 px-2 font-bold text-right">Mentions</th>
                <th className="py-1.5 px-2 font-bold text-right">Positive %</th>
                <th className="py-1.5 px-2 font-bold text-right">Negative %</th>
                <th className="py-1.5 px-2 font-bold text-right">Avg Rating</th>
                <th className="py-1.5 pl-2 font-bold text-right">Trend</th>
              </tr>
            </thead>
            <tbody>
              {topicAnalysis.rows.map(r => (
                <tr key={r.category} className="border-b border-slate-100 last:border-0 text-slate-600">
                  <td className="py-1.5 pr-2"><Pill variant="category" value={r.category} /></td>
                  <td className="py-1.5 px-2 text-right font-mono">{r.multiLabelMentions}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-emerald-600">{r.positiveSharePct}%</td>
                  <td className="py-1.5 px-2 text-right font-mono text-rose-600">{r.negativeSharePct}%</td>
                  <td className="py-1.5 px-2 text-right font-mono">{r.avgRating}</td>
                  <td className="py-1.5 pl-2 text-right font-mono">{r.hasDateTrend ? `${r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '—'} ${r.trendPct}%` : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Topic Co-occurrence (Top Pairs)</p>
        <div className="flex flex-wrap gap-1">
          {topicAnalysis.cooccurrence.edges.slice(0, 15).map((e, i) => (
            <span key={i} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{e.source} + {e.target} ({e.weight})</span>
          ))}
        </div>
      </CollapsibleSection>

      {/* 4. SENTIMENT ANALYSIS */}
      <CollapsibleSection title="Sentiment Analysis" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Positive', value: kpis.metrics.find(m => m.key === 'positiveShare')?.value || 0 },
                    { name: 'Neutral', value: kpis.metrics.find(m => m.key === 'neutralShare')?.value || 0 },
                    { name: 'Negative', value: kpis.metrics.find(m => m.key === 'negativeShare')?.value || 0 }
                  ]}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.value}%`}
                >
                  <Cell fill={SENTIMENT_COLORS.POSITIVE} />
                  <Cell fill={SENTIMENT_COLORS.NEUTRAL} />
                  <Cell fill={SENTIMENT_COLORS.NEGATIVE} />
                </Pie>
                <Legend wrapperStyle={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Rating vs. Text Sentiment Mismatch</p>
            <p className="text-[9px] text-amber-600 font-semibold mb-1">{ratingSentimentMismatches.length} review(s) flagged where the star rating and sentence-level text sentiment conflict -- shown for manual review, not auto-resolved.</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {ratingSentimentMismatches.slice(0, 5).map((m, i) => (
                <div key={i} className="border border-amber-200 bg-amber-50/40 rounded p-1.5 text-[9px]">
                  <span className="font-bold">{m.rating}★</span> &mdash; {m.reviewText.slice(0, 100)}{m.reviewText.length > 100 ? '…' : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 5. COMPLAINT INTELLIGENCE */}
      <CollapsibleSection title="Complaint Intelligence" defaultOpen={false}>
        <div className="space-y-1.5">
          {complaints.slice(0, 10).map(c => (
            <div key={c.category} className="border border-slate-200 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-700 capitalize">{c.category}</span>
                <span className={`text-[9px] font-extrabold uppercase ${SEVERITY_COLORS[c.severity]}`}>{c.severity} &middot; {c.mentions} mentions</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-1">
                <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{c.negativeSharePct}% negative</span>
                <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">Avg rating: {c.avgRating}/5</span>
                <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">Trend: {c.recentTrend}</span>
                {c.affectedPersonas.map(p => <span key={p} className="text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{p}</span>)}
              </div>
              <p className="text-[8px] text-slate-500">{c.suggestedIntervention}</p>
              <span className="text-[8px] text-slate-400">{c.confidence}% confidence</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 6. POSITIVE EXPERIENCE INTELLIGENCE */}
      <CollapsibleSection title="Positive Experience Intelligence" defaultOpen={false}>
        <div className="space-y-1.5">
          {positiveFeatures.slice(0, 8).map(f => (
            <div key={f.category} className="border border-emerald-200 bg-emerald-50/30 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-emerald-700 capitalize">{f.category}</span>
                <span className="text-[9px] font-extrabold text-emerald-600">{f.positiveSharePct}% positive &middot; {f.mentions} mentions</span>
              </div>
              {f.quote && <p className="text-[8px] text-slate-500 italic">&ldquo;{f.quote.slice(0, 140)}{f.quote.length > 140 ? '…' : ''}&rdquo; &mdash; {f.quoteAuthor || 'Anonymous'}</p>}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 7. USER-GROUP ANALYSIS */}
      <CollapsibleSection title="User-Group Analysis" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">User groups are inferred from review-text keyword evidence only -- multi-label, estimated, never a confirmed demographic identity.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {userGroups.map(g => (
            <div key={g.id} className="border border-slate-200 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-700">{g.label}</span>
                <span className="text-[9px] font-extrabold text-indigo-700">{g.reviewCount} reviews</span>
              </div>
              {g.primaryNeeds.length > 0 && <p className="text-[8px] text-slate-500 mb-0.5"><span className="font-bold">Top Needs:</span> {g.primaryNeeds.join(', ')}</p>}
              {g.topComplaints.length > 0 && <p className="text-[8px] text-rose-500 mb-0.5"><span className="font-bold">Top Complaint:</span> {g.topComplaints[0].category}</p>}
              <p className="text-[8px] text-slate-400"><span className="font-bold">Likely Visit Time:</span> {g.likelyVisitTime} {g.visitTimeConfidence !== 'N/A' && `(${g.visitTimeConfidence} confidence)`}</p>
              {g.suggestedIntervention && <p className="text-[8px] text-indigo-600 mt-0.5">{g.suggestedIntervention}</p>}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* 8. TEMPORAL ANALYSIS */}
      <CollapsibleSection title="Temporal Analysis" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">Season/Ramadan/day-type use real review posting dates ({temporal.datedReviewShare}% of reviews have a parseable date). Posting time reflects when a review was WRITTEN, not necessarily when the visit happened. Time-of-day activity below is derived from review-text mentions, not measured foot traffic.</p>
        <div className="h-40 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={temporal.monthlyVolumeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 7, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Line type="monotone" dataKey="count" stroke="#4a3aa7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[8px] text-slate-400 mb-2">Monthly review volume trend: {temporal.volumeTrend} ({temporal.volumeTrendPct}%)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Season</p>
            {temporal.seasonal.map(s => <div key={s.bucket} className="flex justify-between text-[9px] text-slate-600 border-b border-slate-50 py-0.5"><span>{s.bucket}</span><span className="font-mono">{s.reviewCount} reviews, {s.heatComplaintsPct}% heat complaints</span></div>)}
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Ramadan</p>
            {temporal.ramadan.map(s => <div key={s.bucket} className="flex justify-between text-[9px] text-slate-600 border-b border-slate-50 py-0.5"><span>{s.bucket}</span><span className="font-mono">{s.reviewCount} reviews</span></div>)}
          </div>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-2 mb-1">Time-of-Day Mentions (Review Text)</p>
        <div className="flex flex-wrap gap-1">
          {temporal.activityPatterns.map(a => <span key={a.key} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{a.label}: {a.mentionCount}</span>)}
        </div>
      </CollapsibleSection>

      {/* 9. SPATIAL REVIEW ANALYSIS & H3 REVIEW INTELLIGENCE */}
      <CollapsibleSection title="Spatial Review Analysis & H3 Review Intelligence" defaultOpen={false}>
        <p className="text-[9px] text-amber-600 font-semibold mb-2">Spatial confidence for every review-derived figure: <span className="font-bold">Park-Level</span> (never Exact/Facility-Level). Reviews are geocoded only to the single park coordinate -- confirmed no per-review location exists in this dataset. H3-level values below are a population-weighted redistribution of the one real park-level complaint rate, not measured per-cell review activity.</p>
        <MetricTile label="Spatial Data Source" value="Park-level single point + population-weighted redistribution" />
      </CollapsibleSection>

      {/* 10. DESIGN REQUIREMENT MATRIX */}
      <CollapsibleSection title="Design Requirement Matrix" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2">Cross-analysis fusion: each requirement below combines real NLP complaint evidence with real per-hex signals from Environmental, Accessibility, and Community Analysis where a direct topic link exists.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[9px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                <th className="py-1.5 pr-2 font-bold">ID</th>
                <th className="py-1.5 px-2 font-bold">Requirement</th>
                <th className="py-1.5 px-2 font-bold">Priority</th>
                <th className="py-1.5 px-2 font-bold text-right">Evidence</th>
                <th className="py-1.5 pl-2 font-bold text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map(r => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-1.5 pr-2 font-mono text-slate-400">{r.id}</td>
                  <td className="py-1.5 px-2 text-slate-700 font-semibold">
                    {r.requirement}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.crossAnalysisEvidence.map((e, i) => <span key={i} className="text-[8px] bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded border border-indigo-200">{e}</span>)}
                    </div>
                  </td>
                  <td className="py-1.5 px-2"><Pill variant="priority" value={r.priority === 'Must Have' ? 'Very High' : r.priority === 'High Priority' ? 'High' : r.priority === 'Medium Priority' ? 'Medium' : 'Low'} /></td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-500">{r.evidenceCount}</td>
                  <td className="py-1.5 pl-2 text-right font-mono text-slate-500">{r.confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* 11. AI INTERPRETATION */}
      <CollapsibleSection title="AI Interpretation">
        {aiInsightsError && <p className="text-[10px] font-semibold text-rose-600">{aiInsightsError}</p>}
        {!aiInsights && !aiInsightsError && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">AI interpretation unavailable for this run.</p>}
        {aiInsights && (
          <div className="space-y-2 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[8px] text-slate-400 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> {aiInsights.engine}</span>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Overall Community Perception</p>
              <p className="text-slate-700 leading-relaxed">{aiInsights.overallCommunityPerception}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Most Valued Features</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.mostValuedFeatures.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-rose-500 mb-1">Most Critical Problems</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.mostCriticalProblems.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Retain and Protect</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.retainAndProtect.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Improve and Expand</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600">{aiInsights.improveAndExpand.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 12. SUPPORTING EVIDENCE */}
      <CollapsibleSection title="Supporting Evidence" defaultOpen={false}>
        {!aiInsights && <p className="text-slate-400 text-[10px] font-semibold text-center py-4">Run the analysis to generate evidence-backed recommendations.</p>}
        {aiInsights && (
          <div className="space-y-2">
            {aiInsights.priorityRecommendations.map((rec, i) => (
              <div key={i} className="border border-slate-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-700">{rec.intervention}</span>
                  <span className="text-[9px] font-extrabold text-indigo-700">{rec.confidence}% confidence</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {rec.evidence.map((e, j) => <span key={j} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{e}</span>)}
                </div>
                <span className={`text-[8px] font-bold uppercase tracking-wider ${rec.priority === 'Very High' || rec.priority === 'High' ? 'text-rose-600' : rec.priority === 'Medium' ? 'text-amber-600' : 'text-slate-400'}`}>Priority: {rec.priority}</span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* 13. GRASSHOPPER DESIGN INPUTS */}
      <CollapsibleSection title="Grasshopper Design Inputs" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2">Per-hex normalized (0-1) demand fields (population-weighted redistribution of real park-level topic evidence) plus a program list with real demand scores from complaint/positive-sentiment evidence.</p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => handleGrasshopperExport('json')} className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700">
            <FileJson className="w-3 h-3" /> Export NLP Design Inputs to Grasshopper
          </button>
          <button onClick={() => handleGrasshopperExport('csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> CSV
          </button>
          <button onClick={() => handleGrasshopperExport('geojson')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> GeoJSON
          </button>
        </div>
      </CollapsibleSection>

      {/* 14. REVIEW EXPLORER */}
      <CollapsibleSection title="Review Explorer" defaultOpen={false}>
        <p className="text-[9px] text-slate-500 mb-2 flex items-center gap-1"><MessageSquareText className="w-3 h-3 text-indigo-500" /> Search and filter the real underlying review set. Corrections are not implemented in this build (no backend store for manual labels) -- filters are session-only.</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input value={explorerSearch} onChange={e => setExplorerSearch(e.target.value)} placeholder="Search review text..." className="w-full pl-6 pr-2 py-1 text-[10px] border border-slate-200 rounded" />
          </div>
          <select value={explorerTopic} onChange={e => setExplorerTopic(e.target.value)} className="text-[10px] border border-slate-200 rounded px-1.5 py-1">
            <option value="all">All Topics</option>
            {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={explorerSentiment} onChange={e => setExplorerSentiment(e.target.value)} className="text-[10px] border border-slate-200 rounded px-1.5 py-1">
            <option value="all">All Sentiment</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEUTRAL">Neutral</option>
            <option value="NEGATIVE">Negative</option>
          </select>
        </div>
        <p className="text-[8px] text-slate-400 mb-1">Showing {filteredReviews.length} of {reviews.length} reviews (capped at 50).</p>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filteredReviews.map((r, i) => (
            <div key={i} className="border border-slate-200 rounded p-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-bold text-slate-700">{r.authorName || 'Anonymous'} &middot; {r.rating}★</span>
                <div className="flex gap-1">
                  <Pill variant="sentiment" value={r.sentiment} />
                  <Pill variant="category" value={r.issueCategory} />
                </div>
              </div>
              <p className="text-[9px] text-slate-600">{r.reviewText}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
