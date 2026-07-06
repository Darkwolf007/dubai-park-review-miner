import { useMemo } from 'react';
import { MessageSquare, MapPin, Star, Smile, ThumbsUp, Meh, ThumbsDown, Layers, Brain, Lightbulb, AlertOctagon, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeKPIs, type KpiId } from '../../lib/analytics/kpis';
import { StatCard } from '../ui/StatCard';

const KPI_META: Record<KpiId, { label: string; icon: LucideIcon; tooltip: string; positiveIsGood: boolean }> = {
  totalReviews: { label: 'Total Reviews', icon: MessageSquare, tooltip: 'Total analyzed reviews across all selected parks.', positiveIsGood: true },
  parksSelected: { label: 'Parks Selected', icon: MapPin, tooltip: 'Number of parks currently included in this analysis.', positiveIsGood: true },
  avgRating: { label: 'Average Rating', icon: Star, tooltip: 'Mean Google star rating across all analyzed reviews.', positiveIsGood: true },
  sentimentScore: { label: 'Sentiment Score', icon: Smile, tooltip: 'Overall sentiment, rescaled 0-100 (50 = neutral, 100 = entirely positive).', positiveIsGood: true },
  positivePct: { label: 'Positive %', icon: ThumbsUp, tooltip: 'Share of reviews classified as POSITIVE.', positiveIsGood: true },
  neutralPct: { label: 'Neutral %', icon: Meh, tooltip: 'Share of reviews classified as NEUTRAL.', positiveIsGood: false },
  negativePct: { label: 'Negative %', icon: ThumbsDown, tooltip: 'Share of reviews classified as NEGATIVE.', positiveIsGood: false },
  themeCount: { label: 'Themes', icon: Layers, tooltip: 'Distinct landscape issue categories detected in this dataset (of 16 possible).', positiveIsGood: true },
  aiConfidence: { label: 'AI Confidence', icon: Brain, tooltip: 'Average keyword-match confidence behind each issue-category classification.', positiveIsGood: true },
  designOpportunities: { label: 'Design Opportunities', icon: Lightbulb, tooltip: 'Issue categories with Medium priority or above -- candidates for design intervention.', positiveIsGood: false },
  criticalIssues: { label: 'Critical Issues', icon: AlertOctagon, tooltip: 'Issue categories with High or Very High priority -- needs urgent attention.', positiveIsGood: false },
  avgReviewLength: { label: 'Avg Review Length', icon: FileText, tooltip: 'Average word count per review -- a proxy for how detailed feedback tends to be.', positiveIsGood: true }
};

export function KpiGrid({ reviews, parksSelectedCount }: { reviews: NLPAnalyzedReview[]; parksSelectedCount: number }) {
  const stats = useMemo(() => computeKPIs(reviews, parksSelectedCount), [reviews, parksSelectedCount]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
      {stats.map(stat => {
        const meta = KPI_META[stat.id];
        return (
          <StatCard
            key={stat.id}
            icon={meta.icon}
            label={meta.label}
            value={stat.displayValue}
            trend={stat.trend}
            trendPct={stat.trendPct}
            sparkline={stat.sparkline}
            tooltip={`${meta.tooltip}${stat.timeBasis === 'sequence' ? ' (trend ordered by available data, not calendar time.)' : ''}`}
            positiveIsGood={meta.positiveIsGood}
          />
        );
      })}
    </div>
  );
}
