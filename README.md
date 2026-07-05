# Dubai Park Review Miner (Thematic NLP Dataset Compiler)

A professional research tool designed for landscape architects, urban planners, and designers entering green space, masterplanning, or public park competitions in Dubai. 

This application lets you select, query, analyze, and compile park reviews and Google Places metadata into NLP-Ready research datasets. It uses rule-based semantic analysis and a server-side **Gemini 3.5 Flash** model proxy to identify core architectural issues (e.g., thermal comfort, playground standards, water features, lighting) and auto-draft spatial solutions.

---

## Key Core Features
1. **Interactive Park Directory & Search**: Full checklist and checkbox list containing 10 pre-seeded iconic Dubai parks (Zabeel Park, Safa Park, Al Safa 2 Park, Creek Park, Quranic Park, etc.) with coordinates, and options to add custom Google Place IDs manually.
2. **Interactive Vector GIS Map of Dubai**: Visual map that plots actual latitude/longitude locations on the Dubai coastline and E11 Sheikh Zayed Road transit corridor with active tooltips and click-to-toggle selectors.
3. **Double-Engine NLP Pipeline**:
   - **Local Fast Lexicon Engine**: Fast, offline rule-based thematic parser.
   - **Gemini 3.5 Flash AI Engine**: Server-side LLM proxy executing granular thematic parsing, keyword extraction, and auto-drafting professional landscape design specifications (using terminology like *xerophytic native flora*, *thermal microclimate canopy*, *Ghaf trees*, *porous EPDM tracks*, etc.).
4. **Thematic Dataset Explorer (Datagrid)**: Robust review explorer with rating stars, issues, sentiment badges, keyword tags, and design solutions. Fully searchable, sortable, and filterable.
5. **Multi-Format Export Suite (SheetJS)**:
   - **Sheet 1**: Parks Summary (Place ID, Geocoordinates, Google Rating, Web, Maps URL).
   - **Sheet 2**: Reviews (Author, Text, Star rating, Extracted date).
   - **Sheet 3**: **NLP Ready Dataset** (complying exactly with the specified architectural column schema: `park_name`, `review_text`, `rating`, `sentiment_placeholder`, `topic_placeholder`, `issue_category_placeholder`, `design_requirement_placeholder`).
   - Standard **CSV** and **JSON** export configurations.

---

## Technical Stack & Production Security
- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Motion.
- **Backend**: Node.js, Express, tsx.
- **AI Integrations**: `@google/genai` (Gemini 3.5 Flash model).
- **Storage**: SheetJS (`xlsx`) for data compilation.
- **Production Key Security**: 
  - To prevent client-side key exposure (avoiding browser inspection), all Google Places API details and Gemini API queries are proxied server-side via the Express `/api/*` routes. 
  - Credentials remain fully hidden on the server.

---

## Setup & Running Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Google Cloud Project & Keys
To retrieve live real-time reviews rather than using pre-seeded local data:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a Google Cloud Project.
3. Enable the **Places API** and **Maps JavaScript API** in the API Library.
4. Generate an **API Key** under **Credentials**.
5. Restrict the key to the Places API for security.

### 3. Configure Environment Variables
Create a `.env` file in the root directory based on `.env.example`:
```env
# Gemini API Key (Required for AI NLP analysis)
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"

# Google Places API Key (Required for live real-time places queries)
GOOGLE_MAPS_PLATFORM_KEY="YOUR_GOOGLE_PLACES_API_KEY_HERE"
```

In AI Studio, you can add these variables directly using the **Settings > Secrets** panel (type `GEMINI_API_KEY` or `GOOGLE_MAPS_PLATFORM_KEY` and input the key values).

### 4. Run Locally
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for Production
To bundle the full-stack server and static asset bundles:
```bash
npm run build
npm start
```

---

## Architectural Issue Categories
The tool processes reviews against these 16 core landscape competition tags:
- **shade / heat comfort** (Microclimate canopy, pergolas, Ghaf trees)
- **toilets** (Sanitary placement & operational hours)
- **cleanliness** (Smart compactor bins, operational corridors)
- **parking** (Permeable pavers, bioswales)
- **safety** (Passive surveillance, CPTED guidelines)
- **playground** (Inclusive multi-generational play, safety surfaces)
- **accessibility** (Universal ADA access, step-free pathways)
- **lighting** (Solar LED fixtures, evening active corridors)
- **crowding** (Curvilinear pathways, vegetative buffer zones)
- **maintenance** (GRC, local limestone, lifecycle durability)
- **seating** (Precast concrete benches with natural timber slats)
- **sports facilities** (Porous tracks, EPDM surfaces)
- **pets** (Fenced dog runs, turf drainage)
- **food / cafe** (Modular kiosks with vegetative screen walls)
- **water features** (Splash pads, microclimate evaporative cooling)
- **landscape / greenery** (Xerophytic planting, local flora)

---

## GitHub Private Repository Setup

To push this codebase to a new private repository on GitHub:

1. **Initialize Git & Commit Files:**
   If Git is not initialized yet in your workspace:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Dubai Park Review Miner"
   git branch -M main
   ```

2. **Create a Private Repo on GitHub:**
   - Go to [GitHub - New Repository](https://github.com/new).
   - Name the repository: `dubai-park-review-miner`.
   - Select **Private**.
   - Do **NOT** initialize it with a README, `.gitignore`, or license (as they already exist here).
   - Click **Create repository**.

3. **Link Local Git and Push:**
   Run the following commands in your terminal:
   ```bash
   git remote add origin https://github.com/Darkwolf007/dubai-park-review-miner.git
   git push -u origin main
   ```

---

## Vercel Deployment Instructions

This repository is pre-configured for direct full-stack deployment on Vercel using Vercel Serverless Functions (`vercel.json` + `api/index.ts`).

### Step-by-Step Deployment Guide

1. **Sign in / Sign up on Vercel:**
   Go to [Vercel](https://vercel.com/) and log in using your GitHub account (`Darkwolf007`).

2. **Import the Repository:**
   - On the Vercel Dashboard, click **Add New > Project**.
   - Find your private repository `dubai-park-review-miner` and click **Import**.

3. **Configure Settings:**
   - **Framework Preset**: Select **Vite** (Vercel should auto-detect this).
   - **Root Directory**: Keep as `./` (root).
   - **Build and Development Settings**: Keep defaults (Vercel will use `npm run build` which builds Vite and bundles the server).
   
4. **Configure Environment Variables:**
   Expand the **Environment Variables** section and add the following keys:
   - `GEMINI_API_KEY`: Your Gemini API Key from Google AI Studio.
   - `GOOGLE_MAPS_PLATFORM_KEY`: Your Google Maps Places API Key.

5. **Deploy:**
   Click **Deploy**. Vercel will build the React frontend and bundle the Express app as a serverless function. Once finished, you will receive a public `.vercel.app` URL.

