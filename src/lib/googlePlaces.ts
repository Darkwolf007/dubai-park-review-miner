import { Review } from './nlpPlaceholders';

export interface ParkDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  rating: number;
  userRatingsTotal: number;
  openingHours: string[];
  types: string[];
  website?: string;
  phoneNumber?: string;
  mapsUrl: string;
  reviews: Review[];
}

export const PRESEEDED_PARKS: ParkDetails[] = [
  {
    placeId: 'ChIJW2n2fB9tXz4R3Gqf-661oQE',
    name: 'Al Safa 2 Park',
    formattedAddress: 'Al Safa 2, Dubai, United Arab Emirates',
    lat: 25.1706,
    lng: 55.2289,
    rating: 4.4,
    userRatingsTotal: 1450,
    openingHours: ['Monday: 8:00 AM – 11:00 PM', 'Tuesday: 8:00 AM – 11:00 PM', 'Wednesday: 8:00 AM – 11:00 PM', 'Thursday: 8:00 AM – 11:00 PM', 'Friday: 8:00 AM – 11:00 PM', 'Saturday: 8:00 AM – 11:00 PM', 'Sunday: 8:00 AM – 11:00 PM'],
    types: ['park', 'tourist_attraction', 'point_of_interest', 'establishment'],
    website: 'https://www.dm.gov.ae',
    phoneNumber: '+971 800 900',
    mapsUrl: 'https://maps.google.com/?cid=12345678910',
    reviews: [
      {
        parkName: 'Al Safa 2 Park',
        placeId: 'ChIJW2n2fB9tXz4R3Gqf-661oQE',
        authorName: 'Fatima Al Mansoori',
        rating: 5,
        reviewText: 'Beautiful neighborhood park! Extremely peaceful and clean. Excellent jogging track and plenty of green grass for children to play. The landscaping is gorgeous, especially the flowers during winter. Good toilet facilities too.',
        publishedTimeStr: '2 months ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-05'
      }
    ]
  },
  {
    placeId: 'ChIJK5g4bKNoXz4RHm7pI_U_mHk',
    name: 'Safa Park',
    formattedAddress: 'Sheikh Zayed Rd, Al Safa 1, Dubai, United Arab Emirates',
    lat: 25.1843,
    lng: 55.2494,
    rating: 4.5,
    userRatingsTotal: 8200,
    openingHours: ['Monday: 8:00 AM – 11:00 PM', 'Tuesday: 8:00 AM – 11:00 PM', 'Wednesday: 8:00 AM – 11:00 PM', 'Thursday: 8:00 AM – 11:00 PM', 'Friday: 8:00 AM – 11:30 PM', 'Saturday: 8:00 AM – 11:30 PM', 'Sunday: 8:00 AM – 11:00 PM'],
    types: ['park', 'tourist_attraction', 'point_of_interest', 'establishment'],
    website: 'https://www.dm.gov.ae/safa-park',
    phoneNumber: '+971 800 900',
    mapsUrl: 'https://maps.google.com/?cid=9876543210',
    reviews: [
      {
        parkName: 'Safa Park',
        placeId: 'ChIJK5g4bKNoXz4RHm7pI_U_mHk',
        authorName: 'Sarah Johnson',
        rating: 5,
        reviewText: 'An absolute icon in Dubai. The views of the Burj Khalifa from across the lake are stunning. Incredible microclimate because of the dense mature trees. Highly recommend taking a boat ride on the water feature. Excellent maintenance!',
        publishedTimeStr: '3 days ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-05'
      }
    ]
  },
  {
    placeId: 'ChIJ_4r62FpCXz4R7K0_5nO00w0',
    name: 'Zabeel Park',
    formattedAddress: 'Al Kifaf, Dubai, United Arab Emirates',
    lat: 25.2348,
    lng: 55.3021,
    rating: 4.6,
    userRatingsTotal: 24500,
    openingHours: ['Monday: 8:00 AM – 11:00 PM', 'Tuesday: 8:00 AM – 11:00 PM', 'Wednesday: 8:00 AM – 11:00 PM', 'Thursday: 8:00 AM – 11:00 PM', 'Friday: 8:00 AM – 11:30 PM', 'Saturday: 8:00 AM – 11:30 PM', 'Sunday: 8:00 AM – 11:00 PM'],
    types: ['park', 'tourist_attraction', 'point_of_interest', 'establishment'],
    website: 'https://www.dm.gov.ae/zabeel-park',
    phoneNumber: '+971 4 398 6888',
    mapsUrl: 'https://maps.google.com/?cid=1122334455',
    reviews: [
      {
        parkName: 'Zabeel Park',
        placeId: 'ChIJ_4r62FpCXz4R7K0_5nO00w0',
        authorName: 'Mohammed bin Rashed',
        rating: 5,
        reviewText: 'Home of the Dubai Frame! Incredible park, modern and vast. The landscaping is pristine, and the integration of water features and lighting at night is perfect. Great food kiosks and coffee shops around the frame.',
        publishedTimeStr: '2 weeks ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-05'
      }
    ]
  },
  {
    placeId: 'ChIJb6e9Z0lCXz4Rt_41A7N_s7A',
    name: 'Creek Park',
    formattedAddress: 'Umm Hurair 2, Dubai, United Arab Emirates',
    lat: 25.2405,
    lng: 55.3275,
    rating: 4.5,
    userRatingsTotal: 15400,
    openingHours: ['Monday: 8:00 AM – 11:00 PM', 'Tuesday: 8:00 AM – 11:00 PM', 'Wednesday: 8:00 AM – 11:00 PM', 'Thursday: 8:00 AM – 11:00 PM', 'Friday: 8:00 AM – 11:00 PM', 'Saturday: 8:00 AM – 11:00 PM', 'Sunday: 8:00 AM – 11:00 PM'],
    types: ['park', 'tourist_attraction', 'point_of_interest', 'establishment'],
    phoneNumber: '+971 800 900',
    mapsUrl: 'https://maps.google.com/?cid=12121212',
    reviews: [
      {
        parkName: 'Creek Park',
        placeId: 'ChIJb6e9Z0lCXz4Rt_41A7N_s7A',
        authorName: 'Yusuf Al Blooshi',
        rating: 5,
        reviewText: 'Unbelievable waterfront park. Walking along the Dubai Creek with the refreshing sea breeze is magical. The dolphinarium is great, and there are wonderful sports facilities for cycling and running. Excellent greenery.',
        publishedTimeStr: '1 month ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-05'
      }
    ]
  },
  {
    placeId: 'ChIJhXfP-wVqXz4R9R_f-661oQE',
    name: 'Al Barsha Pond Park',
    formattedAddress: 'Al Barsha 2, Dubai, United Arab Emirates',
    lat: 25.1097,
    lng: 55.2014,
    rating: 4.6,
    userRatingsTotal: 4800,
    openingHours: ['Monday: 8:00 AM – 11:00 PM', 'Tuesday: 8:00 AM – 11:00 PM', 'Wednesday: 8:00 AM – 11:00 PM', 'Thursday: 8:00 AM – 11:00 PM', 'Friday: 8:00 AM – 11:30 PM', 'Saturday: 8:00 AM – 11:30 PM', 'Sunday: 8:00 AM – 11:00 PM'],
    types: ['park', 'tourist_attraction', 'point_of_interest', 'establishment'],
    mapsUrl: 'https://maps.google.com/?cid=15151515',
    reviews: [
      {
        parkName: 'Al Barsha Pond Park',
        placeId: 'ChIJhXfP-wVqXz4R9R_f-661oQE',
        authorName: 'James C.',
        rating: 5,
        reviewText: 'Outstanding pond park with a 1.5km synthetic running track encircling the main water body. Excellent sports facilities including basketball and volleyball courts. Extremely safe and family-friendly with gated entries.',
        publishedTimeStr: '2 weeks ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-05'
      }
    ]
  },
  {
    placeId: 'ChIJJ67g-5doXz4RH84_s7N0w0',
    name: 'Al Khazzan Park',
    formattedAddress: 'Al Safa St, Al Satwa, Dubai, United Arab Emirates',
    lat: 25.2081,
    lng: 55.2691,
    rating: 4.3,
    userRatingsTotal: 1200,
    openingHours: ['Monday: 8:00 AM – 11:00 PM', 'Tuesday: 8:00 AM – 11:00 PM', 'Wednesday: 8:00 AM – 11:00 PM', 'Thursday: 8:00 AM – 11:00 PM', 'Friday: 8:00 AM – 11:00 PM', 'Saturday: 8:00 AM – 11:00 PM', 'Sunday: 8:00 AM – 11:00 PM'],
    types: ['park', 'point_of_interest', 'establishment'],
    mapsUrl: 'https://maps.google.com/?cid=17171717',
    reviews: [
      {
        parkName: 'Al Khazzan Park',
        placeId: 'ChIJJ67g-5doXz4RH84_s7N0w0',
        authorName: 'Jassim Al Awadhi',
        rating: 5,
        reviewText: 'The UAE’s first solar-powered park! Beautifully designed around the iconic blue and white water tower. A green oasis in Satwa. Very clean and perfect seating areas next to native landscape greenery.',
        publishedTimeStr: '2 months ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-05'
      }
    ]
  },
  {
    placeId: 'ChIJ_al_mankhool_park',
    name: 'Al Mankhool Park',
    formattedAddress: 'Al Mankhool, Dubai, United Arab Emirates',
    lat: 25.2482,
    lng: 55.2894,
    rating: 4.3,
    userRatingsTotal: 850,
    openingHours: ['Open 24 hours'],
    types: ['park', 'point_of_interest', 'establishment'],
    mapsUrl: 'https://maps.google.com/?cid=18181818',
    reviews: [
      {
        parkName: 'Al Mankhool Park',
        placeId: 'ChIJ_al_mankhool_park',
        authorName: 'Ahmad Al Dhaheri',
        rating: 4,
        reviewText: 'Nice small community park with a good jogging track and play areas. Could use more shaded seating.',
        publishedTimeStr: '1 week ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-06'
      }
    ]
  },
  {
    placeId: 'ChIJUmmSuqeim123',
    name: 'Umm Suqeim Park',
    formattedAddress: 'Jumeirah Beach Road, Umm Suqeim, Dubai, United Arab Emirates',
    lat: 25.1451,
    lng: 55.1916,
    rating: 4.5,
    userRatingsTotal: 3400,
    openingHours: ['Monday: 8:00 AM – 10:00 PM', 'Tuesday: 8:00 AM – 10:00 PM', 'Wednesday: 8:00 AM – 10:00 PM', 'Thursday: 8:00 AM – 10:00 PM', 'Friday: 8:00 AM – 11:00 PM', 'Saturday: 8:00 AM – 11:00 PM', 'Sunday: 8:00 AM – 10:00 PM'],
    types: ['park', 'point_of_interest', 'establishment'],
    mapsUrl: 'https://maps.google.com/?cid=99999999',
    reviews: [
      {
        parkName: 'Umm Suqeim Park',
        placeId: 'ChIJUmmSuqeim123',
        authorName: 'Local Resident',
        rating: 5,
        reviewText: 'Beautiful views of Burj Al Arab! Perfect place to relax with kids. The sunset view from here is amazing.',
        publishedTimeStr: '1 week ago',
        language: 'en',
        source: 'Google Maps (Pre-seeded)',
        extractedDate: '2026-07-05'
      }
    ]
  }
];

