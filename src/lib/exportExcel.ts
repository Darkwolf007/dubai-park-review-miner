import { utils, write, writeFile } from 'xlsx';
import { NLPAnalyzedReview } from './nlpPlaceholders';
import { ParkDetails } from './googlePlaces';

// Export the data as a multi-sheet Excel file (.xlsx)
export function exportParksToExcel(
  selectedParks: ParkDetails[],
  analyzedReviews: NLPAnalyzedReview[],
  fileName: string = 'dubai_parks_review_dataset.xlsx'
): void {
  // Sheet 1: Parks Summary
  const summaryData = selectedParks.map(park => ({
    'Place ID': park.placeId,
    'Park Name': park.name,
    'Formatted Address': park.formattedAddress,
    'Latitude': park.lat,
    'Longitude': park.lng,
    'Google Rating': park.rating,
    'Total Ratings Count': park.userRatingsTotal,
    'Website': park.website || 'N/A',
    'Phone Number': park.phoneNumber || 'N/A',
    'Google Maps URL': park.mapsUrl
  }));

  // Sheet 2: Reviews
  const reviewsData = analyzedReviews.map(rev => ({
    'Park Name': rev.parkName,
    'Place ID': rev.placeId,
    'Author Name': rev.authorName,
    'Rating': rev.rating,
    'Review Text': rev.reviewText,
    'Published Time': rev.publishedTimeStr || 'N/A',
    'Language': rev.language || 'N/A',
    'Source': rev.source,
    'Extracted Date': rev.extractedDate
  }));

  // Sheet 3: NLP Ready Dataset (With exact requested column mappings)
  const nlpData = analyzedReviews.map(rev => ({
    'park_name': rev.parkName,
    'review_text': rev.reviewText,
    'rating': rev.rating,
    'sentiment_placeholder': rev.sentiment,
    'topic_placeholder': rev.topic,
    'issue_category_placeholder': rev.issueCategory,
    'design_requirement_placeholder': rev.designRequirement
  }));

  // Create workbook
  const wb = utils.book_new();

  // Create worksheets
  const wsSummary = utils.json_to_sheet(summaryData);
  const wsReviews = utils.json_to_sheet(reviewsData);
  const wsNlp = utils.json_to_sheet(nlpData);

  // Append worksheets to workbook
  utils.book_append_sheet(wb, wsSummary, 'Parks Summary');
  utils.book_append_sheet(wb, wsReviews, 'Reviews');
  utils.book_append_sheet(wb, wsNlp, 'NLP Ready Dataset');

  // Write and download the file
  writeFile(wb, fileName);
}

// Export the data as a CSV file
export function exportToCSV(analyzedReviews: NLPAnalyzedReview[], fileName: string = 'dubai_parks_nlp_dataset.csv'): void {
  const headers = ['park_name', 'review_text', 'rating', 'sentiment_placeholder', 'topic_placeholder', 'issue_category_placeholder', 'design_requirement_placeholder'];
  
  const csvRows = [headers.join(',')];
  
  analyzedReviews.forEach(rev => {
    // Escape quotes and double backslashes for CSV safety
    const escape = (text: string) => {
      const formatted = (text || '').replace(/"/g, '""');
      return `"${formatted}"`;
    };

    const row = [
      escape(rev.parkName),
      escape(rev.reviewText),
      rev.rating,
      escape(rev.sentiment),
      escape(rev.topic),
      escape(rev.issueCategory),
      escape(rev.designRequirement)
    ];
    csvRows.push(row.join(','));
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export the data as a JSON file
export function exportToJSON(analyzedReviews: NLPAnalyzedReview[], fileName: string = 'dubai_parks_nlp_dataset.json'): void {
  const nlpData = analyzedReviews.map(rev => ({
    park_name: rev.parkName,
    review_text: rev.reviewText,
    rating: rev.rating,
    sentiment_placeholder: rev.sentiment,
    topic_placeholder: rev.topic,
    issue_category_placeholder: rev.issueCategory,
    design_requirement_placeholder: rev.designRequirement
  }));

  const jsonString = JSON.stringify(nlpData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