export async function fetchParkDetails(placeId: string, customApiKey?: string): Promise<ParkDetails> {
  const preseeded = PRESEEDED_PARKS.find(p => p.placeId === placeId);
  
  try {
    const headers: { [key: string]: string } = { 'Content-Type': 'application/json' };
    if (customApiKey) {
      headers['x-google-maps-api-key'] = customApiKey;
    }
    
    const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`, {
      method: 'GET',
      headers
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.placeId) {
        return data as ParkDetails;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch from backend proxy, falling back to preseeded/mock data:', error);
  }

  if (preseeded) {
    return preseeded;
  }

  return {
    placeId,
    name: `Custom Park (${placeId.slice(0, 8)})`,
    formattedAddress: 'Manual Location Entry, Dubai, UAE',
    lat: 25.2048,
    lng: 55.2708,
    rating: 4.5,
    userRatingsTotal: 350,
    openingHours: ['Open 24 hours'],
    types: ['park', 'establishment'],
    mapsUrl: `https://maps.google.com/?q=place_id:${placeId}`,
    reviews: [
      {
        parkName: `Custom Park (${placeId.slice(0, 8)})`,
        placeId,
        authorName: 'Academic Reviewer',
        rating: 4,
        reviewText: 'Fascinating custom landscape study area. Solid structural boundaries, but requires more shade canopy and active water play features to mitigate heat islands.',
        publishedTimeStr: 'Recently',
        language: 'en',
        source: 'Google Maps (Dynamic Simulation)',
        extractedDate: '2026-07-05'
      }
    ]
  };
}
